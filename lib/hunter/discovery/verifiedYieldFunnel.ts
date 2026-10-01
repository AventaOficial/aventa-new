/**
 * Day 7 — VERIFIED-yield funnel + nearReady day buckets.
 * Extends Day 6 source funnel; does not replace DQE/S6.1.
 */

import type { VerifiedYieldTerminalReason } from './verifiedYieldTerminal';
import type { SourceFunnelStageCounts } from '@/lib/bots/ingest/sourceFunnelMetrics';

export type NearReadyDayBuckets = {
  /** priorDays = minHistory-1 → 1 calendar day from historyReady */
  one_day_away: number;
  /** priorDays = minHistory-2 */
  two_days_away: number;
  /** priorDays = minHistory-3 (or 1 prior day when min=4) */
  three_days_away: number;
  /** Aggregate pool size (1..minHistory-1 prior days) */
  pool_near_ready: number;
};

export type VerifiedYieldRates = {
  /** dqe_verified / identity_valid */
  verified_yield: number | null;
  /** s61_pass / dqe_verified */
  s61_yield: number | null;
  /** insufficient_history terminals / identity_valid */
  history_block_rate: number | null;
  /** artificial_list_price / identity_valid */
  artificial_price_rate: number | null;
  /** Day 11 — s61_pass among historyReady-evaluated candidates */
  history_ready_to_s61_yield?: number | null;
};

export type VerifiedYieldFunnel = {
  cycle_id: string;
  discovered: number;
  canonicalized: number;
  identity_valid: number;
  pm_ready: number;
  offer_standard_pass: number;
  dqe_verified: number;
  dqe_potential: number;
  s61_pass: number;
  s61_blocked: number;
  duplicate: number;
  stale: number;
  insufficient_history: number;
  artificial_price: number;
  provenance_failure: number;
  availability_failure: number;
  confidence_failure: number;
  human_review: number;
  pending: number;
  dry_run_would_insert: number;
  fetch_blocked: number;
  extraction_failed: number;
  other: number;
  near_ready: NearReadyDayBuckets;
  rates: VerifiedYieldRates;
  terminal_reason_counts: Partial<Record<VerifiedYieldTerminalReason, number>>;
  by_source?: Record<string, SourceFunnelStageCounts>;
};

export function emptyNearReadyBuckets(): NearReadyDayBuckets {
  return {
    one_day_away: 0,
    two_days_away: 0,
    three_days_away: 0,
    pool_near_ready: 0,
  };
}

export function emptyVerifiedYieldFunnel(cycleId: string): VerifiedYieldFunnel {
  return {
    cycle_id: cycleId,
    discovered: 0,
    canonicalized: 0,
    identity_valid: 0,
    pm_ready: 0,
    offer_standard_pass: 0,
    dqe_verified: 0,
    dqe_potential: 0,
    s61_pass: 0,
    s61_blocked: 0,
    duplicate: 0,
    stale: 0,
    insufficient_history: 0,
    artificial_price: 0,
    provenance_failure: 0,
    availability_failure: 0,
    confidence_failure: 0,
    human_review: 0,
    pending: 0,
    dry_run_would_insert: 0,
    fetch_blocked: 0,
    extraction_failed: 0,
    other: 0,
    near_ready: emptyNearReadyBuckets(),
    rates: {
      verified_yield: null,
      s61_yield: null,
      history_block_rate: null,
      artificial_price_rate: null,
    },
    terminal_reason_counts: {},
  };
}

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 10000) / 10000;
}

export function bumpTerminalReason(
  funnel: VerifiedYieldFunnel,
  reason: VerifiedYieldTerminalReason,
): void {
  funnel.terminal_reason_counts[reason] =
    (funnel.terminal_reason_counts[reason] ?? 0) + 1;
  switch (reason) {
    case 'DUPLICATE':
      funnel.duplicate += 1;
      break;
    case 'STALE':
      funnel.stale += 1;
      break;
    case 'INSUFFICIENT_HISTORY':
      funnel.insufficient_history += 1;
      break;
    case 'ARTIFICIAL_LIST_PRICE':
      funnel.artificial_price += 1;
      break;
    case 'PROVENANCE_FAILURE':
      funnel.provenance_failure += 1;
      break;
    case 'AVAILABILITY_FAILURE':
      funnel.availability_failure += 1;
      break;
    case 'CONFIDENCE_FAILURE':
      funnel.confidence_failure += 1;
      break;
    case 'HUMAN_REVIEW':
      funnel.human_review += 1;
      break;
    case 'PENDING':
      funnel.pending += 1;
      break;
    case 'DRY_RUN_WOULD_INSERT':
      funnel.dry_run_would_insert += 1;
      break;
    case 'FETCH_BLOCKED':
      funnel.fetch_blocked += 1;
      break;
    case 'EXTRACTION_FAILED':
      funnel.extraction_failed += 1;
      break;
    case 'DQE_POTENTIAL':
    case 'DQE_REJECT':
      break;
    default:
      if (reason === 'OTHER' || reason === 'S61_SUPPRESSED' || reason === 'WRITER_BLOCK') {
        funnel.other += 1;
      }
      break;
  }
}

export function finalizeVerifiedYieldRates(funnel: VerifiedYieldFunnel): VerifiedYieldFunnel {
  const id = funnel.identity_valid;
  funnel.rates = {
    verified_yield: rate(funnel.dqe_verified, id),
    s61_yield: rate(funnel.s61_pass, funnel.dqe_verified),
    history_block_rate: rate(funnel.insufficient_history, id),
    artificial_price_rate: rate(funnel.artificial_price, id),
  };
  return funnel;
}

/**
 * Allocate near-ready acquisition budget:
 * 50% → 1 day away, 30% → 2 days, 20% → 3+ days.
 * Never fabricates observations; only picks from ranked eligible pools.
 */
export function allocateNearReadyBudget(input: {
  oneDayAway: { productId: string }[];
  twoDaysAway: { productId: string }[];
  threePlusDaysAway: { productId: string }[];
  maxTargets: number;
}): { pickedIds: string[]; allocation: { one: number; two: number; threePlus: number } } {
  const max = Math.max(0, Math.floor(input.maxTargets));
  if (max === 0) {
    return { pickedIds: [], allocation: { one: 0, two: 0, threePlus: 0 } };
  }

  const oneBudget = Math.min(max, Math.max(1, Math.floor(max * 0.5)));
  const twoBudget = Math.min(
    Math.max(0, max - oneBudget),
    Math.max(max >= 2 ? 1 : 0, Math.floor(max * 0.3)),
  );
  const threeBudget = Math.max(0, max - oneBudget - twoBudget);

  const picked: string[] = [];
  const take = (pool: { productId: string }[], n: number) => {
    for (const row of pool) {
      if (picked.length >= max) break;
      if (n <= 0) break;
      if (picked.includes(row.productId)) continue;
      picked.push(row.productId);
      n -= 1;
    }
    return n;
  };

  take(input.oneDayAway, oneBudget);
  take(input.twoDaysAway, twoBudget);
  take(input.threePlusDaysAway, threeBudget);

  if (picked.length < max) take(input.oneDayAway, max - picked.length);
  if (picked.length < max) take(input.twoDaysAway, max - picked.length);
  if (picked.length < max) take(input.threePlusDaysAway, max - picked.length);

  return {
    pickedIds: picked,
    allocation: {
      one: oneBudget,
      two: twoBudget,
      threePlus: threeBudget,
    },
  };
}
