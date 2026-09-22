import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

const MAX_LEN = 500;

/**
 * Título orientado a CTR: mantiene el nombre del producto y añade ahorro visible.
 */
export function optimizeIngestTitle(meta: ParsedOfferMetadata): string {
  const base = meta.title.replace(/\s+/g, ' ').trim();
  const store = meta.store.trim() || 'tienda';
  // UNKNOWN → no "% off" claim in title (existing policy for low %).
  const pct =
    meta.discountPercent != null && Number.isFinite(meta.discountPercent)
      ? Math.max(0, Math.min(90, Math.round(meta.discountPercent)))
      : 0;
  const suffix = pct >= 10 ? ` — Ahorra ~${pct}% en ${store}` : ` — Oferta en ${store}`;
  let out = base;
  if (!base.toLowerCase().includes(`${pct}%`) && pct >= 10) {
    out = `${base}${suffix}`;
  } else if (base.length < 40) {
    out = `${base}${suffix}`;
  }
  if (out.length > MAX_LEN) out = out.slice(0, MAX_LEN - 1).trimEnd() + '…';
  return out;
}
