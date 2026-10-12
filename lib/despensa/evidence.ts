import { despensaSourceForUrl } from '@/lib/despensa/sources';

/**
 * Nivel de evidencia del precio con los datos que el feed tiene de verdad.
 *
 * - `published_with_validity`: tienda identificable y vigencia conocida y futura.
 * - `published_source`: tienda identificable por el dominio de la oferta.
 * - `reported`: precio enviado sin tienda identificable (comunidad u otro origen).
 * - `incomplete`: falta precio o título.
 *
 * `history_confirmed` existe en el contrato, pero el feed no lee historial de precios
 * (`offer_price_snapshots` / `product_price_snapshots`); hoy nunca se asigna.
 */
export type EvidenceLevel =
  | 'history_confirmed'
  | 'published_with_validity'
  | 'published_source'
  | 'reported'
  | 'incomplete';

export const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
  history_confirmed: 0,
  published_with_validity: 1,
  published_source: 2,
  reported: 3,
  incomplete: 4,
};

export type EvidenceInput = {
  title?: string | null;
  price?: number | null;
  sourceUrl?: string | null;
  sourceHost?: string | null;
  expiresAt?: string | null;
};

export function evidenceLevel(input: EvidenceInput, now: Date): EvidenceLevel {
  if (!input.title?.trim() || input.price == null || !(input.price > 0)) return 'incomplete';
  const url = input.sourceUrl ?? (input.sourceHost ? `https://${input.sourceHost}` : null);
  const source = despensaSourceForUrl(url);
  if (!source) return 'reported';
  const expires = input.expiresAt ? Date.parse(input.expiresAt) : NaN;
  if (Number.isFinite(expires) && expires > now.getTime()) return 'published_with_validity';
  return 'published_source';
}

/**
 * Un descuento solo es «confirmado» con precio de lista de procedencia confiable
 * o historial. El feed no trae esa procedencia, así que aquí nunca se confirma.
 */
export function discountIsVerified(): false {
  return false;
}

export type Freshness = 'fresh' | 'recent' | 'stale' | 'unknown';

export function evidenceFreshness(observedAt: string | null | undefined, now: Date, maxAgeDays: number): Freshness {
  const t = observedAt ? Date.parse(observedAt) : NaN;
  if (!Number.isFinite(t)) return 'unknown';
  const ageDays = (now.getTime() - t) / 86_400_000;
  if (ageDays > maxAgeDays) return 'stale';
  if (ageDays <= 2) return 'fresh';
  return 'recent';
}
