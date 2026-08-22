import {
  normalizeCategoryForStorage,
  type CategoryId,
} from '@/lib/categories';
import { inferOfferCategory } from '@/lib/offers/inferOfferCategory';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

function mlIdFromUrl(url: string): string | null {
  const m = url.match(/[?&]category=(MLM\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Infiere categoría Aventa para ofertas del bot (card-only ML, sin category_id fiable).
 * Reutiliza inferOfferCategory (misma lógica que parse manual y moderación).
 */
export function classifyBotCategory(
  meta: ParsedOfferMetadata,
  techCategoryIds?: Set<string>
): CategoryId | null {
  const mlCat = meta.signals?.categoryId?.trim()?.toUpperCase() ?? null;
  const mlFromUrl = mlIdFromUrl(meta.canonicalUrl);

  const fromInfer = inferOfferCategory({
    title: meta.title,
    mlCategoryId: mlCat ?? mlFromUrl ?? undefined,
    breadcrumbs: meta.store ? [meta.store] : undefined,
  });
  if (fromInfer) return fromInfer;

  if (mlCat && techCategoryIds?.has(mlCat)) return 'tecnologia';
  if (mlFromUrl && techCategoryIds?.has(mlFromUrl)) return 'tecnologia';

  return null;
}

export function classifyBotCategoryForStorage(
  meta: ParsedOfferMetadata,
  techCategoryIds?: Set<string>
): string | null {
  const raw = classifyBotCategory(meta, techCategoryIds);
  return raw ? normalizeCategoryForStorage(raw) : null;
}
