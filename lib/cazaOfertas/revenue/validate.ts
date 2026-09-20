/**
 * CazaOfertasss — FASE 3. Validación financiera pre-ledger.
 */

import { isValidTrackingLabel } from '../affiliate';
import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';
import { REVENUE_UNKNOWN_TRACKING_LABEL } from './identity';
import type {
  AffiliateRevenueEvent,
  AffiliateRevenueEventStatus,
  AffiliateRevenueEventType,
} from './ledger';
import type { NormalizedRevenueEvent, NormalizedRevenueStatus } from './types';

const STATUS_MAP: Readonly<Record<NormalizedRevenueStatus, AffiliateRevenueEventStatus>> = {
  PENDING: 'PENDING',
  APPROVED: 'CONFIRMED',
  CANCELLED: 'REJECTED',
  REVERSED: 'REVERSED',
};

export function validateNormalizedRevenueEvent(
  event: NormalizedRevenueEvent
): CazaResult<NormalizedRevenueEvent> {
  const reasons: string[] = [];

  if (event.eventType === 'CLICK') {
    if (event.commissionAmount !== null || event.grossAmount !== null) {
      reasons.push('validate.click_must_be_amountless');
    }
  }

  if (event.eventType === 'COMMISSION' || event.eventType === 'REVERSAL') {
    if (event.commissionAmount === null) {
      reasons.push('validate.commission_amount_required');
    } else {
      if (event.commissionAmount.value < 0) reasons.push('validate.negative_commission');
      if (event.commissionAmount.value === 0) reasons.push('validate.zero_commission');
    }
  }

  if (event.grossAmount !== null) {
    if (event.grossAmount.value < 0) reasons.push('validate.negative_gross');
    if (event.grossAmount.value === 0) reasons.push('validate.zero_gross');
  }

  if (
    event.grossAmount &&
    event.commissionAmount &&
    event.grossAmount.currency !== event.commissionAmount.currency
  ) {
    reasons.push('validate.currency_mismatch');
  }

  if (event.currency && event.commissionAmount && event.currency !== event.commissionAmount.currency) {
    reasons.push('validate.currency_mismatch');
  }

  if (event.eventType === 'CLICK' && event.status !== 'APPROVED') {
    reasons.push('validate.click_status_must_be_approved');
  }
  if (event.eventType === 'ORDER' && event.status !== 'PENDING' && event.status !== 'CANCELLED') {
    reasons.push('validate.order_status_invalid');
  }
  if (event.eventType === 'APPROVED_ORDER' && event.status !== 'APPROVED') {
    reasons.push('validate.approved_order_status_invalid');
  }
  if (event.eventType === 'COMMISSION' && event.status !== 'PENDING' && event.status !== 'APPROVED') {
    reasons.push('validate.commission_status_invalid');
  }
  if (event.eventType === 'REVERSAL' && event.status !== 'REVERSED') {
    reasons.push('validate.reversal_status_invalid');
  }
  if (event.eventType === 'CANCELLATION' && event.status !== 'CANCELLED') {
    reasons.push('validate.cancellation_status_invalid');
  }

  if (event.trackingIdentifier !== null && !isValidTrackingLabel(event.trackingIdentifier)) {
    reasons.push('validate.tracking_identifier_invalid');
  }

  if (reasons.length > 0) return failResult(reasons);
  return okResult(event);
}

/**
 * Proyecta Normalized → hecho financiero del ledger.
 * dealId = null siempre aquí: atribución es capa aparte.
 */
export function toFinancialRevenueEvent(
  event: NormalizedRevenueEvent,
  recordedAt: string,
  reversesEventId: string | null
): CazaResult<AffiliateRevenueEvent> {
  const validated = validateNormalizedRevenueEvent(event);
  if (!validated.ok) return failResult(validated.reasons);

  const trackingLabel = event.trackingIdentifier ?? REVENUE_UNKNOWN_TRACKING_LABEL;
  const status = STATUS_MAP[event.status];
  const eventType = event.eventType as AffiliateRevenueEventType;

  let amount = event.commissionAmount;
  if (event.eventType === 'CLICK') {
    amount = null;
  } else if (
    (event.eventType === 'ORDER' ||
      event.eventType === 'APPROVED_ORDER' ||
      event.eventType === 'CANCELLATION') &&
    amount === null
  ) {
    amount = event.grossAmount;
  }

  if ((event.eventType === 'COMMISSION' || event.eventType === 'REVERSAL') && amount === null) {
    return failResult(['validate.commission_amount_required']);
  }

  return okResult({
    eventId: event.idempotencyKey,
    network: event.provider,
    externalReference: event.externalReference,
    dealId: null,
    trackingLabel,
    eventType,
    amount,
    currency: amount?.currency ?? event.currency,
    occurredAt: event.occurredAt,
    status,
    reversesEventId:
      event.eventType === 'REVERSAL' || event.eventType === 'CANCELLATION'
        ? reversesEventId
        : null,
    recordedAt,
    grossAmount: event.grossAmount,
    sourceBatchId: event.sourceBatchId,
    productExternalId: event.externalProductId,
    productReference: event.productReference,
  });
}
