/**
 * Write path de shadow outcomes. Nunca lanza.
 * Solo persiste cuando hay offer_id (identidad fiable).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { AUTONOMOUS_DECISION_POLICY_V1 } from '../policy';
import { classifyShadowReasons, isShadowReasonCode, type ShadowReasonCode } from '../reasonCodes';
import type { AutonomousDecision, AutonomousDecisionResult } from '../types';
import { isUuid, sourceFamilyForCalibration } from './identity';
import { recordCalibrationWrite } from './persistMetrics';
import {
  SHADOW_OUTCOME_TABLE,
  type RecordShadowOutcomeInput,
  type RecordShadowOutcomeResult,
  type ShadowOutcomeRow,
} from './types';

const DECISIONS = new Set<AutonomousDecision>(['AUTO_APPROVE', 'HUMAN_REVIEW', 'AUTO_REJECT']);

function sanitizeToken(raw: string, max: number): string {
  return raw.trim().slice(0, max).replace(/[^\w.:-]/g, '_');
}

function clampScore(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

function clampConfidence(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

function compactStatus(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase().slice(0, 24);
  if (!v || !/^[a-z0-9_]+$/.test(v)) return null;
  return v;
}

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

function uniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

export function shouldSkipCalibrationPersistInTests(opts?: { allowInTests?: boolean }): boolean {
  if (opts?.allowInTests) return false;
  return process.env.VITEST === 'true';
}

export function normalizeShadowOutcomeInput(input: RecordShadowOutcomeInput): ShadowOutcomeRow | null {
  const offerId = input.offerId?.trim() ?? '';
  if (!isUuid(offerId)) return null;
  const decision = input.shadowDecision ?? null;
  if (!decision || !DECISIONS.has(decision)) return null;
  const sourceId = sanitizeToken(input.sourceId ?? '', 64);
  if (!sourceId) return null;

  const reasonCodes = (input.reasonCodes ?? [])
    .filter((code): code is ShadowReasonCode => typeof code === 'string' && isShadowReasonCode(code))
    .slice(0, 16);

  const cycle = input.shadowCycleId?.trim() ?? '';
  const creator = input.creatorId?.trim() ?? '';
  const fingerprint = input.fingerprint?.trim().slice(0, 128) || null;
  const qualification = compactStatus(input.qualification);

  return {
    offer_id: offerId,
    fingerprint,
    shadow_cycle_id: isUuid(cycle) ? cycle : null,
    shadow_decision: decision,
    human_outcome: 'HUMAN_PENDING',
    match_confidence: 'unmatched',
    matched_at: null,
    human_action_at: null,
    human_actor_kind: null,
    source_id: sourceId,
    source_family: sanitizeToken(
      input.sourceFamily?.trim() || sourceFamilyForCalibration(sourceId, input.sourceDetail),
      32,
    ),
    score: clampScore(input.score),
    confidence: clampConfidence(input.confidence),
    qualification,
    reason_codes: reasonCodes,
    duplicate_status: compactStatus(input.duplicateStatus),
    seller_status: compactStatus(input.sellerStatus),
    image_status: compactStatus(input.imageStatus),
    monetization_status: compactStatus(input.monetizationStatus),
    policy_version: (input.policyVersion?.trim() || AUTONOMOUS_DECISION_POLICY_V1).slice(0, 80),
    creator_id: isUuid(creator) ? creator : null,
  };
}

export async function recordShadowOutcome(
  input: RecordShadowOutcomeInput,
  opts?: { supabase?: SupabaseClient | null; allowInTests?: boolean },
): Promise<RecordShadowOutcomeResult> {
  if (shouldSkipCalibrationPersistInTests(opts)) {
    return { persisted: false, reason: 'test_skip' };
  }

  const row = normalizeShadowOutcomeInput(input);
  if (!row) return { persisted: false, reason: 'invalid' };

  const supabase = opts && 'supabase' in opts ? opts.supabase : adminClient();
  if (!supabase) {
    recordCalibrationWrite('shadow', false, 'no_client');
    return { persisted: false, reason: 'no_client' };
  }

  try {
    const { error } = await supabase.from(SHADOW_OUTCOME_TABLE).insert([row]);
    if (!error) {
      recordCalibrationWrite('shadow', true);
      return { persisted: true, offerId: row.offer_id, duplicate: false };
    }
    if (uniqueViolation(error)) {
      recordCalibrationWrite('shadow', true);
      return { persisted: true, offerId: row.offer_id, duplicate: true };
    }
    const reason = tableMissing(error) ? 'table_missing' : 'error';
    recordCalibrationWrite('shadow', false, reason);
    return { persisted: false, reason };
  } catch {
    recordCalibrationWrite('shadow', false, 'error');
    return { persisted: false, reason: 'error' };
  }
}

export async function recordShadowOutcomeFromAutonomous(
  input: {
    offerId?: string | null;
    result?: AutonomousDecisionResult | null;
    sourceId?: string | null;
    sourceDetail?: string | null;
    sourceFamily?: string | null;
    fingerprint?: string | null;
    shadowCycleId?: string | null;
    qualification?: string | null;
    creatorId?: string | null;
  },
  opts?: { supabase?: SupabaseClient | null; allowInTests?: boolean },
): Promise<RecordShadowOutcomeResult> {
  const result = input.result;
  if (!result) return { persisted: false, reason: 'invalid' };
  return recordShadowOutcome(
    {
      offerId: input.offerId,
      fingerprint: input.fingerprint,
      shadowCycleId: input.shadowCycleId,
      shadowDecision: result.decision,
      sourceId: input.sourceId,
      sourceFamily: input.sourceFamily,
      sourceDetail: input.sourceDetail,
      score: result.score,
      confidence: result.confidence,
      qualification: input.qualification,
      reasonCodes: classifyShadowReasons(result),
      duplicateStatus: result.checks.duplicate.status,
      sellerStatus: result.checks.seller.status,
      imageStatus: result.checks.image.status,
      monetizationStatus: result.checks.monetization.status,
      policyVersion: result.policyVersion,
      creatorId: input.creatorId,
    },
    opts,
  );
}
