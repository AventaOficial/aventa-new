/**
 * CazaOfertasss — Tracking + outbox de publicación.
 *
 * Autoridad: esta capa OBSERVA y orquesta el ciclo de vida del registro de
 * publicación. No envía a Telegram (eso es el adapter) y no deduce dinero.
 *
 * Estados:
 *   PREPARED  — elegible / en cola / pendiente de retry
 *   SENDING   — lease activo; un worker posee el envío
 *   PUBLISHED — terminal éxito
 *   FAILED    — terminal no recuperable (auth, unknown outcome, max attempts)
 *   RETRACTED — terminal retirada manual
 */

import {
  PUBLICATION_MAX_ATTEMPTS,
  PUBLICATION_RETRY_BASE_MS,
  PUBLICATION_RETRY_MAX_MS,
} from '../constants';
import type {
  AffiliateNetworkId,
  CazaResult,
  CazaStoreId,
  IsoTimestamp,
  MoneyAmount,
} from '../types';
import { failResult, okResult } from '../types';
import { isValidTrackingLabel } from '../affiliate';
import type { TelegramCardSnapshot } from '../publication/cardSnapshot';

export type PublicationStatus =
  | 'PREPARED'
  | 'SENDING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'RETRACTED';

export type PublicationTerminalStatus = 'PUBLISHED' | 'FAILED' | 'RETRACTED';

/**
 * Métricas de desempeño. Todas nullable a propósito: se poblarán cuando exista
 * un reporte de la red, no antes. UNKNOWN ⇒ null, nunca 0 inventado.
 */
export interface DealPublicationMetrics {
  readonly clicks: number | null;
  readonly orders: number | null;
  readonly approvedOrders: number | null;
  /** FASE 3.2 — unidades; null hasta fuente oficial. */
  readonly units: number | null;
  /** FASE 3.2 — ventas brutas; null hasta evidencia. */
  readonly grossSales: MoneyAmount | null;
  /**
   * Comisión estimada/reportada (nullable).
   * Persistida históricamente como metrics_estimated_commission_*.
   */
  readonly estimatedCommission: MoneyAmount | null;
  /** Alias FASE 3.2 canónico de estimatedCommission (misma semántica nullable). */
  readonly commission: MoneyAmount | null;
  readonly approvedCommission: MoneyAmount | null;
  /** FASE 3.2 — comisión cancelada/revertida agregada; null si desconocida. */
  readonly cancelledCommission: MoneyAmount | null;
  readonly lastSyncedAt: IsoTimestamp | null;
}

export const EMPTY_PUBLICATION_METRICS: DealPublicationMetrics = {
  clicks: null,
  orders: null,
  approvedOrders: null,
  units: null,
  grossSales: null,
  estimatedCommission: null,
  commission: null,
  approvedCommission: null,
  cancelledCommission: null,
  lastSyncedAt: null,
};

export interface DealPublicationRecord {
  readonly publicationId: string;
  readonly dealId: string;
  readonly store: CazaStoreId;
  readonly affiliateNetwork: AffiliateNetworkId;
  readonly trackingLabel: string;
  readonly telegramChannel: string;
  /** `null` hasta que Telegram confirme el envío. */
  readonly telegramMessageId: string | null;
  /** chat_id efectivo usado en el envío (puede coincidir con el canal). */
  readonly telegramChatId: string | null;
  readonly publishedAt: IsoTimestamp | null;
  readonly status: PublicationStatus;
  readonly metrics: DealPublicationMetrics;
  readonly preparedAt: IsoTimestamp;
  /** URL afiliada validada por el dominio. Obligatoria al preparar. */
  readonly affiliateUrl: string | null;
  /** Revision del DealCandidate al preparar/publicar. */
  readonly publishedRevision: number | null;
  /** Contador de intentos de envío (incluye el claim actual). */
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly nextAttemptAt: IsoTimestamp | null;
  readonly leasedUntil: IsoTimestamp | null;
  readonly leaseOwner: string | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly updatedAt: IsoTimestamp;
  /**
   * Snapshot inmutable de la tarjeta. Obligatorio desde PREPARE.
   * No se regenera ni muta tras insertar.
   */
  readonly cardSnapshot: TelegramCardSnapshot;
}

export interface BuildPublicationRecordInput {
  readonly dealId: string;
  readonly store: CazaStoreId;
  readonly affiliateNetwork: AffiliateNetworkId;
  readonly trackingLabel: string;
  readonly telegramChannel: string;
  readonly preparedAt: IsoTimestamp;
  readonly affiliateUrl: string;
  readonly publishedRevision: number;
  readonly cardSnapshot: TelegramCardSnapshot;
  readonly maxAttempts?: number;
}

