/**
 * Completa el outcome humano de una fila shadow ya persistida.
 * No crea filas nuevas. No inventa matching. No muta ofertas.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  canApplyHumanOutcome,
  isQualityHumanOutcome,
  isUuid,
  mapModerationActionToHumanOutcome,
} from './identity';
import { recordCalibrationWrite } from './persistMetrics';
import { shouldSkipCalibrationPersistInTests } from './recordShadowOutcome';
import {
  HUMAN_OUTCOMES,
  SHADOW_OUTCOME_TABLE,
  type HumanActorKind,
  type HumanOutcome,
  type RecordHumanOutcomeInput,
  type RecordHumanOutcomeResult,
} from './types';

function adminClient(): SupabaseClient | null {
  try {
    return createServerClient();
  } catch {
    return null;
  }
}

function tableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes(SHADOW_OUTCOME_TABLE) && msg.includes('does not exist');
}

function isHumanOutcome(raw: string | null | undefined): raw is HumanOutcome {
  return HUMAN_OUTCOMES.includes((raw ?? '') as HumanOutcome);
}

export async function recordHumanOutcome(
  input: RecordHumanOutcomeInput,
  opts?: { supabase?: SupabaseClient | null; allowInTests?: boolean },
): Promise<RecordHumanOutcomeResult> {
  if (shouldSkipCalibrationPersistInTests(opts)) {
    return { applied: false, reason: 'test_skip' };
  }

  const offerId = input.offerId?.trim() ?? '';
  const outcome = input.outcome ?? null;
  if (!isUuid(offerId) || !outcome || !isHumanOutcome(outcome)) {
    return { applied: false, reason: 'invalid' };
  }

  const supabase = opts && 'supabase' in opts ? opts.supabase : adminClient();
  if (!supabase) {
    recordCalibrationWrite('human', false, 'no_client');
    return { applied: false, reason: 'no_client' };
  }

  const at = input.at && Number.isFinite(Date.parse(input.at)) ? new Date(input.at).toISOString() : new Date().toISOString();
  const actor: HumanActorKind = input.actorKind ?? 'human_moderator';

  try {
    const existing = await supabase
      .from(SHADOW_OUTCOME_TABLE)
      .select('id, human_outcome')
      .eq('offer_id', offerId);

    if (existing.error) {
      const reason = tableMissing(existing.error) ? 'table_missing' : 'error';
      recordCalibrationWrite('human', false, reason);
      return { applied: false, reason };
    }

    const rows = Array.isArray(existing.data) ? existing.data : [];
    if (rows.length === 0) {
      return { applied: false, reason: 'unmatched' };
    }
    if (rows.length > 1) {
      return { applied: false, reason: 'ambiguous' };
    }

    const current = isHumanOutcome(rows[0]?.human_outcome) ? rows[0].human_outcome : 'UNKNOWN';
    if (current === outcome) {
      recordCalibrationWrite('human', true);
      return {
        applied: true,
        offerId,
        outcome,
        idempotent: true,
        matchConfidence: 'offer_id',
      };
    }
    if (!canApplyHumanOutcome(current, outcome)) {
      return { applied: false, reason: 'append_only' };
    }

    const { error } = await supabase
      .from(SHADOW_OUTCOME_TABLE)
      .update({
        human_outcome: outcome,
        human_action_at: at,
        human_actor_kind: actor,
        match_confidence: 'offer_id',
        matched_at: isQualityHumanOutcome(outcome) ? at : null,
      })
      .eq('offer_id', offerId)
      .eq('id', rows[0].id);

    if (error) {
      const reason = tableMissing(error) ? 'table_missing' : 'error';
      recordCalibrationWrite('human', false, reason);
      return { applied: false, reason };
    }
    recordCalibrationWrite('human', true);
    return {
      applied: true,
      offerId,
      outcome,
      idempotent: false,
      matchConfidence: 'offer_id',
    };
  } catch {
    recordCalibrationWrite('human', false, 'error');
    return { applied: false, reason: 'error' };
  }
}

export async function captureHumanModerationOutcome(
  offerId: string | null | undefined,
  action: string | null | undefined,
  opts?: { supabase?: SupabaseClient | null; allowInTests?: boolean; actorKind?: HumanActorKind },
): Promise<RecordHumanOutcomeResult> {
  const outcome = mapModerationActionToHumanOutcome(action);
  if (!outcome) return { applied: false, reason: 'invalid' };
  return recordHumanOutcome(
    {
      offerId,
      outcome,
      actorKind: opts?.actorKind ?? 'human_moderator',
    },
    opts,
  );
}

/**
 * Expire automático (offer health / lifecycle). No es HUMAN_EXPIRED.
 * No entra a precision. UNKNOWN + system_lifecycle.
 */
export async function captureAutomaticExpireOutcome(
  offerId: string | null | undefined,
  opts?: { supabase?: SupabaseClient | null; allowInTests?: boolean },
): Promise<RecordHumanOutcomeResult> {
  return recordHumanOutcome(
    {
      offerId,
      outcome: 'UNKNOWN',
      actorKind: 'system_lifecycle',
    },
    opts,
  );
}
