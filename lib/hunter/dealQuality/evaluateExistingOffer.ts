/**
 * Evaluador READ-ONLY de ofertas ya persistidas.
 * No escribe DB. Sirve para recalificar pending / inventario histórico.
 */
import { qualifyCandidate } from '@/lib/hunter/dealQualification/qualifyCandidate';
import type { DealQualificationInput, PromotionKind } from '@/lib/hunter/dealQualification/types';
import { evaluateDealQuality } from './evaluateDealQuality';
import type {
  DealQualityDecision,
  DealQualityDuplicateInput,
  DealQualityPriceMemoryInput,
} from './types';

const PROMO_KINDS = new Set<PromotionKind>([
  '2x1',
  '3x2',
  'combo',
  'coupon',
  'liquidation',
  'special_price',
  'quantity_discount',
]);

export type ExistingOfferQualityRow = {
  id?: string | null;
  title?: string | null;
  offer_url?: string | null;
  original_offer_url?: string | null;
  store?: string | null;
  price?: number | null;
  original_price?: number | null;
  image_url?: string | null;
  product_fingerprint?: string | null;
  status?: string | null;
  bot_meta?: unknown;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function priceMemoryFromBotMeta(botMeta: unknown): DealQualityPriceMemoryInput | null {
  const root = asRecord(botMeta);
  const signals = asRecord(root?.signals);
  if (!signals) return null;
  return {
    historyReady:
      num(signals.habitual30d) != null || num(signals.priceLowest90d) != null
        ? true
        : num(signals.savingsVsHabitualPct) != null || num(signals.priceVsLowest90dPct) != null
          ? true
          : null,
    samples90d: null,
    savingsVsHabitualPct: num(signals.savingsVsHabitualPct),
    priceVsLowest90dPct: num(signals.priceVsLowest90dPct),
    effectiveDiscountPercent: num(signals.effectiveDiscountPercent),
    suspectedArtificialListPrice: bool(signals.suspectedArtificialListPrice),
    habitual30d: num(signals.habitual30d),
    lowest90d: num(signals.priceLowest90d),
    priceIntelSource: str(signals.priceIntelSource),
  };
}

function qualificationInputFromOffer(offer: ExistingOfferQualityRow): DealQualificationInput {
  const root = asRecord(offer.bot_meta);
  const signals = asRecord(root?.signals) ?? {};
  const promoRaw = str(signals.promotionType);
  const promoKind =
    promoRaw && PROMO_KINDS.has(promoRaw as PromotionKind) ? (promoRaw as PromotionKind) : null;
  const discountProv = str(signals.discountPercentProvenance) ?? 'unknown';
  const derived =
    discountProv === 'price_intel_derivation'
      ? num(signals.effectiveDiscountPercent)
      : null;
  return {
    currentPrice: offer.price,
    originalPrice: offer.original_price,
    explicitDiscountPercent:
      discountProv === 'derived' || discountProv === 'price_intel_derivation'
        ? null
        : num(signals.explicitDiscountPercent),
    explicitSavings: num(signals.explicitSavings),
    promotionKind: promoKind,
    promotionBoundToProduct: bool(signals.promotionBoundToProduct) === true,
    unboundPromotionMention: bool(signals.unboundPromotionMention) === true,
    currentPriceProvenance: (str(signals.currentPriceProvenance) as DealQualificationInput['currentPriceProvenance']) ?? 'unknown',
    originalPriceProvenance: (str(signals.originalPriceProvenance) as DealQualificationInput['originalPriceProvenance']) ?? 'unknown',
    discountPercentProvenance: (discountProv as DealQualificationInput['discountPercentProvenance']) ?? 'unknown',
    derivedDiscountPercent: derived,
  };
}

/**
 * Evalúa calidad de una fila `offers` (o shape equivalente) sin mutar nada.
 */
export function evaluateExistingOfferQuality(
  offer: ExistingOfferQualityRow,
  opts?: {
    duplicate?: DealQualityDuplicateInput | null;
    source?: string | null;
  },
): DealQualityDecision {
  const root = asRecord(offer.bot_meta);
  const source = opts?.source ?? str(root?.source) ?? null;
  const qualificationInput = qualificationInputFromOffer(offer);
  const qualification = qualifyCandidate(qualificationInput);

  return evaluateDealQuality({
    title: offer.title,
    url: offer.offer_url ?? offer.original_offer_url,
    store: offer.store,
    source,
    productFingerprint: offer.product_fingerprint,
    imageUrl: offer.image_url,
    currentPrice: offer.price,
    originalPrice: offer.original_price,
    qualification,
    qualificationInput,
    priceMemory: priceMemoryFromBotMeta(offer.bot_meta),
    duplicate: opts?.duplicate ?? null,
  });
}

export type ExistingOfferQualityReport = {
  offerId: string | null;
  status: string | null;
  quality: DealQualityDecision;
};

export function evaluateExistingOffersQuality(
  offers: ExistingOfferQualityRow[],
): ExistingOfferQualityReport[] {
  return offers.map((offer) => ({
    offerId: offer.id?.trim() ? offer.id.trim() : null,
    status: offer.status ?? null,
    quality: evaluateExistingOfferQuality(offer),
  }));
}
