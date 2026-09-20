/**
 * CazaOfertasss — Ledger de ingresos de afiliación (FASE 0 + extensiones FASE 3).
 *
 * Autoridad: REGISTRA hechos económicos externos. Append-only.
 * NO calcula comisiones propias, NO paga, NO toca money path Aventa.
 *
 * FASE 3: campos opcionales de metadata (gross, batch, product) sin mutar hechos.
 */

import { isValidTrackingLabel } from '../affiliate';
import type {
  AffiliateNetworkId,
  CazaResult,
  IsoTimestamp,
  MoneyAmount,
} from '../types';
import { failResult, okResult } from '../types';
import { normalizeCurrency, normalizePrice } from '../price';

export type AffiliateRevenueEventType =
  | 'CLICK'
  | 'ORDER'
  | 'APPROVED_ORDER'
  | 'COMMISSION'
  | 'REVERSAL'
  | 'CANCELLATION';

export type AffiliateRevenueEventStatus = 'PENDING' | 'CONFIRMED' | 'REVERSED' | 'REJECTED';

export interface AffiliateRevenueEvent {
  readonly eventId: string;
  readonly network: AffiliateNetworkId;
  /** Referencia de la red. Parte de la clave de idempotencia. */
  readonly externalReference: string;
  /** Siempre null en ingestión; la atribución vive aparte (FASE 3). */
  readonly dealId: string | null;
  readonly trackingLabel: string;
  readonly eventType: AffiliateRevenueEventType;
  /** Comisión (o monto del hecho); null para CLICK / órdenes sin valor. */
  readonly amount: MoneyAmount | null;
  readonly currency: MoneyAmount['currency'] | null;
  readonly occurredAt: IsoTimestamp;
  readonly status: AffiliateRevenueEventStatus;
  readonly reversesEventId: string | null;
  readonly recordedAt: IsoTimestamp;
  /** FASE 3 — opcional; no altera idempotencia. */
  readonly grossAmount?: MoneyAmount | null;
  readonly sourceBatchId?: string | null;
  readonly productExternalId?: string | null;
  readonly productReference?: string | null;
}

const AMOUNTLESS_EVENT_TYPES: ReadonlySet<AffiliateRevenueEventType> = new Set(['CLICK']);
const AMOUNT_REQUIRED_EVENT_TYPES: ReadonlySet<AffiliateRevenueEventType> = new Set([
  'COMMISSION',
  'REVERSAL',
]);

const STATUS_BY_EVENT_TYPE: Readonly<
  Record<AffiliateRevenueEventType, readonly AffiliateRevenueEventStatus[]>
> = {
  CLICK: ['CONFIRMED'],
  ORDER: ['PENDING', 'CONFIRMED', 'REJECTED'],
  APPROVED_ORDER: ['CONFIRMED'],
  COMMISSION: ['PENDING', 'CONFIRMED', 'REVERSED'],
  REVERSAL: ['REVERSED'],
  CANCELLATION: ['REJECTED'],
};

export function affiliateRevenueIdempotencyKey(input: {
  network: AffiliateNetworkId;
  externalReference: string;
  eventType: AffiliateRevenueEventType;
}): string {
  return `${input.network}:${input.eventType}:${input.externalReference}`;
}

export interface BuildAffiliateRevenueEventInput {
  readonly network: AffiliateNetworkId;
  readonly externalReference: string;
  readonly dealId?: string | null;
  readonly trackingLabel: string;
  readonly eventType: AffiliateRevenueEventType;
  readonly amountValue?: number | string | null;
  readonly currency?: string | null;
  readonly occurredAt: IsoTimestamp;
  readonly status: AffiliateRevenueEventStatus;
  readonly reversesEventId?: string | null;
  readonly recordedAt: IsoTimestamp;
  readonly grossAmountValue?: number | string | null;
  readonly sourceBatchId?: string | null;
  readonly productExternalId?: string | null;
  readonly productReference?: string | null;
}

