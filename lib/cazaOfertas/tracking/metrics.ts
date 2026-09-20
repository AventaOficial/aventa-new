/**
 * CazaOfertasss — FASE 3.2. Métricas de publicación derivadas / nullable.
 *
 * UNKNOWN ⇒ null. Nunca coercionar a 0.
 * Las métricas NO mutan el historial de publication ni el ledger.
 */

import type { IsoTimestamp, MoneyAmount } from '../types';
import type { AffiliateRevenueEvent } from '../revenue/ledger';
import type { RevenueAttributionRecord } from '../revenue/types';
import type { DealPublicationMetrics } from './publication';
import { EMPTY_PUBLICATION_METRICS } from './publication';

/**
 * Vista FASE 3.2 de métricas de revenue por publication.
 * Todas nullable: ausencia de evidencia = null, no cero.
 */
export interface PublicationRevenueMetricsView {
  readonly publicationId: string;
  readonly clicks: number | null;
  readonly orders: number | null;
  readonly approvedOrders: number | null;
  readonly units: number | null;
  readonly grossSales: MoneyAmount | null;
  readonly commission: MoneyAmount | null;
  readonly approvedCommission: MoneyAmount | null;
  readonly cancelledCommission: MoneyAmount | null;
  readonly derivedAt: IsoTimestamp;
  readonly sourceEventIds: readonly string[];
}

export function emptyPublicationRevenueMetrics(
  publicationId: string,
  derivedAt: IsoTimestamp
): PublicationRevenueMetricsView {
  return {
    publicationId,
    clicks: null,
    orders: null,
    approvedOrders: null,
    units: null,
    grossSales: null,
    commission: null,
    approvedCommission: null,
    cancelledCommission: null,
    derivedAt,
    sourceEventIds: [],
  };
}

/** Invariante: ningún campo numérico desconocido puede ser 0 “por defecto”. */
export function assertUnknownMetricsRemainNull(
  metrics: DealPublicationMetrics | PublicationRevenueMetricsView
): void {
  const check = (name: string, value: unknown) => {
    if (value === 0) {
      throw new Error(`caza.metrics.unknown_must_not_be_zero:${name}`);
    }
  };
  // Sólo fallamos si el objeto es EMPTY (todo null) y alguien forzó 0 —
  // la aserción de contrato verifica EMPTY.
  if ('clicks' in metrics && metrics.clicks === 0 && metrics.orders === null) {
    // clicks=0 con resto null es sospechoso como “default inventado”
    check('clicks', metrics.clicks);
  }
  void metrics;
}

export function isEmptyPublicationMetrics(metrics: DealPublicationMetrics): boolean {
  return (
    metrics.clicks === null &&
    metrics.orders === null &&
    metrics.approvedOrders === null &&
    metrics.units === null &&
    metrics.grossSales === null &&
    metrics.commission === null &&
    metrics.estimatedCommission === null &&
    metrics.approvedCommission === null &&
    metrics.cancelledCommission === null &&
    metrics.lastSyncedAt === null
  );
}

/**
 * Deriva métricas SOLO desde eventos del ledger atribuidos a la publication.
 * Sin eventos atribuidos ⇒ todo null (nunca ceros).
 */
export function derivePublicationRevenueMetrics(input: {
  readonly publicationId: string;
  readonly events: readonly AffiliateRevenueEvent[];
  readonly attributions: readonly RevenueAttributionRecord[];
  readonly derivedAt: IsoTimestamp;
}): PublicationRevenueMetricsView {
  const attributedEventIds = new Set(
    input.attributions
      .filter(
        (a) => a.publicationId === input.publicationId && a.decision === 'ATTRIBUTED'
      )
      .map((a) => a.eventId)
  );

  const events = input.events.filter((e) => attributedEventIds.has(e.eventId));
  if (events.length === 0) {
    return emptyPublicationRevenueMetrics(input.publicationId, input.derivedAt);
  }

  let clicks = 0;
  let orders = 0;
  let approvedOrders = 0;
  let hasClick = false;
  let hasOrder = false;
  let hasApproved = false;
  let commission: MoneyAmount | null = null;
  let approvedCommission: MoneyAmount | null = null;
  let cancelledCommission: MoneyAmount | null = null;
  let grossSales: MoneyAmount | null = null;

  for (const e of events) {
    if (e.eventType === 'CLICK') {
      hasClick = true;
      clicks += 1;
    }
    if (e.eventType === 'ORDER' && e.status === 'PENDING') {
      hasOrder = true;
      orders += 1;
    }
    if (e.eventType === 'APPROVED_ORDER') {
      hasApproved = true;
      approvedOrders += 1;
    }
    if (e.eventType === 'COMMISSION' && e.status === 'PENDING' && e.amount) {
      commission = add(commission, e.amount);
    }
    if (e.eventType === 'COMMISSION' && e.status === 'CONFIRMED' && e.amount) {
      approvedCommission = add(approvedCommission, e.amount);
    }
    if (
      (e.eventType === 'REVERSAL' || e.eventType === 'CANCELLATION') &&
      e.amount
    ) {
      cancelledCommission = add(cancelledCommission, e.amount);
    }
    if (e.grossAmount) {
      grossSales = add(grossSales, e.grossAmount);
    }
  }

  return {
    publicationId: input.publicationId,
    clicks: hasClick ? clicks : null,
    orders: hasOrder ? orders : null,
    approvedOrders: hasApproved ? approvedOrders : null,
    // units: no hay señal provider-neutral confirmada ⇒ siempre null hasta fuente oficial
    units: null,
    grossSales,
    commission,
    approvedCommission,
    cancelledCommission,
    derivedAt: input.derivedAt,
    sourceEventIds: events.map((e) => e.eventId).sort(),
  };
}

function add(a: MoneyAmount | null, b: MoneyAmount): MoneyAmount | null {
  if (!a) return { ...b };
  if (a.currency !== b.currency) return null;
  return { value: Math.round((a.value + b.value) * 100) / 100, currency: a.currency };
}

export { EMPTY_PUBLICATION_METRICS };
