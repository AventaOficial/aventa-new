import {
  isVitalCategory,
  normalizeCategoryForStorage,
  type CategoryId,
} from '@/lib/categories';

/** Prioridad de categorías vitales en cola (Día a día primero). */
const VITAL_CATEGORY_ORDER: CategoryId[] = [
  'supermercado',
  'hogar',
  'servicios',
  'belleza',
  'moda',
  'viajes',
];

export type ModerationSortableOffer = {
  title?: string | null;
  price?: number | null;
  original_price?: number | null;
  image_url?: string | null;
  category?: string | null;
  created_at: string;
  is_bot?: boolean;
  moderator_comment?: string | null;
  description?: string | null;
};

function getDiscountPercent(offer: ModerationSortableOffer): number {
  const price = Number(offer.price ?? 0);
  const original = Number(offer.original_price ?? 0);
  if (!Number.isFinite(price) || !Number.isFinite(original)) return 0;
  if (original <= 0 || original <= price) return 0;
  return Math.round(((original - price) / original) * 100);
}

function isBotOffer(o: ModerationSortableOffer): boolean {
  return (
    o.is_bot === true ||
    (o.moderator_comment ?? '').toLowerCase().includes('[bot-ingest]') ||
    (o.description ?? '').toLowerCase().includes('ingesta automática (bot)')
  );
}

function categorySortIndex(category: string | null | undefined): number {
  const norm = normalizeCategoryForStorage(category ?? null);
  if (!norm) return 100;
  if (isVitalCategory(norm)) {
    const idx = VITAL_CATEGORY_ORDER.indexOf(norm as CategoryId);
    return idx >= 0 ? idx : 50;
  }
  if (norm === 'tecnologia') return 80;
  if (norm === 'gaming') return 81;
  return 90;
}

function needsModerationFix(o: ModerationSortableOffer): boolean {
  const noImage = !o.image_url?.trim();
  const noCategory = !normalizeCategoryForStorage(o.category ?? null);
  return noImage || noCategory;
}

/**
 * Orden de cola: vitales primero, sin foto/categoría arriba, luego mayor descuento.
 */
export function sortPendingOffersForModeration<T extends ModerationSortableOffer>(
  offers: T[]
): T[] {
  return [...offers].sort((a, b) => {
    const aFix = needsModerationFix(a) ? 0 : 1;
    const bFix = needsModerationFix(b) ? 0 : 1;
    if (aFix !== bFix) return aFix - bFix;

    const aVital = isVitalCategory(a.category ?? null) ? 0 : 1;
    const bVital = isVitalCategory(b.category ?? null) ? 0 : 1;
    if (aVital !== bVital) return aVital - bVital;

    const aCat = categorySortIndex(a.category);
    const bCat = categorySortIndex(b.category);
    if (aCat !== bCat) return aCat - bCat;

    const aFree = Number(a.price ?? 0) <= 0 ? 1 : 0;
    const bFree = Number(b.price ?? 0) <= 0 ? 1 : 0;
    if (aFree !== bFree) return bFree - aFree;

    const aDisc = getDiscountPercent(a);
    const bDisc = getDiscountPercent(b);
    if (aDisc !== bDisc) return bDisc - aDisc;

    if (isBotOffer(a) !== isBotOffer(b)) return isBotOffer(a) ? -1 : 1;

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export function offerMatchesVitalFilter(o: ModerationSortableOffer): boolean {
  return isVitalCategory(o.category ?? null);
}

export function offerNeedsFixFilter(o: ModerationSortableOffer): boolean {
  return needsModerationFix(o);
}