/** Canal de Telegram: `@handle` o id numérico negativo de supergrupo. */
export const TELEGRAM_CHANNEL_PATTERN = /^(@[A-Za-z][A-Za-z0-9_]{4,31}|-100\d{6,16})$/;

/**
 * Identidad de tracking. Determinista y estable: permite idempotencia de
 * publicación sin depender de un id generado al azar.
 */
export function publicationIdentityKey(input: {
  dealId: string;
  affiliateNetwork: AffiliateNetworkId;
  telegramChannel: string;
  trackingLabel: string;
}): string {
  return [input.dealId, input.affiliateNetwork, input.telegramChannel, input.trackingLabel].join(
    '|'
  );
}

export function isTerminalPublicationStatus(status: PublicationStatus): boolean {
  return status === 'PUBLISHED' || status === 'FAILED' || status === 'RETRACTED';
}

export function buildPublicationRecord(
  input: BuildPublicationRecordInput
): CazaResult<DealPublicationRecord> {
  const reasons: string[] = [];

  if (typeof input.dealId !== 'string' || !/^caza_[a-z0-9_]+$/.test(input.dealId)) {
    reasons.push('publication.deal_id_invalid');
  }
  if (!isValidTrackingLabel(input.trackingLabel)) {
    reasons.push('publication.tracking_label_invalid');
  }
  if (!TELEGRAM_CHANNEL_PATTERN.test(input.telegramChannel)) {
    reasons.push('publication.telegram_channel_invalid');
  }
  if (!Number.isFinite(Date.parse(input.preparedAt))) {
    reasons.push('publication.prepared_at_invalid');
  }
  if (typeof input.affiliateUrl !== 'string' || !/^https:\/\//.test(input.affiliateUrl)) {
    reasons.push('publication.affiliate_url_invalid');
  }
  if (
    typeof input.publishedRevision !== 'number' ||
    !Number.isInteger(input.publishedRevision) ||
    input.publishedRevision < 1
  ) {
    reasons.push('publication.published_revision_invalid');
  }
  if (!input.cardSnapshot) {
    reasons.push('publication.card_snapshot_missing');
  } else {
    if (input.cardSnapshot.dealId !== input.dealId) {
      reasons.push('publication.card_snapshot_deal_mismatch');
    }
    if (input.cardSnapshot.affiliateUrl !== input.affiliateUrl) {
      reasons.push('publication.card_snapshot_affiliate_mismatch');
    }
    if (input.cardSnapshot.candidateRevision !== input.publishedRevision) {
      reasons.push('publication.card_snapshot_revision_mismatch');
    }
    if (input.cardSnapshot.store !== input.store) {
      reasons.push('publication.card_snapshot_store_mismatch');
    }
    if (!input.cardSnapshot.text.includes(input.affiliateUrl)) {
      reasons.push('publication.card_snapshot_text_missing_affiliate');
    }
  }

  if (reasons.length > 0) return failResult(reasons);

  const publicationId = publicationIdentityKey(input);
  if (input.cardSnapshot.publicationId !== publicationId) {
    return failResult(['publication.card_snapshot_publication_id_mismatch']);
  }

  const maxAttempts =
    typeof input.maxAttempts === 'number' && input.maxAttempts >= 1
      ? Math.min(Math.floor(input.maxAttempts), 20)
      : PUBLICATION_MAX_ATTEMPTS;

  return okResult({
    publicationId,
    dealId: input.dealId,
    store: input.store,
    affiliateNetwork: input.affiliateNetwork,
    trackingLabel: input.trackingLabel,
    telegramChannel: input.telegramChannel,
    telegramMessageId: null,
    telegramChatId: null,
    publishedAt: null,
    status: 'PREPARED',
    metrics: EMPTY_PUBLICATION_METRICS,
    preparedAt: input.preparedAt,
    affiliateUrl: input.affiliateUrl,
    publishedRevision: input.publishedRevision,
    attemptCount: 0,
    maxAttempts,
    nextAttemptAt: null,
    leasedUntil: null,
    leaseOwner: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: input.preparedAt,
    cardSnapshot: input.cardSnapshot,
  });
}

/** Transición SENDING|PREPARED → PUBLISHED. Sólo el envío confirmado la produce. */
export function markPublicationPublished(
  record: DealPublicationRecord,
  telegramMessageId: string,
  publishedAt: IsoTimestamp,
  options?: { telegramChatId?: string | null }
): CazaResult<DealPublicationRecord> {
  if (record.status !== 'PREPARED' && record.status !== 'SENDING') {
    return failResult([`publication.invalid_transition:${record.status}->PUBLISHED`]);
  }
  if (typeof telegramMessageId !== 'string' || !/^\d{1,20}$/.test(telegramMessageId)) {
    return failResult(['publication.telegram_message_id_invalid']);
  }
  if (!Number.isFinite(Date.parse(publishedAt))) {
    return failResult(['publication.published_at_invalid']);
  }
  return okResult({
    ...record,
    status: 'PUBLISHED',
    telegramMessageId,
    telegramChatId: options?.telegramChatId ?? record.telegramChatId ?? record.telegramChannel,
    publishedAt,
    leasedUntil: null,
    leaseOwner: null,
    nextAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAt: publishedAt,
  });
}

