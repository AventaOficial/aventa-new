/**
 * CazaOfertasss — FASE 1. Filas tipadas ↔ dominio.
 *
 * Los mappers viven en la capa de persistencia: el dominio no conoce columnas SQL.
 */

import type {
  AffiliateAttachment,
  AffiliateNetworkId,
  CazaCategoryId,
  CazaCurrency,
  CazaStoreId,
  DealAvailability,
  DealCandidate,
  DealCandidateStatus,
  DealEvidence,
  DealGrade,
  DealIdentityStrategy,
  DealScore,
  DealScoreReason,
  SellerTrustClass,
} from '../types';
import type { AffiliateRevenueEvent } from '../revenue/ledger';
import type {
  DealPublicationMetrics,
  DealPublicationRecord,
  PublicationStatus,
} from '../tracking/publication';
import { EMPTY_PUBLICATION_METRICS } from '../tracking/publication';
import { parseCardSnapshot } from '../publication/cardSnapshot';

export interface CazaDealCandidateRow {
  id: string;
  identity_key: string;
  store: string;
  external_product_id: string | null;
  identity_strategy: string;
  canonical_url: string;
  title: string;
  current_price: number | string;
  reference_price: number | string | null;
  discount_percent: number;
  currency: string;
  category: string;
  availability: string;
  status: string;
  seller_external_id: string | null;
  seller_display_name: string | null;
  seller_trust_class: string;
  seller_reputation_score: number | string | null;
  score_value: number;
  score_grade: string;
  score_version: string;
  score_reasons: unknown;
  score_gates_failed: string[] | null;
  evidence_source: string;
  evidence_captured_at: string;
  evidence_current_price: number | string;
  evidence_reference_price: number | string | null;
  evidence_currency: string;
  evidence_quality: string;
  evidence_price_confidence: string;
  evidence_historical_confidence: string;
  evidence_observation_window_days: number | null;
  evidence_observation_count: number | null;
  evidence_coupon_applied: boolean;
  evidence_promotion_applied: boolean;
  evidence_notes: string | null;
  evidence_json: unknown;
  affiliate_url: string | null;
  affiliate_network: string | null;
  affiliate_tracking_label: string | null;
  affiliate_generated_at: string | null;
  affiliate_credential_ref: string | null;
  monetizable: boolean;
  publication_eligible: boolean;
  detected_at: string;
  first_seen_at: string;
  updated_at: string;
  revision: number;
  created_at?: string;
}

