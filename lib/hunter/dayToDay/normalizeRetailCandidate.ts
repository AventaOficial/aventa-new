import type { IngestItem, IngestSourceId } from '@/lib/bots/ingest/types';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import type { PublicProductCandidate } from './parsePublicProductHtml';

export type NormalizedRetailDraft = {
  url: string;
  title: string;
  price: number | null;
  originalPrice: number | null;
  image: string | null;
  productId: string | null;
  store: string;
  category: string | null;
  brand: string | null;
  currency: string | null;
  source: IngestSourceId;
  sourceDetail: string;
  explicitDiscountPercent: number | null;
  explicitSavings: number | null;
  promotionType: string | null;
  promotionBoundToProduct: boolean;
};

function recomputeDiscount(price: number, original: number | null): number {
  if (original == null || !Number.isFinite(original) || original <= price) return 0;
  return Math.round((1 - price / original) * 100);
}

/** Mínimo: URL + title. Precio preferido pero no obligatorio aquí. */
export function isValidRetailDraft(draft: NormalizedRetailDraft): boolean {
  if (!draft.url.trim() || !/^https?:\/\//i.test(draft.url)) return false;
  if (!draft.title.trim()) return false;
  return true;
}

export function publicProductToDraft(
  product: PublicProductCandidate,
  opts: { store: string; source: IngestSourceId; sourceDetail: string },
): NormalizedRetailDraft | null {
  const title = product.title?.trim() ?? '';
  const url = product.url?.trim() ?? '';
  if (!title || !url) return null;
  let original = product.originalPrice;
  if (original != null && product.price != null && original <= product.price) original = null;
  return {
    url,
    title,
    price: product.price,
    originalPrice: original,
    image: isValidOfferImage(product.image) ? product.image : null,
    productId: product.productId,
    store: opts.store,
    category: product.category,
    brand: product.brand,
    currency: product.currency,
    source: opts.source,
    sourceDetail: opts.sourceDetail,
    explicitDiscountPercent: product.explicitDiscountPercent ?? null,
    explicitSavings: product.explicitSavings ?? null,
    promotionType: product.promotionType ?? null,
    promotionBoundToProduct: product.promotionBoundToProduct === true,
  };
}

export function draftToIngestItem(draft: NormalizedRetailDraft): IngestItem | null {
  if (!isValidRetailDraft(draft)) return null;
  const hasPrice = draft.price != null && Number.isFinite(draft.price) && draft.price > 0;
  const meta: ParsedOfferMetadata = {
    canonicalUrl: draft.url,
    title: draft.title,
    store: draft.store,
    imageUrl: draft.image ?? '',
    discountPrice: hasPrice ? draft.price! : 0,
    originalPrice: draft.originalPrice,
    discountPercent: hasPrice ? recomputeDiscount(draft.price!, draft.originalPrice) : 0,
    signals: {
      categoryId: draft.category,
      ...(draft.productId ? { listingTypeId: `retail:${draft.productId}` } : {}),
      currentPriceProvenance: hasPrice ? 'source_explicit' : 'unknown',
      originalPriceProvenance: draft.originalPrice != null ? 'source_explicit' : 'unknown',
      discountPercentProvenance: draft.explicitDiscountPercent != null && draft.explicitDiscountPercent > 0
        ? 'source_explicit'
        : hasPrice && draft.originalPrice != null
          ? 'derived'
          : 'unknown',
      explicitDiscountPercent: draft.explicitDiscountPercent,
      explicitSavings: draft.explicitSavings,
      promotionType: draft.promotionType,
      promotionBoundToProduct: draft.promotionBoundToProduct,
    },
  };
  return {
    url: draft.url,
    source: draft.source,
    sourceDetail: draft.sourceDetail,
    ...(hasPrice ? { precomputedMeta: meta } : { precomputedMeta: { ...meta, discountPrice: 0 } }),
  };
}