export function buildAffiliateRevenueEvent(
  input: BuildAffiliateRevenueEventInput
): CazaResult<AffiliateRevenueEvent> {
  const reasons: string[] = [];

  if (typeof input.externalReference !== 'string' || !/^[A-Za-z0-9._:-]{4,128}$/.test(input.externalReference)) {
    reasons.push('revenue.external_reference_invalid');
  }
  if (!isValidTrackingLabel(input.trackingLabel)) {
    reasons.push('revenue.tracking_label_invalid');
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    reasons.push('revenue.occurred_at_invalid');
  }
  if (!Number.isFinite(Date.parse(input.recordedAt))) {
    reasons.push('revenue.recorded_at_invalid');
  }
  if (!STATUS_BY_EVENT_TYPE[input.eventType]?.includes(input.status)) {
    reasons.push(`revenue.status_invalid_for_type:${input.eventType}/${input.status}`);
  }
  if (
    (input.eventType === 'REVERSAL' || input.eventType === 'CANCELLATION') &&
    !input.reversesEventId
  ) {
    reasons.push('revenue.reversal_requires_reverses_event_id');
  }
  if (
    input.eventType !== 'REVERSAL' &&
    input.eventType !== 'CANCELLATION' &&
    input.reversesEventId
  ) {
    reasons.push('revenue.reverses_event_id_not_allowed');
  }

  const hasAmountInput = input.amountValue !== null && input.amountValue !== undefined;

  if (AMOUNTLESS_EVENT_TYPES.has(input.eventType) && hasAmountInput) {
    reasons.push(`revenue.amount_not_allowed_for_type:${input.eventType}`);
  }
  if (AMOUNT_REQUIRED_EVENT_TYPES.has(input.eventType) && !hasAmountInput) {
    reasons.push(`revenue.amount_required_for_type:${input.eventType}`);
  }

  let amount: MoneyAmount | null = null;
  if (hasAmountInput && !AMOUNTLESS_EVENT_TYPES.has(input.eventType)) {
    const currency = normalizeCurrency(input.currency);
    if (!currency.ok) {
      reasons.push(...currency.reasons.map((r) => `revenue_${r}`));
    }
    const value = normalizePrice(input.amountValue);
    if (!value.ok) {
      reasons.push(...value.reasons.map((r) => `revenue_amount_${r}`));
    } else if (value.value <= 0) {
      reasons.push(value.value === 0 ? 'revenue.zero_commission' : 'revenue.negative_commission');
    }
    if (currency.ok && value.ok && value.value > 0) {
      amount = { value: value.value, currency: currency.value };
    }
  } else if (hasAmountInput === false && input.currency) {
    const currency = normalizeCurrency(input.currency);
    if (!currency.ok) reasons.push(...currency.reasons.map((r) => `revenue_${r}`));
  }

  let grossAmount: MoneyAmount | null = null;
  if (input.grossAmountValue !== null && input.grossAmountValue !== undefined) {
    const currency = normalizeCurrency(input.currency);
    const value = normalizePrice(input.grossAmountValue);
    if (!currency.ok || !value.ok || value.value <= 0) {
      reasons.push('revenue.gross_amount_invalid');
    } else {
      grossAmount = { value: value.value, currency: currency.value };
    }
  }

  if (reasons.length > 0) return failResult(reasons);

  return okResult({
    eventId: affiliateRevenueIdempotencyKey(input),
    network: input.network,
    externalReference: input.externalReference,
    dealId: input.dealId ?? null,
    trackingLabel: input.trackingLabel,
    eventType: input.eventType,
    amount,
    currency: amount?.currency ?? null,
    occurredAt: input.occurredAt,
    status: input.status,
    reversesEventId: input.reversesEventId ?? null,
    recordedAt: input.recordedAt,
    grossAmount,
    sourceBatchId: input.sourceBatchId ?? null,
    productExternalId: input.productExternalId ?? null,
    productReference: input.productReference ?? null,
  });
}

/** Ledger append-only. No hay update ni delete por contrato. */
export interface AffiliateRevenueLedgerPort {
  append(event: AffiliateRevenueEvent): Promise<{ appended: boolean; duplicate: boolean }>;
  findByEventId(eventId: string): Promise<AffiliateRevenueEvent | null>;
  listByDealId(dealId: string, limit: number): Promise<readonly AffiliateRevenueEvent[]>;
  /** FASE 3 — listado acotado por referencia externa (reconciliación). */
  listByExternalReference?(
    network: AffiliateNetworkId,
    externalReference: string,
    limit: number
  ): Promise<readonly AffiliateRevenueEvent[]>;
  /** FASE 3 — listado acotado por tracking (atribución). */
  listByTrackingLabel?(
    trackingLabel: string,
    limit: number
  ): Promise<readonly AffiliateRevenueEvent[]>;
}

export { assertAventaMoneyPathUntouched, assertCazaOfertasMoneyUntouched } from '../safety';
