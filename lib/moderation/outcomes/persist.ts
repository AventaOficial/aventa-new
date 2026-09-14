/**
 * Persistencia fail-soft de moderation outcomes.
 * Nunca debe bloquear una decisión válida de moderación.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  buildModerationOutcome,
  MODERATION_OUTCOME_TABLE,
  type BuildModerationOutcomeInput,
  type ModerationOutcomeRecord,
} from './contract';

export type PersistModerationOutcomeResult =
  | { ok: true; idempotent: boolean; offerId: string; decision: string }
  | { ok: false; reason: string };

function tableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes(MODERATION_OUTCOME_TABLE) && (msg.includes('does not exist') || msg.includes('schema cache'));
}

function uniqueViolation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

function rowFromRecord(record: ModerationOutcomeRecord) {
  return {
    offer_id: record.offer_id,
    decision: record.decision,
    moderator_id: record.moderator_id,
    decision_at: record.decision_at,
    offer_submitted_at: record.offer_submitted_at,
    time_from_submission_ms: record.time_from_submission_ms,
    priority_at_decision: record.priority_at_decision,
    source: record.source,
    source_lane: record.source_lane,
    quality_classification: record.quality_classification,
    evidence_classification: record.evidence_classification,
    is_duplicate: record.is_duplicate,
    artificial_discount: record.artificial_discount,
    affiliate_ready: record.affiliate_ready,
    rejection_reason: record.rejection_reason,
    snooze_minutes: record.snooze_minutes,
    idempotency_key: record.idempotency_key,
    contract_version: record.contract_version,
    meta: record.meta,
  };
}

/**
 * Inserta un outcome. Fail-soft: errores → ok:false, no throw.
 */
export async function persistModerationOutcome(
  input: BuildModerationOutcomeInput,
  opts?: { supabase?: SupabaseClient | null },
): Promise<PersistModerationOutcomeResult> {
  let record: ModerationOutcomeRecord;
  try {
    record = buildModerationOutcome(input);
  } catch (err) {
    console.error('[moderation-outcomes] build failed:', err);
    return { ok: false, reason: 'build_failed' };
  }

  let supabase: SupabaseClient | null = null;
  try {
    supabase = opts && 'supabase' in opts ? opts.supabase ?? null : createServerClient();
  } catch {
    return { ok: false, reason: 'no_client' };
  }
  if (!supabase) return { ok: false, reason: 'no_client' };

  try {
    const { error } = await supabase.from(MODERATION_OUTCOME_TABLE).insert(rowFromRecord(record));
    if (!error) {
      return {
        ok: true,
        idempotent: false,
        offerId: record.offer_id,
        decision: record.decision,
      };
    }
    if (uniqueViolation(error)) {
      return {
        ok: true,
        idempotent: true,
        offerId: record.offer_id,
        decision: record.decision,
      };
    }
    if (tableMissing(error)) {
      console.warn('[moderation-outcomes] table missing — apply migration');
      return { ok: false, reason: 'table_missing' };
    }
    console.error('[moderation-outcomes] insert failed:', error.message);
    return { ok: false, reason: 'insert_failed' };
  } catch (err) {
    console.error('[moderation-outcomes] unexpected:', err);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Fire-and-forget: no await en callers críticos.
 */
export function recordModerationOutcomeFireAndForget(
  input: BuildModerationOutcomeInput,
  opts?: { supabase?: SupabaseClient | null },
): void {
  void persistModerationOutcome(input, opts).catch((err) => {
    console.error('[moderation-outcomes] fire-and-forget:', err);
  });
}
