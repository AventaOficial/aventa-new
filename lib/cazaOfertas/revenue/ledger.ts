/**
 * CazaOfertasss — FASE 0. Ledger de ingresos de afiliación (contrato aislado).
 *
 * Autoridad: esta capa REGISTRA hechos económicos externos reportados por una
 * red de afiliados. NO calcula comisiones propias, NO paga y NO toca el money
 * path de Aventa (`CAZAOFERTAS_AVENTA_BOUNDARY`).
 *
 * Integración futura con Aventa: sólo vía contrato/evento, nunca tabla
 * compartida.
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
  | 'REVERSAL';

export type AffiliateRevenueEventStatus = 'PENDING' | 'CONFIRMED' | 'REVERSED' | 'REJECTED';

export interface AffiliateRevenueEvent {
  readonly eventId: string;
  readonly network: AffiliateNetworkId;
  /** Referencia de la red (order id, click id). Es la clave de idempotencia. */
  readonly externalReference: string;
  readonly dealId: string | null;
  readonly trackingLabel: string;
  readonly eventType: AffiliateRevenueEventType;
  /** `null` para eventos sin monto (CLICK, ORDER sin valor reportado). */
  readonly amount: MoneyAmount | null;
  readonly currency: MoneyAmount['currency'] | null;
  readonly occurredAt: IsoTimestamp;
  readonly status: AffiliateRevenueEventStatus;
  /** Sólo para REVERSAL: evento que revierte. */
  readonly reversesEventId: string | null;
  readonly recordedAt: IsoTimestamp;
}

/** Eventos que NO pueden portar monto: un click no vale dinero por sí mismo. */
const AMOUNTLESS_EVENT_TYPES: ReadonlySet<AffiliateRevenueEventType> = new Set(['CLICK']);
/** Eventos que EXIGEN monto. */
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
}

/**
 * Construye un evento de ingreso validado. Todo viene de una red externa, así
 * que todo es no confiable.
 */
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
  if (input.eventType === 'REVERSAL' && !input.reversesEventId) {
    reasons.push('revenue.reversal_requires_reverses_event_id');
  }
  if (input.eventType !== 'REVERSAL' && input.reversesEventId) {
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
    }
    if (currency.ok && value.ok) {
      amount = { value: value.value, currency: currency.value };
    }
  } else if (hasAmountInput === false && input.currency) {
    const currency = normalizeCurrency(input.currency);
    if (!currency.ok) reasons.push(...currency.reasons.map((r) => `revenue_${r}`));
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
  });
}

/** Ledger append-only. No hay update ni delete por contrato. */
export interface AffiliateRevenueLedgerPort {
  append(event: AffiliateRevenueEvent): Promise<{ appended: boolean; duplicate: boolean }>;
  findByEventId(eventId: string): Promise<AffiliateRevenueEvent | null>;
  listByDealId(dealId: string, limit: number): Promise<readonly AffiliateRevenueEvent[]>;
}

/**
 * Garantía estructural: el ledger de CazaOfertasss nunca escribe en el money
 * path de Aventa. Los tests de contrato la invocan.
 */
export { assertAventaMoneyPathUntouched, assertCazaOfertasMoneyUntouched } from '../safety';

