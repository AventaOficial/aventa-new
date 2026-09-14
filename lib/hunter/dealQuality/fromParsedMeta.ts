import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { qualificationInputFromParsedMeta } from '@/lib/hunter/dealQualification/applyToCandidates';
import type { DealQualificationResult } from '@/lib/hunter/dealQualification/types';
import { evaluateDealQuality } from './evaluateDealQuality';
import type {
  DealQualityDecision,
  DealQualityDuplicateInput,
  DealQualityInput,
  DealQualityPriceMemoryInput,
} from './types';

export function priceMemoryFromParsedMeta(
  meta: Pick<ParsedOfferMetadata, 'signals'>,
): DealQualityPriceMemoryInput | null {
  const s = meta.signals;
  if (!s) return null;
  const hasAny =
    s.habitual30d != null ||
    s.priceLowest90d != null ||
    s.savingsVsHabitualPct != null ||
    s.priceVsLowest90dPct != null ||
    s.effectiveDiscountPercent != null ||
    s.suspectedArtificialListPrice != null ||
    s.priceIntelSource != null;
  if (!hasAny) return null;
  return {
    historyReady:
      s.habitual30d != null || s.priceLowest90d != null
        ? true
        : s.savingsVsHabitualPct != null || s.priceVsLowest90dPct != null
          ? true
          : null,
    savingsVsHabitualPct: s.savingsVsHabitualPct ?? null,
    priceVsLowest90dPct: s.priceVsLowest90dPct ?? null,
    effectiveDiscountPercent: s.effectiveDiscountPercent ?? null,
    suspectedArtificialListPrice: s.suspectedArtificialListPrice ?? null,
    habitual30d: s.habitual30d ?? null,
    lowest90d: s.priceLowest90d ?? null,
    priceIntelSource: s.priceIntelSource ?? null,
  };
}

export function dealQualityInputFromParsedMeta(
  meta: ParsedOfferMetadata,
  opts?: {
    source?: string | null;
    productId?: string | null;
    productFingerprint?: string | null;
    qualification?: DealQualificationResult | null;
    duplicate?: DealQualityDuplicateInput | null;
    hardRejectReasons?: string[] | null;
    availability?: string | null;
  },
): DealQualityInput {
  return {
    title: meta.title,
    url: meta.canonicalUrl,
    store: meta.store,
    source: opts?.source ?? null,
    productId: opts?.productId ?? null,
    productFingerprint: opts?.productFingerprint ?? null,
    imageUrl: meta.imageUrl,
    currentPrice: meta.discountPrice,
    originalPrice: meta.originalPrice,
    availability: opts?.availability ?? null,
    qualification: opts?.qualification ?? null,
    qualificationInput: opts?.qualification ? null : qualificationInputFromParsedMeta(meta),
    priceMemory: priceMemoryFromParsedMeta(meta),
    duplicate: opts?.duplicate ?? null,
    hardRejectReasons: opts?.hardRejectReasons ?? null,
  };
}

export function evaluateDealQualityFromParsedMeta(
  meta: ParsedOfferMetadata,
  opts?: Parameters<typeof dealQualityInputFromParsedMeta>[1],
): DealQualityDecision {
  return evaluateDealQuality(dealQualityInputFromParsedMeta(meta, opts));
}
