import { createHash } from 'node:crypto';

/** Stable observation replay key. Identical payload → same key. */
export function buildObservationIdempotencyKey(input: {
  identityKey: string;
  source: string;
  canonicalUrl?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  previousPrice?: number | null;
  seller?: string | null;
}): string {
  const parts = [
    input.identityKey,
    input.source.trim().toLowerCase(),
    (input.canonicalUrl ?? '').trim(),
    (input.title ?? '').trim().toLowerCase(),
    (input.imageUrl ?? '').trim(),
    input.price == null || !Number.isFinite(input.price) ? '' : String(input.price),
    input.previousPrice == null || !Number.isFinite(input.previousPrice)
      ? ''
      : String(input.previousPrice),
    (input.seller ?? '').trim().toLowerCase(),
  ].join('\u001f');
  return createHash('sha256').update(parts).digest('hex').slice(0, 48);
}
