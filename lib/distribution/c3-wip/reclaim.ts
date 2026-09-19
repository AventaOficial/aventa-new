/**
 * Distribution C3 WIP — ISOLATED from C1/C2 compile + runtime surface.
 *
 * WHY THIS FILE IS NOT UNDER lib/distribution/*.ts:
 * - Uses event types publication_reclaimed / publication_unknown_outcome
 * - Uses publication status unknown_outcome
 * - Those require the unapplied migration
 *   docs/supabase-migrations/20260918_distribution_c3_unknown_outcome.sql
 * - C1 contract (DISTRIBUTION_EVENT_TYPES / PUBLICATION_STATUSES) must stay closed
 *
 * Excluded via tsconfig.json → "lib/distribution/c3-wip".
 * Not exported from lib/distribution/index.ts.
 * Not imported by drain/enqueue/eligibility.
 *
 * Do NOT wire into drain/cron until C3 is an approved campaign.
 *
 * --- original header ---
 * Distribution C3 — lease, reclaim, UNKNOWN_OUTCOME classification.
 *
 * Lease authority while status=publishing: updated_at (claim/reclaim CAS stamp).
 * UNKNOWN_OUTCOME ≠ FAILED_RETRYABLE — never auto-republish without reconcile.
 *
 * No HTTP. No Telegram. Fail-closed. Flag-gated at drain entry.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { appendDistributionEvent } from './events';
import { distributionBackoffMinutes } from './claim';

/** Default publishing lease — claim stamp (updated_at) older than this is reclaimable. */
export const DISTRIBUTION_PUBLISHING_LEASE_MS = 5 * 60_000;

export type ReclaimDecision =
  | 'RETRYABLE_NO_SIDE_EFFECT'
  | 'UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE'
  | 'PUBLISHED_FROM_EXTERNAL_MESSAGE_ID'
  | 'LEASE_ACTIVE'
  | 'NOT_PUBLISHING'
  | 'CAS_LOST';

export type ReclaimResult = {
  scanned: number;
  reclaimedRetryable: number;
  reclaimedUnknown: number;
  reclaimedPublished: number;
  skippedActiveLease: number;
  casLost: number;
};

export type PublishingLeaseSnapshot = {
  id: string;
  offer_id: string;
  destination_id: string;
  status: string;
  updated_at: string;
  attempt_count: number;
  idempotency_key: string;
  external_message_id: string | null;
  last_error_code: string | null;
};

/**
 * Pure: has the publishing lease expired?
 * Ownership version = updated_at at claim time.
 */
export function isPublishingLeaseExpired(
  updatedAtIso: string,
  nowMs: number,
  leaseMs: number = DISTRIBUTION_PUBLISHING_LEASE_MS,
): boolean {
  const started = Date.parse(updatedAtIso);
  if (!Number.isFinite(started)) return true; // fail-closed: treat invalid stamp as expired
  return nowMs - started >= leaseMs;
}

/**
 * Pure classify after lease expiry, given side-effect evidence.
 * Case A: no external attempt recorded → safe retryable.
 * Case B: publish_attempt (or stronger) recorded → UNKNOWN_OUTCOME.
 */
export function classifyExpiredPublishingReclaim(input: {
  sideEffectMayHaveStarted: boolean;
  alreadyHasExternalMessageId: boolean;
}): 'ALREADY_PUBLISHED_HINT' | 'RETRYABLE_NO_SIDE_EFFECT' | 'UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE' {
  if (input.alreadyHasExternalMessageId) return 'ALREADY_PUBLISHED_HINT';
  if (input.sideEffectMayHaveStarted) return 'UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE';
  return 'RETRYABLE_NO_SIDE_EFFECT';
}

/**
 * Detect whether drain recorded a publish_attempt at/after this lease stamp.
 * Authority: distribution_events (append-only), not client state.
 */
export async function detectPublishSideEffectStarted(
  supabase: SupabaseClient,
  publicationId: string,
  leaseStartedAtIso: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('distribution_events')
    .select('id, event_type, meta, created_at')
    .eq('publication_id', publicationId)
    .eq('event_type', 'publication_attempted')
    .gte('created_at', leaseStartedAtIso)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[distribution] side-effect detect failed:', error.message);
    // Fail closed: assume side effect may have started → UNKNOWN path.
    return true;
  }

  for (const row of data ?? []) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const phase = String(meta.phase ?? '');
    if (phase === 'publish_attempt') return true;
  }
  return false;
}

/**
 * Atomic reclaim of one stuck publishing row.
 * CAS: status=publishing AND updated_at = leaseStamp (ownership version).
 */
