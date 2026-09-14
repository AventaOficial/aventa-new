/**
 * Evidence Contract — jerarquía semántica para deals ML / ingest.
 * WEAK nunca produce VERIFIED_DEAL. STRONG es requisito de VERIFIED.
 * No es un score 0–100; orquesta decisiones existentes.
 */

export type DealEvidenceStrength = 'WEAK' | 'MEDIUM' | 'STRONG';

export type MlCardDiscountSource =
  | 'badge_reconstructed'
  | 'card_strikethrough'
  | 'pdp'
  | 'unknown';

/** Evidencia de listing/card: discovery signal, no deal proof. */
export function isWeakListingCardSource(
  source: string | null | undefined,
): boolean {
  const s = (source ?? '').trim().toLowerCase();
  return s === 'badge_reconstructed' || s === 'card_strikethrough';
}

export function strengthFromCardDiscountSource(
  source: string | null | undefined,
): DealEvidenceStrength | null {
  const s = (source ?? '').trim().toLowerCase();
  if (s === 'badge_reconstructed' || s === 'card_strikethrough') return 'WEAK';
  if (s === 'pdp') return 'STRONG';
  if (s === 'unknown') return 'MEDIUM';
  return null;
}

export type StrongRescueInput = {
  cardDiscountSource?: string | null;
  /** Provenance del original ya resuelta (Qualification / meta). */
  originalPriceProvenance?: string | null;
  priceMemory?: {
    historyReady?: boolean | null;
    suspectedArtificialListPrice?: boolean | null;
    effectiveDiscountPercent?: number | null;
    savingsVsHabitualPct?: number | null;
    strongPositiveHistory?: boolean | null;
  } | null;
  /** Promoción ligada al producto (Qualification PROMOTION). */
  boundPromotion?: boolean | null;
};

/**
 * ¿Hay evidencia STRONG independiente del tachado/badge de listing?
 */
export function hasStrongIndependentEvidence(input: StrongRescueInput): boolean {
  const card = (input.cardDiscountSource ?? '').trim().toLowerCase();
  if (card === 'pdp') return true;

  if (input.boundPromotion === true) return true;

  const pm = input.priceMemory;
  if (pm) {
    const artificial = pm.suspectedArtificialListPrice === true;
    const effective =
      typeof pm.effectiveDiscountPercent === 'number' && Number.isFinite(pm.effectiveDiscountPercent)
        ? pm.effectiveDiscountPercent
        : null;
    const historyReady = pm.historyReady === true;
    const strongHist = pm.strongPositiveHistory === true;
    if (historyReady && !artificial && effective != null && effective > 0 && strongHist) {
      return true;
    }
  }

  // Flujos no-ML-card (community/HTML/API): provenance fuerte sin card WEAK.
  if (!isWeakListingCardSource(card)) {
    const prov = (input.originalPriceProvenance ?? '').trim().toLowerCase();
    if (prov === 'source_explicit' || prov === 'trusted_enrichment') {
      return true;
    }
  }

  return false;
}

export type EvidenceReconcileDecision =
  | 'VERIFIED_DEAL'
  | 'PROMOTION'
  | 'POTENTIAL_DEAL'
  | 'NO_VERIFIED_DEAL'
  | 'DUPLICATE'
  | 'REJECT';

/**
 * Si Qualification/QE marcó VERIFIED pero la evidencia es solo WEAK listing
 * sin rescate STRONG, degrada de forma segura.
 */
export function reconcileVerifiedWithEvidenceContract(opts: {
  decision: EvidenceReconcileDecision;
  cardDiscountSource?: string | null;
  originalPriceProvenance?: string | null;
  artificial?: boolean;
  effectiveDiscountPercent?: number | null;
  priceMemoryStrongRescue?: boolean;
  boundPromotion?: boolean;
}): { decision: EvidenceReconcileDecision; demoted: boolean; reason: string | null } {
  const { decision } = opts;
  if (decision !== 'VERIFIED_DEAL') {
    return { decision, demoted: false, reason: null };
  }

  const weak = isWeakListingCardSource(opts.cardDiscountSource);
  if (!weak) {
    return { decision, demoted: false, reason: null };
  }

  const strong = hasStrongIndependentEvidence({
    cardDiscountSource: opts.cardDiscountSource,
    originalPriceProvenance: opts.originalPriceProvenance,
    boundPromotion: opts.boundPromotion,
    priceMemory: {
      historyReady: opts.priceMemoryStrongRescue ? true : null,
      suspectedArtificialListPrice: opts.artificial ?? null,
      effectiveDiscountPercent: opts.effectiveDiscountPercent ?? null,
      strongPositiveHistory: opts.priceMemoryStrongRescue ? true : null,
    },
  });

  if (strong) {
    return { decision: 'VERIFIED_DEAL', demoted: false, reason: null };
  }

  const artificial = opts.artificial === true;
  const effective = opts.effectiveDiscountPercent;
  const effectiveNonPositive =
    effective == null || (typeof effective === 'number' && effective <= 0);

  if (artificial && effectiveNonPositive) {
    return {
      decision: 'NO_VERIFIED_DEAL',
      demoted: true,
      reason:
        'Evidence Contract: listing WEAK + artificial + sin ahorro efectivo → no VERIFIED',
    };
  }

  return {
    decision: 'POTENTIAL_DEAL',
    demoted: true,
    reason:
      'Evidence Contract: card/listing WEAK sin evidencia STRONG → máximo POTENTIAL_DEAL',
  };
}
