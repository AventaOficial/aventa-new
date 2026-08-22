import { ALL_CATEGORIES, normalizeCategoryForStorage, type CategoryId } from '@/lib/categories';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

function fmt(n: number): string {
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function categoryLabel(cat: CategoryId | null): string {
  if (!cat) return 'esta categoría';
  return ALL_CATEGORIES.find((c) => c.value === cat)?.label.toLowerCase() ?? cat;
}

/**
 * Descripción legible para el feed (sin IA). Plantilla por macro categoría.
 */
export function buildBotOfferDescription(
  meta: ParsedOfferMetadata,
  category: string | null
): string {
  const norm = normalizeCategoryForStorage(category) as CategoryId | null;
  const store = meta.store.trim() || 'la tienda';
  const title = meta.title.replace(/\s+/g, ' ').trim().slice(0, 120);
  const price = fmt(meta.discountPrice);
  const hasOriginal =
    meta.originalPrice != null && meta.originalPrice > meta.discountPrice;
  const original = hasOriginal ? fmt(meta.originalPrice!) : null;
  const pct = hasOriginal
    ? Math.round((1 - meta.discountPrice / meta.originalPrice!) * 100)
    : Math.max(0, Math.round(meta.discountPercent ?? 0));

  const priceLine = original
    ? `Precio publicado: $${price} (antes $${original}${pct > 0 ? `, ~${pct}% menos` : ''}).`
    : `Precio publicado: $${price}.`;

  const verify =
    'Revisa disponibilidad, envío y condiciones en el enlace antes de comprar.';

  switch (norm) {
    case 'supermercado':
      return `${title} — oferta en ${store}. ${priceLine} Ideal para despensa y consumo del día a día. ${verify}`;
    case 'hogar':
      return `${title} — producto para el hogar en ${store}. ${priceLine} Verifica presentación y compatibilidad en la ficha. ${verify}`;
    case 'belleza':
      return `${title} — cuidado personal en ${store}. ${priceLine} Confirma talla/volumen en la tienda. ${verify}`;
    case 'moda':
      return `${title} — moda en ${store}. ${priceLine} Revisa tallas, color y política de cambios. ${verify}`;
    case 'servicios':
      return `${title} — promoción en ${store}. ${priceLine} Aplica términos del servicio (vigencia, cobertura, app). ${verify}`;
    case 'viajes':
      return `${title} — viaje en ${store}. ${priceLine} Confirma fechas, destino y cargos extra. ${verify}`;
    case 'gaming':
      return `${title} — gaming en ${store}. ${priceLine} Verifica región, edición y compatibilidad. ${verify}`;
    case 'tecnologia':
      return `${title} — tecnología en ${store}. ${priceLine} Revisa specs y garantía en la ficha oficial. ${verify}`;
    default:
      return `${title} — oferta en ${store} (${categoryLabel(norm)}). ${priceLine} ${verify}`;
  }
}