export async function reclaimStuckPublishingPublication(
  supabase: SupabaseClient,
  row: PublishingLeaseSnapshot,
  options?: { nowMs?: number; leaseMs?: number },
): Promise<ReclaimDecision> {
  const nowMs = options?.nowMs ?? Date.now();
  const leaseMs = options?.leaseMs ?? DISTRIBUTION_PUBLISHING_LEASE_MS;

  if (String(row.status).toLowerCase() !== 'publishing') {
    return 'NOT_PUBLISHING';
  }
  if (!isPublishingLeaseExpired(row.updated_at, nowMs, leaseMs)) {
    return 'LEASE_ACTIVE';
  }

  const nowIso = new Date(nowMs).toISOString();

  // Already have provider message id → prefer published (definitive success recovered).
  if (row.external_message_id) {
    const { data, error } = await supabase
      .from('distribution_publications')
      .update({
        status: 'published',
        published_at: nowIso,
        updated_at: nowIso,
        last_error_code: null,
        last_error_message: null,
      })
      .eq('id', row.id)
      .eq('status', 'publishing')
      .eq('updated_at', row.updated_at)
      .select('id')
      .maybeSingle();
    if (error || !data) return 'CAS_LOST';
    await appendDistributionEvent(supabase, {
      publicationId: row.id,
      eventType: 'publication_reclaimed',
      meta: {
        decision: 'published_from_external_message_id',
        offer_id: row.offer_id,
        destination_id: row.destination_id,
        attempt_count: row.attempt_count,
        lease_started_at: row.updated_at,
        idempotency_key: row.idempotency_key,
      },
    });
    await appendDistributionEvent(supabase, {
      publicationId: row.id,
      eventType: 'publication_published',
      meta: { via: 'reclaim', reused_external_message_id: true },
    });
    return 'PUBLISHED_FROM_EXTERNAL_MESSAGE_ID';
  }

  const sideEffect = await detectPublishSideEffectStarted(
    supabase,
    row.id,
    row.updated_at,
  );
  const classified = classifyExpiredPublishingReclaim({
    sideEffectMayHaveStarted: sideEffect,
    alreadyHasExternalMessageId: false,
  });

  if (classified === 'UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE') {
    const { data, error } = await supabase
      .from('distribution_publications')
      .update({
        status: 'unknown_outcome',
        last_error_code: 'UNKNOWN_OUTCOME',
        last_error_message: 'lease_expired_after_possible_external_side_effect',
        updated_at: nowIso,
      })
      .eq('id', row.id)
      .eq('status', 'publishing')
      .eq('updated_at', row.updated_at)
      .select('id')
      .maybeSingle();
    if (error || !data) return 'CAS_LOST';
    await appendDistributionEvent(supabase, {
      publicationId: row.id,
      eventType: 'publication_reclaimed',
      meta: {
        decision: 'unknown_outcome',
        offer_id: row.offer_id,
        destination_id: row.destination_id,
        attempt_count: row.attempt_count,
        lease_started_at: row.updated_at,
        idempotency_key: row.idempotency_key,
      },
    });
    await appendDistributionEvent(supabase, {
      publicationId: row.id,
      eventType: 'publication_unknown_outcome',
      meta: {
        reason: 'lease_expired_side_effect_possible',
        attempt_count: row.attempt_count,
        idempotency_key: row.idempotency_key,
      },
    });
    return 'UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE';
  }

  // Case A: no side effect evidence → safe to re-queue as retryable (same idempotency_key).
  const delayMin = distributionBackoffMinutes(Math.max(1, row.attempt_count));
  const next = new Date(nowMs + delayMin * 60_000).toISOString();
  const { data, error } = await supabase
    .from('distribution_publications')
    .update({
      status: 'retryable',
      next_attempt_at: next,
      last_error_code: 'publishing_lease_expired_no_side_effect',
      last_error_message: 'reclaimed before external publish_attempt',
      updated_at: nowIso,
    })
    .eq('id', row.id)
    .eq('status', 'publishing')
    .eq('updated_at', row.updated_at)
    .select('id')
    .maybeSingle();
  if (error || !data) return 'CAS_LOST';
  await appendDistributionEvent(supabase, {
    publicationId: row.id,
    eventType: 'publication_reclaimed',
    meta: {
      decision: 'retryable_no_side_effect',
      offer_id: row.offer_id,
      destination_id: row.destination_id,
      attempt_count: row.attempt_count,
      next_attempt_at: next,
      lease_started_at: row.updated_at,
      idempotency_key: row.idempotency_key,
    },
  });
  await appendDistributionEvent(supabase, {
    publicationId: row.id,
    eventType: 'publication_retryable',
    meta: {
      code: 'publishing_lease_expired_no_side_effect',
      next_attempt_at: next,
      via: 'reclaim',
    },
  });
  return 'RETRYABLE_NO_SIDE_EFFECT';
}

