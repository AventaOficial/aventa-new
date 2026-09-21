import { extractAmazonAsin, extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';
import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { fetchKeepaPriceIntel } from './keepa';
import {
  enrichMercadoLibrePriceIntel,
  type MlPriceIntel,
} from './mlPriceEngine';
import type { MlPriceQuote } from './mlPricesApi';
import { applyCanonicalDiscountToMetaFields, isFalseZeroDiscount } from './canonicalDiscount';

export type EnrichPriceIntelOptions = {
  /**
   * Conserva discountPercent + precios de la card (p. ej. ml_worker).
   * El intel del Price Engine queda solo en signals (scoring/diagnóstico).
   */
  preserveLabelDiscount?: boolean;
  /** Provenance explícita Supply Engine → Price Memory niche_id. */
  nicheId?: string | null;
};

/** Extrae nicheId solo si aparece explícito en sourceDetail (nunca por título). */
export function nicheIdFromSourceDetail(sourceDetail: string | null | undefined): string | null {
  const raw = (sourceDetail ?? '').trim();
  if (!raw) return null;
  const m = /(?:^|[|])niche:([a-z0-9_]+)(?:[|]|$)/i.exec(raw);
  if (!m?.[1]) return null;
  const v = m[1].toLowerCase();
  return v === 'beauty' || v === 'electronics' || v === 'day_to_day' ? v : null;
}

function hasPreservableCardDiscount(meta: ParsedOfferMetadata): boolean {
  // Preservable = has sale+original that yield a real computed discount,
  // OR an already-positive discountPercent. Never treat false-zero / null as preservable-as-is.
  if (
    meta.originalPrice != null &&
    Number.isFinite(meta.originalPrice) &&
    meta.originalPrice > meta.discountPrice &&
    Number.isFinite(meta.discountPrice) &&
    meta.discountPrice > 0
  ) {
    return true;
  }
  return (
    meta.discountPercent != null &&
    Number.isFinite(meta.discountPercent) &&
    meta.discountPercent > 0
  );
}

/**
 * Fusiona quote/intel ML sobre meta de oferta.
 * Exportada para tests del hard-filter vs card discount.
 *
 * P0: never overwrite discountPercent with effectiveDiscountPercent=0 while
 * keeping originalPrice — that creates FALSE_ZERO (prices imply ≥25%, % = 0).
 * effectiveDiscount stays in signals for scoring; card/list discount truth
 * comes from the canonical engine on sale+original.
 */
export function applyMlPriceIntelToMeta(
  meta: ParsedOfferMetadata,
  ml: { quote: MlPriceQuote; intel: MlPriceIntel },
  options?: EnrichPriceIntelOptions
): ParsedOfferMetadata {
  const current = ml.quote.current;
  const labelOriginal = ml.quote.listPrice ?? meta.originalPrice;

  const signals: NonNullable<ParsedOfferMetadata['signals']> = {
    ...(meta.signals ?? {}),
    priceLowest30d: ml.intel.lowest30d,
    priceLowest90d: ml.intel.lowest90d,
    priceVsLowest90dPct: ml.intel.priceVsLowest90dPct,
    habitual30d: ml.intel.habitual30d,
    savingsVsHabitualPct: ml.intel.savingsVsHabitualPct,
    effectiveDiscountPercent: ml.intel.effectiveDiscountPercent,
    priceIntelSource: 'aventa_ml',
    suspectedArtificialListPrice: ml.intel.suspectedArtificialListPrice,
    historyReady: ml.intel.historyReady,
  };

  const preserve =
    options?.preserveLabelDiscount === true && hasPreservableCardDiscount(meta);

  if (preserve) {
    // Keep card prices + card %. Only correct FALSE_ZERO (0% with prices implying real %).
    // Do NOT let canonical conflict rewrite a positive card label (preserveLabelDiscount).
    if (
      isFalseZeroDiscount({
        salePrice: meta.discountPrice,
        originalPrice: meta.originalPrice,
        discountPercent: meta.discountPercent,
      })
    ) {
      const applied = applyCanonicalDiscountToMetaFields({
        salePrice: meta.discountPrice,
        originalPrice: meta.originalPrice,
        existingDiscountPercent: meta.discountPercent,
        originalPriceProvenance: meta.signals?.originalPriceProvenance ?? null,
        cardDiscountSource: meta.signals?.cardDiscountSource ?? null,
      });
      return {
        ...meta,
        discountPrice: meta.discountPrice,
        originalPrice: meta.originalPrice,
        discountPercent: applied.discountPercent,
        signals: {
          ...signals,
          discountCalculationStatus: applied.canonical.calculationStatus,
          discountTruthSource: applied.canonical.source,
          discountTruthConfidence: applied.canonical.confidence,
          discountFalseZeroCorrected: true,
          discountConflict: {
            supplied: applied.canonical.evidence.suppliedDiscountPercentage,
            computed: applied.canonical.evidence.computedDiscountPercentage,
            delta: applied.canonical.evidence.delta,
            reason: applied.canonical.evidence.reasonForDiscrepancy,
          },
        },
      };
    }
    return {
      ...meta,
      discountPrice: meta.discountPrice,
      originalPrice: meta.originalPrice,
      discountPercent: meta.discountPercent,
      signals,
    };
  }

  const sale = current;
  const original = labelOriginal;
  const applied = applyCanonicalDiscountToMetaFields({
    salePrice: sale,
    originalPrice: original,
    existingDiscountPercent: meta.discountPercent,
    originalPriceProvenance: 'price_intel_derivation',
    cardDiscountSource: meta.signals?.cardDiscountSource ?? null,
  });

  return {
    ...meta,
    discountPrice: sale,
    originalPrice: original,
    // Canonical from prices — null when UNKNOWN (never force 0).
    discountPercent: applied.discountPercent,
    signals: {
      ...signals,
      currentPriceProvenance: 'price_intel_derivation',
      originalPriceProvenance: 'price_intel_derivation',
      discountPercentProvenance: 'derived',
      discountCalculationStatus: applied.canonical.calculationStatus,
      discountTruthSource: applied.canonical.source,
      discountTruthConfidence: applied.canonical.confidence,
      ...(applied.shadow.falseZero ? { discountFalseZeroCorrected: true } : {}),
      ...(applied.canonical.calculationStatus === 'conflict'
        ? {
            discountConflict: {
              supplied: applied.canonical.evidence.suppliedDiscountPercentage,
              computed: applied.canonical.evidence.computedDiscountPercentage,
              delta: applied.canonical.evidence.delta,
              reason: applied.canonical.evidence.reasonForDiscrepancy,
            },
          }
        : {}),
    },
  };
}

export async function enrichWithPriceIntel(
  meta: ParsedOfferMetadata,
  config: BotIngestConfig,
  options?: EnrichPriceIntelOptions
): Promise<ParsedOfferMetadata> {
  const store = meta.store.toLowerCase();

  if (store.includes('mercado')) {
    const nicheId =
      options?.nicheId ??
      (typeof config.supplyNicheId === 'string' ? config.supplyNicheId : null);
    const ml = await enrichMercadoLibrePriceIntel({
      url: meta.canonicalUrl,
      itemId: extractMercadoLibreItemId(meta.canonicalUrl),
      current: meta.discountPrice,
      listPrice: meta.originalPrice,
      nicheId,
    });
    if (!ml) return meta;
    return applyMlPriceIntelToMeta(meta, ml, options);
  }

  if (!config.keepaEnabled || !config.keepaApiKey) return meta;
  if (!store.includes('amazon')) return meta;

  const asin = extractAmazonAsin(meta.canonicalUrl);
  if (!asin) return meta;

  const intel = await fetchKeepaPriceIntel({
    apiKey: config.keepaApiKey,
    domainId: config.keepaDomainId,
    asin,
  });
  if (!intel) return meta;

  return {
    ...meta,
    signals: {
      ...(meta.signals ?? {}),
      priceLowest30d: intel.lowest30d,
      priceLowest90d: intel.lowest90d,
      priceVsLowest90dPct: intel.priceVsLowest90dPct,
      priceIntelSource: 'keepa',
      suspectedArtificialListPrice:
        meta.originalPrice != null &&
        intel.current != null &&
        meta.originalPrice >= intel.current * 1.45,
    },
  };
}
