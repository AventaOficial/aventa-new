/**
 * Distribution C2 — server-authoritative eligibility.
 *
 * PENDING ≠ APPROVED ≠ DISTRIBUTED
 *
 * Approval authority is offers.status (DB), never bot_meta / DealScore /
 * qualityDecision / wouldInsert / client-claimed status.
 *
 * Fail-closed. No HTTP. No Telegram. No side effects.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { isOfferTrackable } from '@/lib/server/trackableOffer';
import { isDistributionEngineEnabled } from './constants';
import { buildDistributionIdempotencyKey } from './idempotency';
import type { DistributionOfferSnapshot } from './types';

/** Structured C2 decisions — observability + callers. */
export type DistributionEligibilityDecision =
  | 'ELIGIBLE'
  | 'DISTRIBUTION_DISABLED'
  | 'INVALID_OFFER'
  | 'OFFER_MISSING'
  | 'PENDING'
  | 'REJECTED'
  | 'NOT_APPROVED'
  | 'EXPIRED'
  | 'ALREADY_DISTRIBUTED';

export type DistributionEligibilityResult = {
  decision: DistributionEligibilityDecision;
  /** True only when decision === ELIGIBLE. */
  eligible: boolean;
  reason: string;
  offerId: string | null;
  status: string | null;
  expiresAt: string | null;
};

export type DistributionEligibilityInput = {
  /** Canonical offer id — never trust client status. */
  offerId: string;
  supabase?: SupabaseClient;
  env?: NodeJS.ProcessEnv;
  nowMs?: number;
  /**
   * Optional: when checking a specific destination×version already published.
   * Does not create rows.
   */
  destinationId?: string | null;
  distributionVersion?: number;
};

