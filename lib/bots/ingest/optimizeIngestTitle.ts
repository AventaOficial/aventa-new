import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

const MAX_LEN = 500;

/**
 * Título orientado a CTR: mantiene el nombre del producto y añade ahorro visible.
 */
export function optimizeIngestTitle(meta: ParsedOfferMetadata): string {
  const base = meta.title.replace(/\s+/g, ' ').trim();
  const store = meta.store.trim() || 'tienda';
  const pct = meta.discountPercent;
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
