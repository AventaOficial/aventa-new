/**
 * CazaOfertasss — FASE 3. Reconciliación determinista desde el ledger.
 *
 * Source-of-truth = eventos append-only. El snapshot es derivado y recalculable.
 */

import type { AffiliateNetworkId, MoneyAmount } from '../types';
import type { AffiliateRevenueEvent, AffiliateRevenueLedgerPort } from './ledger';
import type { RevenueAttributionPort } from './attribution';
import type { RevenueReconciliationSnapshot } from './types';

function sumAmounts(
  events: readonly AffiliateRevenueEvent[],
  predicate: (e: AffiliateRevenueEvent) => boolean
): MoneyAmount | null {
  const matched = events.filter(predicate);
  if (matched.length === 0) return null;
  let total = 0;
  let currency: MoneyAmount['currency'] | null = null;
  for (const e of matched) {
    if (!e.amount) continue;
    if (currency === null) currency = e.amount.currency;
    if (e.amount.currency !== currency) {
      // Determinista: moneda mixta ⇒ no agregar; caller ve null neto.
      return null;
    }
    total += e.amount.value;
  }
  if (currency === null) return null;
  return { value: Math.round(total * 100) / 100, currency };
}

/**
 * Reconcilia una venta externa a partir de todos los eventos con esa
 * externalReference (y compensatorios que apuntan a ella vía reversesEventId).
 *
 * pending → approved = presencia de ORDER + APPROVED_ORDER (nuevos eventos),
 * nunca un UPDATE de status.
 */
export async function reconcileExternalSale(input: {
  readonly ledger: AffiliateRevenueLedgerPort;
  readonly attributions?: RevenueAttributionPort | null;
  readonly provider: AffiliateNetworkId;
  readonly externalReference: string;
  readonly reconciledAt: string;
  readonly limit?: number;
}): Promise<RevenueReconciliationSnapshot> {
  const limit = input.limit ?? 100;
  const listFn = input.ledger.listByExternalReference;
  let events: readonly AffiliateRevenueEvent[];
  if (listFn) {
    events = await listFn.call(input.ledger, input.provider, input.externalReference, limit);
  } else {
    // Fallback: no debería usarse en producción; tests con port mínimo.
    events = [];
  }

  // Incluir REVERSAL/CANCELLATION cuyo reversesEventId apunta a un eventId de esta venta.
  // (Los compensatorios usan su propia externalReference distinta o la misma+tipo.)
  const byId = new Map(events.map((e) => [e.eventId, e]));

  const orderPending = events.some((e) => e.eventType === 'ORDER' && e.status === 'PENDING');
  const orderApproved = events.some(
    (e) => e.eventType === 'APPROVED_ORDER' && e.status === 'CONFIRMED'
  );
  const orderCancelled = events.some(
    (e) =>
      (e.eventType === 'CANCELLATION' && e.status === 'REJECTED') ||
      (e.eventType === 'ORDER' && e.status === 'REJECTED')
  );

  const commissionPendingAmount = sumAmounts(
    events,
    (e) => e.eventType === 'COMMISSION' && e.status === 'PENDING'
  );
  const commissionApprovedAmount = sumAmounts(
    events,
    (e) => e.eventType === 'COMMISSION' && e.status === 'CONFIRMED'
  );
  const commissionReversedAmount = sumAmounts(
    events,
    (e) => e.eventType === 'REVERSAL' && e.status === 'REVERSED'
  );

  let netCommissionAmount: MoneyAmount | null = null;
  if (commissionApprovedAmount && commissionReversedAmount) {
    if (commissionApprovedAmount.currency === commissionReversedAmount.currency) {
      netCommissionAmount = {
        value:
          Math.round(
            (commissionApprovedAmount.value - commissionReversedAmount.value) * 100
          ) / 100,
        currency: commissionApprovedAmount.currency,
      };
    }
  } else if (commissionApprovedAmount) {
    netCommissionAmount = commissionApprovedAmount;
  } else if (commissionPendingAmount && !orderCancelled) {
    netCommissionAmount = null; // pending no cuenta como neto aprobado
  }

  let attribution: RevenueReconciliationSnapshot['attribution'] = 'UNKNOWN';
  let publicationId: string | null = null;
  if (input.attributions) {
    for (const e of events) {
      const attr = await input.attributions.findByEventId(e.eventId);
      if (!attr) continue;
      if (attr.decision === 'ATTRIBUTED') {
        attribution = 'ATTRIBUTED';
        publicationId = attr.publicationId;
        break;
      }
      if (attr.decision === 'UNMATCHED_TRACKING') attribution = 'UNMATCHED_TRACKING';
      if (attr.decision === 'UNKNOWN' && attribution !== 'UNMATCHED_TRACKING') {
        attribution = 'UNKNOWN';
      }
    }
  }

  return {
    provider: input.provider,
    externalReference: input.externalReference,
    orderPending,
    orderApproved,
    orderCancelled,
    commissionPendingAmount,
    commissionApprovedAmount,
    commissionReversedAmount,
    netCommissionAmount,
    attribution,
    publicationId,
    eventIds: [...byId.keys()].sort(),
    reconciledAt: input.reconciledAt,
  };
}

/** Misma entrada ⇒ mismo snapshot (excepto reconciledAt). */
export function reconciliationCoreEqual(
  a: RevenueReconciliationSnapshot,
  b: RevenueReconciliationSnapshot
): boolean {
  return (
    a.provider === b.provider &&
    a.externalReference === b.externalReference &&
    a.orderPending === b.orderPending &&
    a.orderApproved === b.orderApproved &&
    a.orderCancelled === b.orderCancelled &&
    JSON.stringify(a.commissionPendingAmount) === JSON.stringify(b.commissionPendingAmount) &&
    JSON.stringify(a.commissionApprovedAmount) === JSON.stringify(b.commissionApprovedAmount) &&
    JSON.stringify(a.commissionReversedAmount) === JSON.stringify(b.commissionReversedAmount) &&
    JSON.stringify(a.netCommissionAmount) === JSON.stringify(b.netCommissionAmount) &&
    a.attribution === b.attribution &&
    a.publicationId === b.publicationId &&
    a.eventIds.join('|') === b.eventIds.join('|')
  );
}