function normalizeStatus(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

function isExpired(expiresAt: string | null | undefined, nowMs: number): boolean {
  if (!expiresAt) return false;
  const exp = Date.parse(expiresAt);
  return Number.isFinite(exp) && exp < nowMs;
}

function result(
  partial: Omit<DistributionEligibilityResult, 'eligible'>,
): DistributionEligibilityResult {
  return {
    ...partial,
    eligible: partial.decision === 'ELIGIBLE',
  };
}

/**
 * Pure snapshot evaluator — status must come from a trusted server load.
 * Never pass client-forged status as authority.
 */
export function evaluateDistributionEligibilityFromSnapshot(
  offer: Pick<DistributionOfferSnapshot, 'id' | 'status' | 'expires_at'> | null,
  options?: {
    env?: NodeJS.ProcessEnv;
    nowMs?: number;
    /** When true (default), engine flag must be ON for ELIGIBLE. */
    requireEngineEnabled?: boolean;
  },
): DistributionEligibilityResult {
  const env = options?.env ?? process.env;
  const nowMs = options?.nowMs ?? Date.now();
  const requireEngine = options?.requireEngineEnabled !== false;

  if (requireEngine && !isDistributionEngineEnabled(env)) {
    return result({
      decision: 'DISTRIBUTION_DISABLED',
      reason: 'DISTRIBUTION_ENGINE_ENABLED is off',
      offerId: offer?.id ?? null,
      status: offer ? normalizeStatus(offer.status) : null,
      expiresAt: offer?.expires_at ?? null,
    });
  }

  if (!offer?.id) {
    return result({
      decision: 'OFFER_MISSING',
      reason: 'offer_missing',
      offerId: null,
      status: null,
      expiresAt: null,
    });
  }

  const status = normalizeStatus(offer.status);
  if (!status) {
    return result({
      decision: 'INVALID_OFFER',
      reason: 'status_empty',
      offerId: offer.id,
      status: null,
      expiresAt: offer.expires_at ?? null,
    });
  }

  if (status === 'pending') {
    return result({
      decision: 'PENDING',
      reason: 'pending_not_distributable',
      offerId: offer.id,
      status,
      expiresAt: offer.expires_at ?? null,
    });
  }

  if (status === 'rejected') {
    return result({
      decision: 'REJECTED',
      reason: 'rejected_not_distributable',
      offerId: offer.id,
      status,
      expiresAt: offer.expires_at ?? null,
    });
  }

  // Only approved | published are live for Distribution.
  if (status !== 'approved' && status !== 'published') {
    return result({
      decision: 'NOT_APPROVED',
      reason: `status_not_live:${status}`,
      offerId: offer.id,
      status,
      expiresAt: offer.expires_at ?? null,
    });
  }

  if (isExpired(offer.expires_at, nowMs)) {
    return result({
      decision: 'EXPIRED',
      reason: 'expired',
      offerId: offer.id,
      status,
      expiresAt: offer.expires_at ?? null,
    });
  }

  return result({
    decision: 'ELIGIBLE',
    reason: 'approved_or_published_live',
    offerId: offer.id,
    status,
    expiresAt: offer.expires_at ?? null,
  });
}

/**
 * Server-side eligibility: loads offers.status from DB (authority).
 * Ignores any client-claimed status / bot_meta / DealScore.
 */
export async function evaluateDistributionEligibility(
  input: DistributionEligibilityInput,
): Promise<DistributionEligibilityResult> {
  const env = input.env ?? process.env;
  const nowMs = input.nowMs ?? Date.now();
  const offerId = (input.offerId ?? '').trim();

  if (!offerId) {
    return result({
      decision: 'INVALID_OFFER',
      reason: 'offer_id_required',
      offerId: null,
      status: null,
      expiresAt: null,
    });
  }

  if (!isDistributionEngineEnabled(env)) {
    return result({
      decision: 'DISTRIBUTION_DISABLED',
      reason: 'DISTRIBUTION_ENGINE_ENABLED is off',
      offerId,
      status: null,
      expiresAt: null,
    });
  }

  const supabase = input.supabase ?? createServerClient();
  const { data: offerRow, error } = await supabase
    .from('offers')
    .select('id, status, expires_at, category, coupons, bank_coupon')
    .eq('id', offerId)
    .maybeSingle();

  if (error) {
    console.error('[distribution] eligibility load failed:', error.message);
    return result({
      decision: 'INVALID_OFFER',
      reason: `offer_load_failed:${error.message.slice(0, 120)}`,
      offerId,
      status: null,
      expiresAt: null,
    });
  }

  if (!offerRow) {
    return result({
      decision: 'OFFER_MISSING',
      reason: 'offer_missing',
      offerId,
      status: null,
      expiresAt: null,
    });
  }

  const base = evaluateDistributionEligibilityFromSnapshot(
    offerRow as DistributionOfferSnapshot,
    { env, nowMs, requireEngineEnabled: true },
  );
  if (!base.eligible) return base;

  const destinationId = (input.destinationId ?? '').trim();
  if (destinationId) {
    const version = input.distributionVersion ?? 1;
    const idempotencyKey = buildDistributionIdempotencyKey({
      offerId,
      destinationId,
      distributionVersion: version,
    });
    const { data: existing } = await supabase
      .from('distribution_publications')
      .select('id, status')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    const pubStatus = normalizeStatus(existing?.status);
    if (pubStatus === 'published') {
      return result({
        decision: 'ALREADY_DISTRIBUTED',
        reason: 'publication_already_published',
        offerId,
        status: base.status,
        expiresAt: base.expiresAt,
      });
    }
  }

  return base;
}

/**
 * Boolean distributable predicate (C1 compat).
 * Status authority only — does NOT require engine flag (callers gate flag separately).
 * Still fails closed on pending/rejected/expired via same snapshot rules.
 */
export async function isOfferDistributable(
  offerId: string,
  supabase?: SupabaseClient,
): Promise<boolean> {
  // Keep trackable query as live OR of approved|published ∧ ¬expired,
  // then re-assert via C2 snapshot so pending can never slip through a drift.
  const trackable = await isOfferTrackable(offerId, supabase);
  if (!trackable) return false;
  const client = supabase ?? createServerClient();
  const { data } = await client
    .from('offers')
    .select('id, status, expires_at')
    .eq('id', offerId)
    .maybeSingle();
  if (!data) return false;
  const r = evaluateDistributionEligibilityFromSnapshot(data as DistributionOfferSnapshot, {
    requireEngineEnabled: false,
  });
  return r.eligible;
}

/**
 * Pure check for tests / snapshots without DB.
 * Mirrors C2 taxonomy; does not invent approval.
 */
export function isOfferSnapshotDistributable(
  offer: Pick<DistributionOfferSnapshot, 'status' | 'expires_at'>,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  const r = evaluateDistributionEligibilityFromSnapshot(
    { id: 'snapshot', status: offer.status, expires_at: offer.expires_at },
    { nowMs, requireEngineEnabled: false },
  );
  if (r.eligible) return { ok: true };
  return { ok: false, reason: r.reason };
}

/** Coupon signal for coupons destinations — no invented coupons. */
export function offerHasCouponSignal(
  offer: Pick<DistributionOfferSnapshot, 'coupons' | 'bank_coupon'>,
): boolean {
  return Boolean(offer.coupons?.trim() || offer.bank_coupon?.trim());
}

/**
 * Hard assert used by executors: pending can never proceed.
 * Fail-closed even if a caller forgot eligibility.
 */
export function assertNotPendingForDistribution(status: string | null | undefined): void {
  if (normalizeStatus(status) === 'pending') {
    throw new Error('DISTRIBUTION_C2: pending offers cannot enter Distribution');
  }
}
