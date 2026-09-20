/**
 * CazaOfertasss — FASE 3. Métricas derivadas del ledger (recalculables).
 */

import type { AffiliateNetworkId, MoneyAmount } from '../types';
import type { AffiliateRevenueEvent } from './ledger';
import type { RevenueAttributionRecord } from './types';
import type { DerivedRevenueMetrics } from './types';

function addMoney(
  acc: MoneyAmount | null,
  next: MoneyAmount | null
): MoneyAmount | null {
  if (!next) return acc;
  if (!acc) return { ...next };
  if (acc.currency !== next.currency) return null;
  return { value: Math.round((acc.value + next.value) * 100) / 100, currency: acc.currency };
}

export function computeDerivedRevenueMetrics(input: {
  readonly events: readonly AffiliateRevenueEvent[];
  readonly attributions: readonly RevenueAttributionRecord[];
  readonly provider?: AffiliateNetworkId | '*';
  readonly computedAt: string;
}): DerivedRevenueMetrics {
  const provider = input.provider ?? '*';
  const events =
    provider === '*'
      ? input.events
      : input.events.filter((e) => e.network === provider);

  let clicks = 0;
  let ordersPending = 0;
  let ordersApproved = 0;
  let ordersCancelled = 0;
  let commissionPending: MoneyAmount | null = null;
  let commissionApproved: MoneyAmount | null = null;
  let commissionReversed: MoneyAmount | null = null;

  for (const e of events) {
    if (e.eventType === 'CLICK') clicks += 1;
    if (e.eventType === 'ORDER' && e.status === 'PENDING') ordersPending += 1;
    if (e.eventType === 'APPROVED_ORDER') ordersApproved += 1;
    if (e.eventType === 'CANCELLATION' || (e.eventType === 'ORDER' && e.status === 'REJECTED')) {
      ordersCancelled += 1;
    }
    if (e.eventType === 'COMMISSION' && e.status === 'PENDING') {
      commissionPending = addMoney(commissionPending, e.amount);
    }
    if (e.eventType === 'COMMISSION' && e.status === 'CONFIRMED') {
      commissionApproved = addMoney(commissionApproved, e.amount);
    }
    if (e.eventType === 'REVERSAL') {
      commissionReversed = addMoney(commissionReversed, e.amount);
    }
  }

  let netCommission: MoneyAmount | null = null;
  if (commissionApproved && commissionReversed) {
    if (commissionApproved.currency === commissionReversed.currency) {
      netCommission = {
        value: Math.round((commissionApproved.value - commissionReversed.value) * 100) / 100,
        currency: commissionApproved.currency,
      };
    }
  } else if (commissionApproved) {
    netCommission = commissionApproved;
  }

  const eventIds = new Set(events.map((e) => e.eventId));
  const attrs = input.attributions.filter((a) => eventIds.has(a.eventId));
  const unknownAttributionCount = attrs.filter(
    (a) => a.decision === 'UNKNOWN' || a.decision === 'UNMATCHED_TRACKING'
  ).length;
  const attributedCount = attrs.filter((a) => a.decision === 'ATTRIBUTED').length;

  return {
    provider,
    clicks,
    ordersPending,
    ordersApproved,
    ordersCancelled,
    commissionPending,
    commissionApproved,
    commissionReversed,
    netCommission,
    unknownAttributionCount,
    attributedCount,
    computedAt: input.computedAt,
  };
}