export interface CazaPublicationRow {
  publication_id: string;
  deal_id: string;
  store: string;
  affiliate_network: string;
  tracking_label: string;
  telegram_channel: string;
  telegram_message_id: string | null;
  telegram_chat_id: string | null;
  published_at: string | null;
  status: string;
  affiliate_url: string | null;
  published_revision: number | null;
  prepared_at: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  leased_until: string | null;
  lease_owner: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  card_snapshot: Record<string, unknown> | null;
  metrics_clicks: number | null;
  metrics_orders: number | null;
  metrics_approved_orders: number | null;
  metrics_estimated_commission_amount: number | string | null;
  metrics_estimated_commission_currency: string | null;
  metrics_approved_commission_amount: number | string | null;
  metrics_approved_commission_currency: string | null;
  metrics_last_synced_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CazaRevenueEventRow {
  event_id: string;
  network: string;
  external_reference: string;
  deal_id: string | null;
  tracking_label: string;
  event_type: string;
  amount: number | string | null;
  currency: string | null;
  occurred_at: string;
  status: string;
  reverses_event_id: string | null;
  recorded_at: string;
  created_at?: string;
  /** FASE 3 optional columns (null on FASE 1 rows). */
  gross_amount?: number | string | null;
  source_batch_id?: string | null;
  product_external_id?: string | null;
  product_reference?: string | null;
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function requireNum(value: number | string | null | undefined, field: string): number {
  const n = num(value);
  if (n === null) throw new Error(`caza.mapper.invalid_number:${field}`);
  return n;
}

function iso(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`caza.mapper.invalid_timestamp:${value}`);
  return new Date(ms).toISOString();
}

export function dealCandidateToRow(candidate: DealCandidate): CazaDealCandidateRow {
  const affiliate = candidate.affiliate;
  return {
    id: candidate.id,
    identity_key: candidate.identity.key,
    store: candidate.store,
    external_product_id: candidate.externalProductId,
    identity_strategy: candidate.identity.strategy,
    canonical_url: candidate.canonicalUrl,
    title: candidate.title,
    current_price: candidate.currentPrice,
    reference_price: candidate.referencePrice,
    discount_percent: candidate.discountPercent,
    currency: candidate.currency,
    category: candidate.category,
    availability: candidate.availability,
    status: candidate.status,
    seller_external_id: candidate.seller.externalSellerId,
    seller_display_name: candidate.seller.displayName,
    seller_trust_class: candidate.seller.trustClass,
    seller_reputation_score: candidate.seller.reputationScore,
    score_value: candidate.score.score,
    score_grade: candidate.score.grade,
    score_version: candidate.score.version,
    score_reasons: candidate.score.reasons,
    score_gates_failed: [...candidate.score.gatesFailed],
    evidence_source: candidate.evidence.source,
    evidence_captured_at: candidate.evidence.capturedAt,
    evidence_current_price: candidate.evidence.currentPrice,
    evidence_reference_price: candidate.evidence.referencePrice,
    evidence_currency: candidate.evidence.currency,
    evidence_quality: candidate.evidence.evidenceQuality,
    evidence_price_confidence: candidate.evidence.priceConfidence,
    evidence_historical_confidence: candidate.evidence.historicalConfidence,
    evidence_observation_window_days: candidate.evidence.observationWindowDays,
    evidence_observation_count: candidate.evidence.observationCount,
    evidence_coupon_applied: candidate.evidence.couponApplied,
    evidence_promotion_applied: candidate.evidence.promotionApplied,
    evidence_notes: candidate.evidence.notes ?? null,
    evidence_json: candidate.evidence,
    affiliate_url: candidate.affiliateUrl,
    affiliate_network: affiliate?.affiliateNetwork ?? null,
    affiliate_tracking_label: affiliate?.affiliateTrackingLabel ?? null,
    affiliate_generated_at: affiliate?.affiliateGeneratedAt ?? null,
    affiliate_credential_ref: affiliate?.affiliateCredentialRef ?? null,
    monetizable: candidate.affiliate !== null && candidate.affiliateUrl !== null,
    publication_eligible:
      candidate.status === 'PUBLICATION_READY' &&
      candidate.score.grade !== 'REJECT' &&
      candidate.affiliate !== null,
    detected_at: candidate.detectedAt,
    first_seen_at: candidate.firstSeenAt,
    updated_at: candidate.updatedAt,
    revision: candidate.revision,
  };
}

export function rowToDealCandidate(row: CazaDealCandidateRow): DealCandidate {
  if (!row || typeof row !== 'object') {
    throw new Error('caza.mapper.candidate_row_missing');
  }
  if (typeof row.identity_key !== 'string' || row.identity_key.length === 0) {
    throw new Error('caza.mapper.identity_key_missing');
  }

  const evidence: DealEvidence = {
    source: row.evidence_source as DealEvidence['source'],
    capturedAt: iso(row.evidence_captured_at),
    currentPrice: requireNum(row.evidence_current_price, 'evidence_current_price'),
    referencePrice: num(row.evidence_reference_price),
    currency: row.evidence_currency as CazaCurrency,
    evidenceQuality: row.evidence_quality as DealEvidence['evidenceQuality'],
    priceConfidence: row.evidence_price_confidence as DealEvidence['priceConfidence'],
    historicalConfidence:
      row.evidence_historical_confidence as DealEvidence['historicalConfidence'],
    observationWindowDays: row.evidence_observation_window_days,
    observationCount: row.evidence_observation_count,
    couponApplied: Boolean(row.evidence_coupon_applied),
    promotionApplied: Boolean(row.evidence_promotion_applied),
    ...(row.evidence_notes ? { notes: row.evidence_notes } : {}),
  };

  const scoreReasons = Array.isArray(row.score_reasons)
    ? (row.score_reasons as DealScoreReason[])
    : [];

  const score: DealScore = {
    version: row.score_version as DealScore['version'],
    score: row.score_value,
    grade: row.score_grade as DealGrade,
    reasons: scoreReasons,
    gatesFailed: row.score_gates_failed ?? [],
  };

  let affiliate: AffiliateAttachment | null = null;
  if (
    row.affiliate_url &&
    row.affiliate_network &&
    row.affiliate_tracking_label &&
    row.affiliate_generated_at &&
    row.affiliate_credential_ref
  ) {
    affiliate = {
      affiliateNetwork: row.affiliate_network as AffiliateNetworkId,
      affiliateUrl: row.affiliate_url,
      affiliateTrackingLabel: row.affiliate_tracking_label,
      affiliateGeneratedAt: iso(row.affiliate_generated_at),
      affiliateCredentialRef: row.affiliate_credential_ref,
    };
  }

  return {
    id: row.id,
    store: row.store as CazaStoreId,
    externalProductId: row.external_product_id,
    title: row.title,
    canonicalUrl: row.canonical_url,
    affiliateUrl: row.affiliate_url,
    currentPrice: requireNum(row.current_price, 'current_price'),
    referencePrice: num(row.reference_price),
    currency: row.currency as CazaCurrency,
    discountPercent: row.discount_percent,
    category: row.category as CazaCategoryId,
    seller: {
      externalSellerId: row.seller_external_id,
      displayName: row.seller_display_name,
      trustClass: row.seller_trust_class as SellerTrustClass,
      reputationScore: num(row.seller_reputation_score),
    },
    availability: row.availability as DealAvailability,
    evidence,
    detectedAt: iso(row.detected_at),
    score,
    status: row.status as DealCandidateStatus,
    identity: {
      strategy: row.identity_strategy as DealIdentityStrategy,
      key: row.identity_key,
      store: row.store as CazaStoreId,
      externalProductId: row.external_product_id,
      normalizedUrl: row.canonical_url,
    },
    affiliate,
    firstSeenAt: iso(row.first_seen_at),
    updatedAt: iso(row.updated_at),
    revision: row.revision,
  };
}

export function publicationToRow(record: DealPublicationRecord): CazaPublicationRow {
  const metrics = record.metrics ?? EMPTY_PUBLICATION_METRICS;
  return {
    publication_id: record.publicationId,
    deal_id: record.dealId,
    store: record.store,
    affiliate_network: record.affiliateNetwork,
    tracking_label: record.trackingLabel,
    telegram_channel: record.telegramChannel,
    telegram_message_id: record.telegramMessageId,
    telegram_chat_id: record.telegramChatId,
    published_at: record.publishedAt,
    status: record.status,
    affiliate_url: record.affiliateUrl ?? null,
    published_revision: record.publishedRevision ?? null,
    prepared_at: record.preparedAt,
    attempt_count: record.attemptCount,
    max_attempts: record.maxAttempts,
    next_attempt_at: record.nextAttemptAt,
    leased_until: record.leasedUntil,
    lease_owner: record.leaseOwner,
    last_error_code: record.lastErrorCode,
    last_error_message: record.lastErrorMessage,
    card_snapshot: { ...record.cardSnapshot },
    metrics_clicks: metrics.clicks,
    metrics_orders: metrics.orders,
    metrics_approved_orders: metrics.approvedOrders,
    metrics_estimated_commission_amount:
      (metrics.commission ?? metrics.estimatedCommission)?.value ?? null,
    metrics_estimated_commission_currency:
      (metrics.commission ?? metrics.estimatedCommission)?.currency ?? null,
    metrics_approved_commission_amount: metrics.approvedCommission?.value ?? null,
    metrics_approved_commission_currency: metrics.approvedCommission?.currency ?? null,
    metrics_last_synced_at: metrics.lastSyncedAt,
    updated_at: record.updatedAt,
  };
}

export function rowToPublication(row: CazaPublicationRow): DealPublicationRecord {
  if (!row?.publication_id) throw new Error('caza.mapper.publication_id_missing');

  const metrics: DealPublicationMetrics = {
    clicks: row.metrics_clicks,
    orders: row.metrics_orders,
    approvedOrders: row.metrics_approved_orders,
    units: null,
    grossSales: null,
    estimatedCommission:
      row.metrics_estimated_commission_amount != null &&
      row.metrics_estimated_commission_currency
        ? {
            value: requireNum(
              row.metrics_estimated_commission_amount,
              'metrics_estimated_commission_amount'
            ),
            currency: row.metrics_estimated_commission_currency as CazaCurrency,
          }
        : null,
    commission:
      row.metrics_estimated_commission_amount != null &&
      row.metrics_estimated_commission_currency
        ? {
            value: requireNum(
              row.metrics_estimated_commission_amount,
              'metrics_estimated_commission_amount'
            ),
            currency: row.metrics_estimated_commission_currency as CazaCurrency,
          }
        : null,
    approvedCommission:
      row.metrics_approved_commission_amount != null &&
      row.metrics_approved_commission_currency
        ? {
            value: requireNum(
              row.metrics_approved_commission_amount,
              'metrics_approved_commission_amount'
            ),
            currency: row.metrics_approved_commission_currency as CazaCurrency,
          }
        : null,
    cancelledCommission: null,
    lastSyncedAt: row.metrics_last_synced_at,
  };

  const snapshotParsed = parseCardSnapshot(row.card_snapshot);
  if (!snapshotParsed.ok) {
    throw new Error(`caza.mapper.card_snapshot_invalid:${snapshotParsed.reasons.join(',')}`);
  }

  return {
    publicationId: row.publication_id,
    dealId: row.deal_id,
    store: row.store as CazaStoreId,
    affiliateNetwork: row.affiliate_network as AffiliateNetworkId,
    trackingLabel: row.tracking_label,
    telegramChannel: row.telegram_channel,
    telegramMessageId: row.telegram_message_id,
    telegramChatId: row.telegram_chat_id ?? null,
    publishedAt: row.published_at,
    status: row.status as PublicationStatus,
    metrics,
    preparedAt: iso(row.prepared_at),
    affiliateUrl: row.affiliate_url,
    publishedRevision: row.published_revision,
    attemptCount: row.attempt_count ?? 0,
    maxAttempts: row.max_attempts ?? 5,
    nextAttemptAt: row.next_attempt_at ?? null,
    leasedUntil: row.leased_until ?? null,
    leaseOwner: row.lease_owner ?? null,
    lastErrorCode: row.last_error_code ?? null,
    lastErrorMessage: row.last_error_message ?? null,
    updatedAt: iso(row.updated_at ?? row.prepared_at),
    cardSnapshot: snapshotParsed.value,
  };
}

export function revenueEventToRow(event: AffiliateRevenueEvent): CazaRevenueEventRow {
  return {
    event_id: event.eventId,
    network: event.network,
    external_reference: event.externalReference,
    deal_id: event.dealId,
    tracking_label: event.trackingLabel,
    event_type: event.eventType,
    amount: event.amount?.value ?? null,
    currency: event.currency ?? event.amount?.currency ?? null,
    occurred_at: event.occurredAt,
    status: event.status,
    reverses_event_id: event.reversesEventId,
    recorded_at: event.recordedAt,
    gross_amount: event.grossAmount?.value ?? null,
    source_batch_id: event.sourceBatchId ?? null,
    product_external_id: event.productExternalId ?? null,
    product_reference: event.productReference ?? null,
  };
}

export function rowToRevenueEvent(row: CazaRevenueEventRow): AffiliateRevenueEvent {
  if (!row?.event_id) throw new Error('caza.mapper.event_id_missing');
  const amountValue = num(row.amount);
  const grossValue = num(row.gross_amount);
  return {
    eventId: row.event_id,
    network: row.network as AffiliateNetworkId,
    externalReference: row.external_reference,
    dealId: row.deal_id,
    trackingLabel: row.tracking_label,
    eventType: row.event_type as AffiliateRevenueEvent['eventType'],
    amount:
      amountValue !== null && row.currency
        ? { value: amountValue, currency: row.currency as CazaCurrency }
        : null,
    currency: (row.currency as CazaCurrency | null) ?? null,
    occurredAt: iso(row.occurred_at),
    status: row.status as AffiliateRevenueEvent['status'],
    reversesEventId: row.reverses_event_id,
    recordedAt: iso(row.recorded_at),
    grossAmount:
      grossValue !== null && row.currency
        ? { value: grossValue, currency: row.currency as CazaCurrency }
        : null,
    sourceBatchId: row.source_batch_id ?? null,
    productExternalId: row.product_external_id ?? null,
    productReference: row.product_reference ?? null,
  };
}

/** Payload JSONB para RPCs (nulls → string vacía donde el SQL usa NULLIF). */
export function dealCandidateRowToRpcPayload(row: CazaDealCandidateRow): Record<string, unknown> {
  return {
    ...row,
    reference_price: row.reference_price ?? '',
    external_product_id: row.external_product_id ?? '',
    seller_external_id: row.seller_external_id ?? '',
    seller_display_name: row.seller_display_name ?? '',
    seller_reputation_score: row.seller_reputation_score ?? '',
    score_gates_failed: row.score_gates_failed ?? [],
    evidence_reference_price: row.evidence_reference_price ?? '',
    evidence_observation_window_days: row.evidence_observation_window_days ?? '',
    evidence_observation_count: row.evidence_observation_count ?? '',
    evidence_notes: row.evidence_notes ?? '',
    affiliate_url: row.affiliate_url ?? '',
    affiliate_network: row.affiliate_network ?? '',
    affiliate_tracking_label: row.affiliate_tracking_label ?? '',
    affiliate_generated_at: row.affiliate_generated_at ?? '',
    affiliate_credential_ref: row.affiliate_credential_ref ?? '',
  };
}

export function publicationRowToRpcPayload(row: CazaPublicationRow): Record<string, unknown> {
  return {
    ...row,
    telegram_message_id: row.telegram_message_id ?? '',
    telegram_chat_id: row.telegram_chat_id ?? '',
    published_at: row.published_at ?? '',
    affiliate_url: row.affiliate_url ?? '',
    published_revision: row.published_revision ?? '',
    next_attempt_at: row.next_attempt_at ?? '',
    leased_until: row.leased_until ?? '',
    lease_owner: row.lease_owner ?? '',
    last_error_code: row.last_error_code ?? '',
    last_error_message: row.last_error_message ?? '',
    card_snapshot: row.card_snapshot ?? null,
    metrics_clicks: row.metrics_clicks ?? '',
    metrics_orders: row.metrics_orders ?? '',
    metrics_approved_orders: row.metrics_approved_orders ?? '',
    metrics_estimated_commission_amount: row.metrics_estimated_commission_amount ?? '',
    metrics_estimated_commission_currency: row.metrics_estimated_commission_currency ?? '',
    metrics_approved_commission_amount: row.metrics_approved_commission_amount ?? '',
    metrics_approved_commission_currency: row.metrics_approved_commission_currency ?? '',
    metrics_last_synced_at: row.metrics_last_synced_at ?? '',
  };
}

export function revenueEventRowToRpcPayload(row: CazaRevenueEventRow): Record<string, unknown> {
  return {
    ...row,
    deal_id: row.deal_id ?? '',
    amount: row.amount ?? '',
    currency: row.currency ?? '',
    reverses_event_id: row.reverses_event_id ?? '',
    gross_amount: row.gross_amount ?? '',
    source_batch_id: row.source_batch_id ?? '',
    product_external_id: row.product_external_id ?? '',
    product_reference: row.product_reference ?? '',
  };
}