/**
 * Scan + CAS reclaim stuck publishing rows. Never calls providers.
 */
export async function reclaimStuckPublishingPublications(
  supabase: SupabaseClient,
  options?: { limit?: number; nowMs?: number; leaseMs?: number },
): Promise<ReclaimResult> {
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 50));
  const nowMs = options?.nowMs ?? Date.now();
  const leaseMs = options?.leaseMs ?? DISTRIBUTION_PUBLISHING_LEASE_MS;
  const leaseExpiredBefore = new Date(nowMs - leaseMs).toISOString();

  const { data: candidates, error } = await supabase
    .from('distribution_publications')
    .select(
      'id, offer_id, destination_id, status, updated_at, attempt_count, idempotency_key, external_message_id, last_error_code',
    )
    .eq('status', 'publishing')
    .lte('updated_at', leaseExpiredBefore)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error || !candidates?.length) {
    if (error) console.error('[distribution] reclaim scan failed:', error.message);
    return {
      scanned: 0,
      reclaimedRetryable: 0,
      reclaimedUnknown: 0,
      skippedActiveLease: 0,
      casLost: 0,
    };
  }

  let reclaimedRetryable = 0;
  let reclaimedUnknown = 0;
  let skippedActiveLease = 0;
  let casLost = 0;

  for (const raw of candidates) {
    const row = raw as PublishingLeaseSnapshot;
    const decision = await reclaimStuckPublishingPublication(supabase, row, {
      nowMs,
      leaseMs,
    });
    if (decision === 'RETRYABLE_NO_SIDE_EFFECT') reclaimedRetryable += 1;
    else if (decision === 'UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE') reclaimedUnknown += 1;
    else if (decision === 'LEASE_ACTIVE') skippedActiveLease += 1;
    else if (decision === 'CAS_LOST') casLost += 1;
  }

  return {
    scanned: candidates.length,
    reclaimedRetryable,
    reclaimedUnknown,
    skippedActiveLease,
    casLost,
  };
}

/**
 * Explicit ops/reconcile path: release unknown_outcome → retryable ONLY after
 * human/provider confirmation that the side effect did NOT occur.
 * Never called automatically from drain.
 */
export async function releaseUnknownOutcomeToRetryable(
  supabase: SupabaseClient,
  publicationId: string,
  options?: { nowMs?: number; reason?: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const { data, error } = await supabase
    .from('distribution_publications')
    .update({
      status: 'retryable',
      next_attempt_at: nowIso,
      last_error_code: 'unknown_reconciled_not_published',
      last_error_message: (options?.reason ?? 'reconciled_not_published').slice(0, 500),
      updated_at: nowIso,
    })
    .eq('id', publicationId)
    .eq('status', 'unknown_outcome')
    .select('id, attempt_count, idempotency_key')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: 'cas_lost_or_not_unknown' };

  await appendDistributionEvent(supabase, {
    publicationId,
    eventType: 'publication_retryable',
    meta: {
      via: 'unknown_reconcile',
      reason: options?.reason ?? 'reconciled_not_published',
      idempotency_key: (data as { idempotency_key?: string }).idempotency_key,
    },
  });
  return { ok: true };
}

/**
 * Mark currently-owned publishing row as UNKNOWN_OUTCOME (adapter ambiguous).
 * CAS on status=publishing only — stale workers lose.
 */
export async function markPublishingUnknownOutcome(
  supabase: SupabaseClient,
  input: {
    publicationId: string;
    attemptCount: number;
    idempotencyKey: string;
    code: string;
    message: string;
    nowMs?: number;
  },
): Promise<boolean> {
  const nowIso = new Date(input.nowMs ?? Date.now()).toISOString();
  const { data, error } = await supabase
    .from('distribution_publications')
    .update({
      status: 'unknown_outcome',
      last_error_code: input.code.slice(0, 120),
      last_error_message: input.message.slice(0, 500),
      updated_at: nowIso,
    })
    .eq('id', input.publicationId)
    .eq('status', 'publishing')
    .select('id')
    .maybeSingle();

  if (error || !data) return false;

  await appendDistributionEvent(supabase, {
    publicationId: input.publicationId,
    eventType: 'publication_unknown_outcome',
    meta: {
      code: input.code,
      message: input.message.slice(0, 200),
      attempt_count: input.attemptCount,
      idempotency_key: input.idempotencyKey,
    },
  });
  return true;
}
