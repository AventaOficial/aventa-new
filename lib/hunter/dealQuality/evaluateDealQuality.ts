import { qualifyCandidate } from '@/lib/hunter/dealQualification/qualifyCandidate';
import type {
  DealQualification,
  DealQualificationInput,
  DealQualificationResult,
} from '@/lib/hunter/dealQualification/types';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { DEAL_QUALITY_POLICY_V1, DEAL_QUALITY_RULES_V1 } from './thresholds';
import type {
  DealQualityConfidence,
  DealQualityDecision,
  DealQualityDecisionKind,
  DealQualityInput,
  DealQualityPriceMemoryInput,
  DealQualityRecommendedAction,
  DealQualityTelemetry,
} from './types';

function pushUnique(list: string[], code: string): void {
  if (!code || list.includes(code)) return;
  list.push(code);
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isCorruptNumber(n: unknown): boolean {
  if (n == null) return false;
  if (typeof n === 'number') return !Number.isFinite(n) || n < 0;
  return false;
}

function hasProductIdentity(input: DealQualityInput): boolean {
  const title = (input.title ?? '').trim();
  if (title.length >= 3) return true;
  if ((input.productId ?? '').trim()) return true;
  if ((input.productFingerprint ?? '').trim()) return true;
  return false;
}

function isUrlClearlyInvalid(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim();
  if (!raw) return false; // ausencia ≠ URL inválida (puede ser candidato interno)
  try {
    const u = new URL(raw);
    return u.protocol !== 'http:' && u.protocol !== 'https:';
  } catch {
    return true;
  }
}

function buildQualificationInput(input: DealQualityInput): DealQualificationInput {
  if (input.qualificationInput) return input.qualificationInput;
  const pm = input.priceMemory;
  const derived =
    pm?.effectiveDiscountPercent != null && pm.effectiveDiscountPercent > 0
      ? pm.effectiveDiscountPercent
      : null;
  return {
    currentPrice: input.currentPrice,
    originalPrice: input.originalPrice,
    explicitDiscountPercent: null,
    explicitSavings: null,
    promotionKind: null,
    promotionBoundToProduct: false,
    currentPriceProvenance: input.currentPrice != null ? 'source_explicit' : 'unknown',
    originalPriceProvenance: input.originalPrice != null ? 'source_explicit' : 'unknown',
    discountPercentProvenance: derived != null ? 'price_intel_derivation' : 'unknown',
    derivedDiscountPercent: derived,
  };
}

function resolveQualification(input: DealQualityInput): DealQualificationResult {
  if (input.qualification) return input.qualification;
  return qualifyCandidate(buildQualificationInput(input));
}

function applyPriceMemorySignals(
  pm: DealQualityPriceMemoryInput | null | undefined,
  positive: string[],
  negative: string[],
  missing: string[],
  reasons: string[],
): {
  strongPositiveHistory: boolean;
  artificial: boolean;
  historyReady: boolean;
} {
  if (!pm) {
    pushUnique(missing, 'price_history');
    reasons.push('Sin señales de Price Memory disponibles');
    return { strongPositiveHistory: false, artificial: false, historyReady: false };
  }

  const artificial = pm.suspectedArtificialListPrice === true;
  if (artificial) {
    pushUnique(negative, 'artificial_list_price');
    reasons.push('Price Intel sospecha precio de lista artificial');
  }

  const historyReady =
    pm.historyReady === true ||
    (typeof pm.samples90d === 'number' &&
      pm.samples90d >= DEAL_QUALITY_RULES_V1.minHistorySamplesHint &&
      pm.historyReady !== false);

  if (!historyReady) {
    pushUnique(missing, 'price_history');
    pushUnique(missing, 'longer_price_history');
    pushUnique(negative, 'insufficient_price_history');
    reasons.push('Historial de precio insuficiente (no implica rechazo)');
    return { strongPositiveHistory: false, artificial, historyReady: false };
  }

  pushUnique(positive, 'price_history_ready');

  let strongPositiveHistory = false;
  const vsHab = pm.savingsVsHabitualPct;
  if (typeof vsHab === 'number' && Number.isFinite(vsHab) && vsHab >= DEAL_QUALITY_RULES_V1.belowHabitualPct) {
    pushUnique(positive, 'price_below_habitual');
    reasons.push(
      vsHab >= DEAL_QUALITY_RULES_V1.belowHabitualStrongPct
        ? `Precio claramente inferior al habitual (${Math.round(vsHab)}%)`
        : `Precio inferior al habitual observado (${Math.round(vsHab)}%)`,
    );
    if (vsHab >= DEAL_QUALITY_RULES_V1.belowHabitualStrongPct) {
      strongPositiveHistory = true;
    } else {
      strongPositiveHistory = true;
    }
  }

  const vsLow = pm.priceVsLowest90dPct;
  if (typeof vsLow === 'number' && Number.isFinite(vsLow)) {
    if (vsLow <= 0) {
      pushUnique(positive, 'at_or_below_historical_low');
      reasons.push('Precio en o bajo el mínimo histórico observado');
      strongPositiveHistory = true;
    } else if (vsLow <= DEAL_QUALITY_RULES_V1.nearHistoricalLowPct) {
      pushUnique(positive, 'near_historical_low');
      reasons.push(`Precio cerca del mínimo histórico (+${Math.round(vsLow)}%)`);
      strongPositiveHistory = true;
    }
  }

  if (
    typeof pm.effectiveDiscountPercent === 'number' &&
    pm.effectiveDiscountPercent > 0 &&
    !artificial
  ) {
    pushUnique(positive, 'effective_discount');
  }

  return { strongPositiveHistory, artificial, historyReady };
}

function mapRecommendedAction(
  decision: DealQualityDecisionKind,
): DealQualityRecommendedAction {
  if (decision === 'DUPLICATE') return 'DUPLICATE';
  if (decision === 'REJECT' || decision === 'NO_VERIFIED_DEAL') return 'DISCARD';
  if (decision === 'POTENTIAL_DEAL') return 'HUMAN_REVIEW';
  // VERIFIED_DEAL / PROMOTION → candidato digno de cola (humano publica)
  return 'PUBLISH_CANDIDATE';
}

function mapConfidence(opts: {
  decision: DealQualityDecisionKind;
  qualificationQuality?: 'high' | 'medium' | 'low';
  artificial: boolean;
  historyReady: boolean;
  strongPositiveHistory: boolean;
}): DealQualityConfidence {
  if (opts.decision === 'REJECT' || opts.decision === 'DUPLICATE') return 'high';
  if (opts.decision === 'VERIFIED_DEAL') {
    if (opts.artificial) return 'medium';
    return opts.qualificationQuality === 'high' ? 'high' : 'medium';
  }
  if (opts.decision === 'PROMOTION') return 'medium';
  if (opts.decision === 'POTENTIAL_DEAL') {
    if (opts.strongPositiveHistory && opts.historyReady && !opts.artificial) return 'medium';
    return 'low';
  }
  return 'low';
}

function finalize(partial: {
  decision: DealQualityDecisionKind;
  confidence: DealQualityConfidence;
  reasons: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  missingEvidence: string[];
  qualification: DealQualification | null;
}): DealQualityDecision {
  return {
    ...partial,
    recommendedAction: mapRecommendedAction(partial.decision),
    policyVersion: DEAL_QUALITY_POLICY_V1,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Orquesta señales existentes → decisión de calidad explicable.
 * Determinista. No publica. No muta DB.
 */
export function evaluateDealQuality(input: DealQualityInput): DealQualityDecision {
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  const missingEvidence: string[] = [];
  const reasons: string[] = [];

  // A. DUPLICATE — early exit
  if (input.duplicate?.isDuplicate) {
    const kind = input.duplicate.kind?.trim();
    reasons.push(
      kind
        ? `Duplicado detectado por el sistema existente (${kind})`
        : 'Duplicado detectado por el sistema existente',
    );
    pushUnique(negativeSignals, 'duplicate');
    if (kind) pushUnique(negativeSignals, `duplicate_${kind}`);
    return finalize({
      decision: 'DUPLICATE',
      confidence: 'high',
      reasons,
      positiveSignals,
      negativeSignals,
      missingEvidence,
      qualification: null,
    });
  }

  // J. REJECT — solo casos claramente inválidos
  const hard = (input.hardRejectReasons ?? []).map((r) => r.trim()).filter(Boolean);
  if (hard.length > 0) {
    for (const h of hard) {
      reasons.push(h);
      pushUnique(negativeSignals, 'hard_reject');
    }
    return finalize({
      decision: 'REJECT',
      confidence: 'high',
      reasons,
      positiveSignals,
      negativeSignals,
      missingEvidence,
      qualification: null,
    });
  }

  if (isUrlClearlyInvalid(input.url)) {
    reasons.push('URL inválida o no http(s)');
    pushUnique(negativeSignals, 'invalid_url');
    pushUnique(missingEvidence, 'valid_url');
    return finalize({
      decision: 'REJECT',
      confidence: 'high',
      reasons,
      positiveSignals,
      negativeSignals,
      missingEvidence,
      qualification: null,
    });
  }

  if (isCorruptNumber(input.currentPrice) || isCorruptNumber(input.originalPrice)) {
    reasons.push('Precio corrupto o imposible');
    pushUnique(negativeSignals, 'corrupt_price');
    return finalize({
      decision: 'REJECT',
      confidence: 'high',
      reasons,
      positiveSignals,
      negativeSignals,
      missingEvidence,
      qualification: null,
    });
  }

  // B. Producto — ausencia de identidad ≠ REJECT (incertidumbre → NO_VERIFIED)
  if (!hasProductIdentity(input)) {
    reasons.push('Producto no identificable');
    pushUnique(missingEvidence, 'product_identity');
    pushUnique(negativeSignals, 'missing_product_identity');
    return finalize({
      decision: 'NO_VERIFIED_DEAL',
      confidence: 'low',
      reasons,
      positiveSignals,
      negativeSignals,
      missingEvidence,
      qualification: 'NO_VERIFIED_DEAL',
    });
  }
  pushUnique(positiveSignals, 'product_identifiable');
  reasons.push('Producto identificable');

  // C. Precio actual
  if (!isFinitePositive(input.currentPrice)) {
    reasons.push('Precio actual no identificable o no confiable');
    pushUnique(missingEvidence, 'current_price');
    pushUnique(negativeSignals, 'missing_current_price');
    return finalize({
      decision: 'NO_VERIFIED_DEAL',
      confidence: 'low',
      reasons,
      positiveSignals,
      negativeSignals,
      missingEvidence,
      qualification: 'NO_VERIFIED_DEAL',
    });
  }
  pushUnique(positiveSignals, 'current_price_valid');
  reasons.push('Precio actual válido');

  if ((input.store ?? '').trim()) {
    pushUnique(positiveSignals, 'store_present');
  } else {
    pushUnique(missingEvidence, 'store');
  }

  if ((input.source ?? '').trim()) {
    pushUnique(positiveSignals, 'source_provenance');
  }

  const imageOk = isValidOfferImage(input.imageUrl);
  if (imageOk) {
    pushUnique(positiveSignals, 'valid_image');
  } else {
    pushUnique(missingEvidence, 'valid_image');
    pushUnique(negativeSignals, 'missing_or_invalid_image');
    reasons.push('Imagen ausente o no válida (no bloquea por sí sola)');
  }

  const availability = (input.availability ?? '').trim().toLowerCase();
  if (availability) {
    if (availability.includes('out') || availability.includes('agotado') || availability === 'unavailable') {
      pushUnique(negativeSignals, 'unavailable');
      reasons.push('Disponibilidad reportada como no disponible');
    } else {
      pushUnique(positiveSignals, 'availability_known');
    }
  } else {
    pushUnique(missingEvidence, 'availability');
  }

  // Qualification existente (G/H/I/D)
  const q = resolveQualification(input);
  if (q.qualification === 'VERIFIED_DEAL' || q.qualification === 'PROMOTION') {
    for (const code of q.reasons) pushUnique(positiveSignals, `qualification_${code}`);
  } else if (q.qualification === 'POTENTIAL_DEAL') {
    for (const code of q.reasons) pushUnique(negativeSignals, `qualification_${code}`);
  } else {
    for (const code of q.reasons) {
      if (code.startsWith('missing_') || code === 'catalog_only') {
        pushUnique(missingEvidence, code);
      } else {
        pushUnique(negativeSignals, `qualification_${code}`);
      }
    }
  }

  const pmResult = applyPriceMemorySignals(
    input.priceMemory,
    positiveSignals,
    negativeSignals,
    missingEvidence,
    reasons,
  );

  let decision: DealQualityDecisionKind = q.qualification;

  // Explicar catalog-only
  if (q.qualification === 'NO_VERIFIED_DEAL') {
    reasons.push('Producto identificado pero sin evidencia suficiente de deal (catalog-only)');
    pushUnique(negativeSignals, 'catalog_only');
  } else if (q.qualification === 'VERIFIED_DEAL') {
    reasons.push('Qualification existente: evidencia fuerte de deal (VERIFIED_DEAL)');
    pushUnique(positiveSignals, 'qualification_verified');
  } else if (q.qualification === 'PROMOTION') {
    reasons.push('Qualification existente: promoción ligada al producto');
    pushUnique(positiveSignals, 'qualification_promotion');
  } else if (q.qualification === 'POTENTIAL_DEAL') {
    reasons.push('Qualification existente: señales parciales (POTENTIAL_DEAL)');
    pushUnique(positiveSignals, 'qualification_potential');
  }

  // H. Upgrade NO_VERIFIED → POTENTIAL con historial positivo real (no inventa VERIFIED)
  if (
    q.qualification === 'NO_VERIFIED_DEAL' &&
    pmResult.strongPositiveHistory &&
    !pmResult.artificial
  ) {
    decision = 'POTENTIAL_DEAL';
    reasons.push(
      'Price Memory aporta evidencia positiva insuficiente para VERIFIED pero suficiente para POTENTIAL_DEAL',
    );
    pushUnique(positiveSignals, 'upgraded_by_price_memory');
    // Quitar tono de catalog-only absoluto
    const idx = negativeSignals.indexOf('catalog_only');
    if (idx >= 0) negativeSignals.splice(idx, 1);
    pushUnique(negativeSignals, 'not_verified_still');
  }

  // Artificial fuerte sobre potential/verified → no subir; baja confianza vía mapConfidence
  if (pmResult.artificial && decision === 'VERIFIED_DEAL') {
    reasons.push('Se mantiene VERIFIED por qualification, pero lista artificial exige revisión humana');
  }

  const confidence = mapConfidence({
    decision,
    qualificationQuality: q.signals.sourceEvidenceQuality,
    artificial: pmResult.artificial,
    historyReady: pmResult.historyReady,
    strongPositiveHistory: pmResult.strongPositiveHistory,
  });

  // Si artificial + solo catalog → reforzar NO_VERIFIED
  if (pmResult.artificial && decision === 'NO_VERIFIED_DEAL') {
    reasons.push('Descuento nominal no confiable por lista artificial');
  }

  return finalize({
    decision,
    confidence,
    reasons,
    positiveSignals,
    negativeSignals,
    missingEvidence,
    qualification: q.qualification,
  });
}

export function toDealQualityTelemetry(decision: DealQualityDecision): DealQualityTelemetry {
  return {
    decision: decision.decision,
    confidence: decision.confidence,
    recommendedAction: decision.recommendedAction,
    reasons: decision.reasons.slice(0, 12),
    positiveSignals: decision.positiveSignals.slice(0, 16),
    negativeSignals: decision.negativeSignals.slice(0, 16),
    missingEvidence: decision.missingEvidence.slice(0, 12),
    qualification: decision.qualification,
    policyVersion: decision.policyVersion,
    at: decision.generatedAt,
  };
}
