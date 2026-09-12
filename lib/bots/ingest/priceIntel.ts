import { extractAmazonAsin, extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';
import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { fetchKeepaPriceIntel } from './keepa';
import {
  enrichMercadoLibrePriceIntel,
  type MlPriceIntel,
} from './mlPriceEngine';
import type { MlPriceQuote } from './mlPricesApi';

export type EnrichPriceIntelOptions = {
  /**
   * Conserva discountPercent + precios de la card (p. ej. ml_worker).
   * El intel del Price Engine queda solo en signals (scoring/diagnóstico).
   */
  preserveLabelDiscount?: boolean;
};

function hasPreservableCardDiscount(meta: ParsedOfferMetadata): boolean {
  return Number.isFinite(meta.discountPercent) && meta.discountPercent > 0;
}

/**
 * Fusiona quote/intel ML sobre meta de oferta.
 * Exportada para tests del hard-filter vs card discount.
 */
export function applyMlPriceIntelToMeta(
  meta: ParsedOfferMetadata,
  ml: { quote: MlPriceQuote; intel: MlPriceIntel },
  options?: EnrichPriceIntelOptions
): ParsedOfferMetadata {
  const current = ml.quote.current;
  const labelOriginal = ml.quote.listPrice ?? meta.originalPrice;
  const engineDiscount =
    ml.intel.effectiveDiscountPercent != null
      ? ml.intel.effectiveDiscountPercent
      : labelOriginal != null && labelOriginal > current
        ? Math.round((1 - current / labelOriginal) * 100)
        : meta.discountPercent;

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
  };

  const preserve =
    options?.preserveLabelDiscount === true && hasPreservableCardDiscount(meta);

  if (preserve) {
    return {
      ...meta,
      discountPrice: meta.discountPrice,
      originalPrice: meta.originalPrice,
      discountPercent: meta.discountPercent,
      signals,
    };
  }

  return {
    ...meta,
    discountPrice: current,
    originalPrice: labelOriginal,
    discountPercent: engineDiscount,
    signals: {
      ...signals,
      currentPriceProvenance: 'price_intel_derivation',
      originalPriceProvenance: 'price_intel_derivation',
      discountPercentProvenance: 'price_intel_derivation',
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
    const ml = await enrichMercadoLibrePriceIntel({
      url: meta.canonicalUrl,
      itemId: extractMercadoLibreItemId(meta.canonicalUrl),
      current: meta.discountPrice,
      listPrice: meta.originalPrice,
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
