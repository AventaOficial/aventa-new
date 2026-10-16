import type { CategoryId } from '@/lib/categories';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { isLowQualityTitle } from '@/lib/bots/ingest/isLowQualityTitle';
import { resolvePreventedCategory } from './categoryConsistency';
import { resolvePriceProvenance, sanitizeOriginalPriceForIngest } from './priceSignals';

export type CatalogIngestSource = 'community' | 'bot' | 'machine';

export type CatalogPreventOnIngestResult = {
  category: CategoryId | null;
  originalPrice: number | null;
  categoryCorrected: boolean;
  originalDropped: boolean;
  forcePendingReview: boolean;
  flags: string[];
  rejectTitle?: boolean;
};

export function applyCatalogPreventOnIngest(input: {
  title: string;
  store: string;
  category: string | null;
  price: number;
  originalPrice: number | null;
  source: CatalogIngestSource;
  botMeta?: unknown;
  enforceTitleQuality?: boolean;
}): CatalogPreventOnIngestResult {
  const flags: string[] = [];
  let forcePendingReview = false;

  const cat = resolvePreventedCategory({
    title: input.title,
    category: input.category,
    store: input.store,
  });
  if (cat.corrected) {
    flags.push(`category_corrected:${cat.ruleId ?? 'rule'}`);
    forcePendingReview = true;
  } else if (cat.ruleId) {
    flags.push(`category_review:${cat.ruleId}`);
  }

  const provenance = resolvePriceProvenance({ source: input.source, botMeta: input.botMeta });
  const priceSanitized = sanitizeOriginalPriceForIngest({
    price: input.price,
    originalPrice: input.originalPrice,
    provenance,
  });
  if (priceSanitized.dropped) {
    flags.push(`original_dropped:${priceSanitized.reason ?? 'unknown'}`);
    if (priceSanitized.reason === 'original_unprovenanced' || priceSanitized.reason === 'high_discount_declared_only') {
      forcePendingReview = true;
    }
  }

  const rejectTitle =
    input.enforceTitleQuality === true && isLowQualityTitle(input.title, loadBotIngestConfig());

  return {
    category: cat.category,
    originalPrice: priceSanitized.originalPrice,
    categoryCorrected: cat.corrected,
    originalDropped: priceSanitized.dropped,
    forcePendingReview,
    flags,
    rejectTitle: rejectTitle || undefined,
  };
}