export function markPublicationFailed(
  record: DealPublicationRecord,
  code: string,
  message: string,
  failedAt: IsoTimestamp
): CazaResult<DealPublicationRecord> {
  if (isTerminalPublicationStatus(record.status) && record.status !== 'FAILED') {
    return failResult([`publication.invalid_transition:${record.status}->FAILED`]);
  }
  return okResult({
    ...record,
    status: 'FAILED',
    leasedUntil: null,
    leaseOwner: null,
    nextAttemptAt: null,
    lastErrorCode: code.slice(0, 64),
    lastErrorMessage: message.slice(0, 500),
    updatedAt: failedAt,
  });
}

/** Backoff exponencial con jitter determinista por attemptCount. */
export function computePublicationBackoffMs(attemptCount: number): number {
  const attempt = Math.max(1, attemptCount);
  const exp = Math.min(
    PUBLICATION_RETRY_MAX_MS,
    PUBLICATION_RETRY_BASE_MS * 2 ** Math.min(attempt - 1, 10)
  );
  // Jitter estable (no random): evita thundering herd sin no-determinismo en tests.
  const jitter = (attempt * 37) % Math.max(1, Math.floor(exp * 0.2));
  return Math.min(PUBLICATION_RETRY_MAX_MS, exp + jitter);
}

export function schedulePublicationRetry(
  record: DealPublicationRecord,
  code: string,
  message: string,
  now: Date
): CazaResult<DealPublicationRecord> {
  if (record.status !== 'SENDING' && record.status !== 'PREPARED') {
    return failResult([`publication.invalid_transition:${record.status}->PREPARED(retry)`]);
  }
  if (record.attemptCount >= record.maxAttempts) {
    return markPublicationFailed(record, 'publication.max_attempts', message, now.toISOString());
  }
  const delay = computePublicationBackoffMs(record.attemptCount);
  const nextAttemptAt = new Date(now.getTime() + delay).toISOString();
  return okResult({
    ...record,
    status: 'PREPARED',
    leasedUntil: null,
    leaseOwner: null,
    nextAttemptAt,
    lastErrorCode: code.slice(0, 64),
    lastErrorMessage: message.slice(0, 500),
    updatedAt: now.toISOString(),
  });
}

export interface PublicationIdempotentSaveResult {
  readonly inserted: boolean;
  readonly record: DealPublicationRecord;
}

export interface ClaimPublicationInput {
  readonly publicationId: string;
  readonly leaseOwner: string;
  readonly leaseDurationMs: number;
  readonly now: Date;
}

export interface ClaimPublicationResult {
  readonly claimed: boolean;
  readonly record: DealPublicationRecord | null;
  readonly reason?: string;
}

/** Repositorio de publicaciones. Lookup por identidad, nunca scan global. */
export interface DealPublicationRepository {
  findByIdentityKey(publicationId: string): Promise<DealPublicationRecord | null>;
  save(record: DealPublicationRecord): Promise<void>;
  /**
   * Insert idempotente: dos escritores concurrentes sobre la misma
   * `publicationId` producen una sola fila lógica.
   */
  saveIdempotent(record: DealPublicationRecord): Promise<PublicationIdempotentSaveResult>;
  listByDealId(dealId: string, limit: number): Promise<readonly DealPublicationRecord[]>;

  /**
   * Claim atómico PREPARED → SENDING. Devuelve null si otro worker ganó,
   * si el lease está vivo, o si el registro es terminal.
   */
  claimForSend(input: ClaimPublicationInput): Promise<ClaimPublicationResult>;

  /** Persistencia condicional al leaseOwner (evita pisar un claim ajeno). */
  saveClaimed(record: DealPublicationRecord, leaseOwner: string): Promise<boolean>;

  /**
   * Lista bounded de publicaciones PREPARED cuyo next_attempt_at ya venció
   * (o es null). Orden determinista por prepared_at, publication_id.
   */
  listDueForSend(limit: number, now: Date): Promise<readonly DealPublicationRecord[]>;

  /**
   * Recupera leases SENDING expirados sin message_id:
   *  - sin last_error desconocido → PREPARED (crash antes/durante send)
   *  - con error unknown → FAILED (no auto-retry; evita duplicados)
   */
  recoverExpiredLeases(now: Date, limit: number): Promise<number>;
}
