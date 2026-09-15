import { ALL_CATEGORIES, normalizeCategoryForStorage, type CategoryId } from '@/lib/categories';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

function fmt(n: number): string {
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function categoryLabel(cat: CategoryId | null): string | null {
  if (!cat) return null;
  return ALL_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

/**
 * Descripción determinística para ofertas bot (sin IA).
 * Solo usa datos estructurados verificados en meta/categoría.
 * Nunca inventa specs, disponibilidad, garantía ni claims del vendedor.
 */
export function buildBotOfferDescription(
  meta: ParsedOfferMetadata,
  category: string | null
): string {
  const norm = normalizeCategoryForStorage(category) as CategoryId | null;
  const store = meta.store.trim() || null;
  const title = meta.title.replace(/\s+/g, ' ').trim().slice(0, 120);
  const price = fmt(meta.discountPrice);
  const hasOriginal =
    meta.originalPrice != null && meta.originalPrice > meta.discountPrice;
  const original = hasOriginal ? fmt(meta.originalPrice!) : null;
  const pct = hasOriginal
    ? Math.round((1 - meta.discountPrice / meta.originalPrice!) * 100)
    : null;

  const parts: string[] = [];
  if (title) {
    if (store) parts.push(`${title} disponible en ${store} por $${price}.`);
    else parts.push(`${title} por $${price}.`);
  } else if (store) {
    parts.push(`Oferta en ${store} por $${price}.`);
  } else {
    parts.push(`Oferta por $${price}.`);
  }

  if (original) {
    const saveBit = pct != null && pct > 0 ? ` (ahorro aprox. ${pct}%)` : '';
    parts.push(`Precio de referencia $${original}${saveBit}.`);
  }

  const cat = categoryLabel(norm);
  if (cat) parts.push(`Categoría: ${cat}.`);

  parts.push('Revisa disponibilidad, envío y condiciones en el enlace antes de comprar.');
  return parts.join(' ').slice(0, 2000);
}
