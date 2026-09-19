/**
 * CazaOfertasss — Snapshot inmutable de tarjeta Telegram.
 *
 * Congelado en PREPARE. Una vez persistido, no se regenera ni se muta.
 * El envío usa este snapshot, nunca una tarjeta recalculada del candidato.
 */

import type { CazaResult, CazaStoreId, DealCandidate, IsoTimestamp } from '../types';
import { failResult, okResult } from '../types';
import type { TelegramDealCard } from '../telegram/card';

export interface TelegramCardSnapshot {
  readonly text: string;
  readonly affiliateUrl: string;
  readonly publicationId: string;
  readonly dealId: string;
  readonly identityKey: string;
  readonly candidateRevision: number;
  readonly store: CazaStoreId;
  readonly externalProductId: string | null;
  readonly generatedAt: IsoTimestamp;
}

export interface BuildCardSnapshotInput {
  readonly publicationId: string;
  readonly candidate: DealCandidate;
  readonly card: TelegramDealCard;
  readonly generatedAt: IsoTimestamp;
}

export function buildTelegramCardSnapshot(
  input: BuildCardSnapshotInput
): CazaResult<TelegramCardSnapshot> {
  const { publicationId, candidate, card, generatedAt } = input;
  const reasons: string[] = [];

  if (!publicationId || !publicationId.includes('|')) {
    reasons.push('snapshot.publication_id_invalid');
  }
  if (card.dealId !== candidate.id) {
    reasons.push('snapshot.deal_id_mismatch');
  }
  if (!candidate.affiliateUrl || card.ctaUrl !== candidate.affiliateUrl) {
    reasons.push('snapshot.affiliate_url_mismatch');
  }
  if (typeof card.text !== 'string' || card.text.trim().length === 0) {
    reasons.push('snapshot.text_empty');
  }
  if (!card.text.includes(candidate.affiliateUrl ?? '')) {
    reasons.push('snapshot.text_missing_affiliate_url');
  }
  if (!Number.isFinite(Date.parse(generatedAt))) {
    reasons.push('snapshot.generated_at_invalid');
  }
  if (candidate.revision < 1) {
    reasons.push('snapshot.revision_invalid');
  }

  if (reasons.length > 0) return failResult(reasons);

  return okResult({
    publicationId,
    dealId: candidate.id,
    identityKey: candidate.identity.key,
    candidateRevision: candidate.revision,
    store: candidate.store,
    externalProductId: candidate.externalProductId,
    affiliateUrl: candidate.affiliateUrl as string,
    text: card.text,
    generatedAt,
  });
}

/** Comparación estructural determinista (orden de claves fijo). */
export function cardSnapshotsEqual(
  a: TelegramCardSnapshot | null | undefined,
  b: TelegramCardSnapshot | null | undefined
): boolean {
  if (a == null || b == null) return a === b;
  return (
    a.publicationId === b.publicationId &&
    a.dealId === b.dealId &&
    a.identityKey === b.identityKey &&
    a.candidateRevision === b.candidateRevision &&
    a.store === b.store &&
    a.externalProductId === b.externalProductId &&
    a.affiliateUrl === b.affiliateUrl &&
    a.text === b.text &&
    a.generatedAt === b.generatedAt
  );
}

/**
 * Una vez que existe un snapshot, cualquier intento de sustituirlo por otro
 * distinto es un error de contrato (inmutabilidad).
 */
export function assertCardSnapshotImmutable(
  existing: TelegramCardSnapshot | null | undefined,
  incoming: TelegramCardSnapshot | null | undefined
): CazaResult<TelegramCardSnapshot | null> {
  if (existing == null) {
    return okResult(incoming ?? null);
  }
  if (incoming == null) {
    return okResult(existing);
  }
  if (!cardSnapshotsEqual(existing, incoming)) {
    return failResult(['snapshot.immutable_violation']);
  }
  return okResult(existing);
}

export function parseCardSnapshot(raw: unknown): CazaResult<TelegramCardSnapshot> {
  if (raw === null || typeof raw !== 'object') {
    return failResult(['snapshot.parse_not_object']);
  }
  const o = raw as Record<string, unknown>;
  const required = [
    'text',
    'affiliateUrl',
    'publicationId',
    'dealId',
    'identityKey',
    'candidateRevision',
    'store',
    'generatedAt',
  ] as const;
  for (const key of required) {
    if (o[key] === undefined || o[key] === null) {
      return failResult([`snapshot.missing:${key}`]);
    }
  }
  if (typeof o.text !== 'string' || o.text.trim().length === 0) {
    return failResult(['snapshot.text_empty']);
  }
  if (typeof o.affiliateUrl !== 'string' || !/^https:\/\//.test(o.affiliateUrl)) {
    return failResult(['snapshot.affiliate_url_invalid']);
  }
  if (!o.text.includes(o.affiliateUrl)) {
    return failResult(['snapshot.text_missing_affiliate_url']);
  }
  if (typeof o.candidateRevision !== 'number' || o.candidateRevision < 1) {
    return failResult(['snapshot.revision_invalid']);
  }
  if (o.store !== 'amazon_mx' && o.store !== 'mercadolibre_mx') {
    return failResult(['snapshot.store_invalid']);
  }
  if (!Number.isFinite(Date.parse(String(o.generatedAt)))) {
    return failResult(['snapshot.generated_at_invalid']);
  }

  return okResult({
    text: o.text,
    affiliateUrl: o.affiliateUrl,
    publicationId: String(o.publicationId),
    dealId: String(o.dealId),
    identityKey: String(o.identityKey),
    candidateRevision: o.candidateRevision,
    store: o.store,
    externalProductId:
      o.externalProductId === null || o.externalProductId === undefined
        ? null
        : String(o.externalProductId),
    generatedAt: String(o.generatedAt),
  });
}
