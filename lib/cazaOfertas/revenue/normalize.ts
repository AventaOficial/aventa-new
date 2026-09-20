/**
 * CazaOfertasss — FASE 3. Normalización Raw → Normalized (provider-neutral).
 *
 * No parsea reportes oficiales. Sólo proyecta campos del contrato Raw.
 */

import { CAZAOFERTAS_CURRENCIES, CAZAOFERTAS_DEFAULT_CURRENCY } from '../constants';
import { normalizeCurrency, normalizePrice } from '../price';
import type { CazaResult, MoneyAmount } from '../types';
import { failResult, okResult } from '../types';
import { revenueIdempotencyKey } from './identity';
import type {
  NormalizedRevenueEvent,
  NormalizedRevenueEventType,
  NormalizedRevenueStatus,
  RawRevenueRecord,
} from './types';

const EVENT_TYPES: ReadonlySet<string> = new Set([
  'CLICK',
  'ORDER',
  'APPROVED_ORDER',
  'COMMISSION',
  'REVERSAL',
  'CANCELLATION',
]);

const STATUSES: ReadonlySet<string> = new Set([
  'PENDING',
  'APPROVED',
  'CANCELLED',
  'REVERSED',
]);

const EXTERNAL_REF_PATTERN = /^[A-Za-z0-9._:-]{4,128}$/;

function moneyOrNull(
  value: number | string | null,
  currencyRaw: string | null,
  field: string
): CazaResult<MoneyAmount | null> {
  if (value === null || value === undefined || value === '') {
    return okResult(null);
  }
  const currency = normalizeCurrency(currencyRaw ?? CAZAOFERTAS_DEFAULT_CURRENCY);
  if (!currency.ok) {
    return failResult(currency.reasons.map((r) => `normalize.${field}_${r}`));
  }
  const price = normalizePrice(value);
  if (!price.ok) {
    return failResult(price.reasons.map((r) => `normalize.${field}_${r}`));
  }
  return okResult({ value: price.value, currency: currency.value });
}

export function normalizeRevenueRecord(
  raw: RawRevenueRecord
): CazaResult<NormalizedRevenueEvent> {
  const reasons: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return failResult(['normalize.malformed_record']);
  }
  if (raw.provider !== 'amazon_associates_mx' && raw.provider !== 'mercadolibre_affiliates') {
    reasons.push('normalize.provider_unsupported');
  }
  if (typeof raw.externalReference !== 'string' || !EXTERNAL_REF_PATTERN.test(raw.externalReference)) {
    reasons.push('normalize.external_reference_invalid');
  }
  if (!EVENT_TYPES.has(raw.eventType)) {
    reasons.push(`normalize.event_type_invalid:${String(raw.eventType)}`);
  }
  if (!STATUSES.has(raw.status)) {
    reasons.push(`normalize.status_invalid:${String(raw.status)}`);
  }
  if (!Number.isFinite(Date.parse(raw.occurredAt))) {
    reasons.push('normalize.occurred_at_invalid');
  }
  if (!Number.isFinite(Date.parse(raw.receivedAt))) {
    reasons.push('normalize.received_at_invalid');
  }
  if (typeof raw.sourceBatchId !== 'string' || raw.sourceBatchId.trim().length < 4) {
    reasons.push('normalize.source_batch_id_invalid');
  }

  if (raw.currency !== null && raw.currency !== undefined) {
    if (typeof raw.currency !== 'string') {
      reasons.push('normalize.currency_type_invalid');
    } else if (
      raw.currency !== '' &&
      !(CAZAOFERTAS_CURRENCIES as readonly string[]).includes(raw.currency)
    ) {
      reasons.push(`normalize.currency_unsupported:${raw.currency}`);
    }
  }

  const gross = moneyOrNull(raw.grossAmount, raw.currency, 'gross');
  if (!gross.ok) reasons.push(...gross.reasons);
  const commission = moneyOrNull(raw.commissionAmount, raw.currency, 'commission');
  if (!commission.ok) reasons.push(...commission.reasons);

  if (
    gross.ok &&
    commission.ok &&
    gross.value &&
    commission.value &&
    gross.value.currency !== commission.value.currency
  ) {
    reasons.push('normalize.currency_mismatch');
  }

  if (raw.eventType === 'REVERSAL' || raw.eventType === 'CANCELLATION') {
    if (!raw.reversesExternalReference) {
      reasons.push('normalize.reversal_requires_target');
    }
  } else if (raw.reversesExternalReference) {
    reasons.push('normalize.reverses_target_not_allowed');
  }

  if (reasons.length > 0) return failResult(reasons);

  const eventType = raw.eventType as NormalizedRevenueEventType;
  const status = raw.status as NormalizedRevenueStatus;

  return okResult({
    provider: raw.provider,
    externalReference: raw.externalReference,
    eventType,
    occurredAt: raw.occurredAt,
    currency:
      (gross.ok && gross.value?.currency) ||
      (commission.ok && commission.value?.currency) ||
      (raw.currency === 'MXN' ? 'MXN' : null),
    grossAmount: gross.ok ? gross.value : null,
    commissionAmount: commission.ok ? commission.value : null,
    status,
    productReference: raw.productReference,
    externalProductId: raw.externalProductId,
    trackingIdentifier: raw.trackingIdentifier,
    sourceBatchId: raw.sourceBatchId,
    sourceMetadata: { ...raw.sourceMetadata },
    reversesExternalReference: raw.reversesExternalReference,
    receivedAt: raw.receivedAt,
    idempotencyKey: revenueIdempotencyKey({
      provider: raw.provider,
      externalReference: raw.externalReference,
      eventType,
    }),
  });
}
