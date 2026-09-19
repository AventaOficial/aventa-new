/**
 * CazaOfertasss — FASE 0. DealScore determinista.
 *
 * Autoridad: esta capa ORDENA ofertas. No valida evidencia (eso ya pasó) y no
 * decide monetización (eso es `affiliate.ts`). Un LLM nunca participa.
 *
 * El score es una función pura de señales explícitas: mismas entradas ⇒ mismo
 * score, mismo grade y mismas razones en el mismo orden.
 */

import {
  CAZAOFERTAS_SCORE_VERSION,
  DEAL_SCORE_GRADE_THRESHOLDS,
  DEAL_SCORE_MAX,
  DEAL_SCORE_MIN,
  DEAL_SCORE_WEIGHTS,
  DISCOUNT_SATURATION_PERCENT,
  MIN_PUBLISHABLE_DISCOUNT_PERCENT,
} from './constants';
import type {
  CazaCategoryId,
  DealAvailability,
  DealEvidence,
  DealGrade,
  DealScore,
  DealScoreComponentId,
  DealScoreReason,
  SellerTrustClass,
} from './types';

/** Orden fijo de evaluación: garantiza `reasons[]` determinista. */
const COMPONENT_ORDER: readonly DealScoreComponentId[] = [
  'discountStrength',
  'historicalPriceConfidence',
  'currentPriceConfidence',
  'evidenceQuality',
  'sellerQuality',
  'availability',
  'categoryRelevance',
  'couponPromotion',
];

const HISTORICAL_CONFIDENCE_RATIO: Readonly<
  Record<DealEvidence['historicalConfidence'], number>
> = {
  observed_history: 1,
  store_reference_price: 0.6,
  page_claimed: 0,
  none: 0,
};

const PRICE_CONFIDENCE_RATIO: Readonly<Record<DealEvidence['priceConfidence'], number>> = {
  verified: 1,
  reported: 0.5,
  unverified: 0,
};

const EVIDENCE_QUALITY_RATIO: Readonly<Record<DealEvidence['evidenceQuality'], number>> = {
  strong: 1,
  moderate: 0.65,
  weak: 0.25,
  unusable: 0,
};

const SELLER_TRUST_RATIO: Readonly<Record<SellerTrustClass, number>> = {
  official_store: 1,
  high: 0.85,
  medium: 0.5,
  low: 0.15,
  unknown: 0.3,
};

const AVAILABILITY_RATIO: Readonly<Record<DealAvailability, number>> = {
  in_stock: 1,
  low_stock: 0.7,
  unknown: 0.3,
  out_of_stock: 0,
};

/**
 * Relevancia por categoría para el canal de CazaOfertasss. Es una constante de
 * negocio configurable, no una heurística oculta dentro del score.
 */
const CATEGORY_RELEVANCE_RATIO: Readonly<Record<CazaCategoryId, number>> = {
  electronics: 1,
  computing: 1,
  appliances: 0.9,
  home: 0.8,
  tools: 0.7,
  beauty: 0.6,
  toys: 0.6,
  sports: 0.6,
  fashion: 0.5,
  grocery: 0.4,
  other: 0.3,
};

export interface DealScoreInput {
  /** Descuento YA validado por `resolveDiscountClaim`. Nunca el de la página. */
  readonly discountPercent: number;
  readonly discountClaimable: boolean;
  readonly evidence: DealEvidence;
  readonly sellerTrustClass: SellerTrustClass;
  readonly availability: DealAvailability;
  readonly category: CazaCategoryId;
  readonly evidenceStale: boolean;
  readonly evidenceUsable: boolean;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Redondeo a 2 decimales para que `earned` sea legible y comparable. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function componentRatio(component: DealScoreComponentId, input: DealScoreInput): {
  ratio: number;
  detail: string;
} {
  switch (component) {
    case 'discountStrength': {
      if (!input.discountClaimable) {
        return { ratio: 0, detail: 'descuento no reclamable con la evidencia disponible' };
      }
      const ratio = clampRatio(input.discountPercent / DISCOUNT_SATURATION_PERCENT);
      return { ratio, detail: `descuento validado ${input.discountPercent}%` };
    }
    case 'historicalPriceConfidence': {
      const basis = input.evidence.historicalConfidence;
      return {
        ratio: HISTORICAL_CONFIDENCE_RATIO[basis],
        detail: `base de referencia: ${basis}`,
      };
    }
    case 'currentPriceConfidence': {
      const confidence = input.evidence.priceConfidence;
      return {
        ratio: PRICE_CONFIDENCE_RATIO[confidence],
        detail: `confianza de precio actual: ${confidence}`,
      };
    }
    case 'evidenceQuality': {
      const quality = input.evidence.evidenceQuality;
      return {
        ratio: EVIDENCE_QUALITY_RATIO[quality],
        detail: `calidad de evidencia: ${quality}`,
      };
    }
    case 'sellerQuality': {
      return {
        ratio: SELLER_TRUST_RATIO[input.sellerTrustClass],
        detail: `vendedor: ${input.sellerTrustClass}`,
      };
    }
    case 'availability': {
      return {
        ratio: AVAILABILITY_RATIO[input.availability],
        detail: `disponibilidad: ${input.availability}`,
      };
    }
    case 'categoryRelevance': {
      return {
        ratio: CATEGORY_RELEVANCE_RATIO[input.category],
        detail: `categoría: ${input.category}`,
      };
    }
    case 'couponPromotion': {
      const coupon = input.evidence.couponApplied;
      const promotion = input.evidence.promotionApplied;
      const ratio = coupon && promotion ? 1 : coupon || promotion ? 0.6 : 0;
      return {
        ratio,
        detail: `cupón: ${coupon ? 'sí' : 'no'}, promoción: ${promotion ? 'sí' : 'no'}`,
      };
    }
  }
}

/**
 * Gates duros. Si alguno falla, el score es 0 y el grade REJECT: no queremos
 * que una oferta insostenible acumule puntos por categoría o vendedor.
 */
function evaluateGates(input: DealScoreInput): string[] {
  const gates: string[] = [];
  if (!input.evidenceUsable) gates.push('gate.evidence_unusable');
  if (input.evidenceStale) gates.push('gate.evidence_stale');
  if (input.evidence.evidenceQuality === 'unusable') gates.push('gate.evidence_quality_unusable');
  if (!input.discountClaimable) gates.push('gate.discount_not_claimable');
  if (input.discountPercent < MIN_PUBLISHABLE_DISCOUNT_PERCENT) {
    gates.push('gate.discount_below_minimum');
  }
  if (input.availability === 'out_of_stock') gates.push('gate.out_of_stock');
  return gates;
}

export function gradeFromScore(score: number): DealGrade {
  if (score >= DEAL_SCORE_GRADE_THRESHOLDS.GREAT_DEAL) return 'GREAT_DEAL';
  if (score >= DEAL_SCORE_GRADE_THRESHOLDS.GOOD_DEAL) return 'GOOD_DEAL';
  return 'REJECT';
}

export function computeDealScore(input: DealScoreInput): DealScore {
  const gatesFailed = evaluateGates(input);

  if (gatesFailed.length > 0) {
    const reasons: DealScoreReason[] = gatesFailed.map((gate) => ({
      component: 'gate' as const,
      weight: 0,
      earned: 0,
      detail: gate,
    }));
    return {
      version: CAZAOFERTAS_SCORE_VERSION,
      score: DEAL_SCORE_MIN,
      grade: 'REJECT',
      reasons,
      gatesFailed,
    };
  }

  const reasons: DealScoreReason[] = [];
  let total = 0;

  for (const component of COMPONENT_ORDER) {
    const weight = DEAL_SCORE_WEIGHTS[component];
    const { ratio, detail } = componentRatio(component, input);
    const earned = round2(clampRatio(ratio) * weight);
    total += earned;
    reasons.push({ component, weight, earned, detail });
  }

  const score = Math.min(DEAL_SCORE_MAX, Math.max(DEAL_SCORE_MIN, Math.round(total)));

  return {
    version: CAZAOFERTAS_SCORE_VERSION,
    score,
    grade: gradeFromScore(score),
    reasons,
    gatesFailed: [],
  };
}

/** Suma de pesos. Un test de contrato exige que sea DEAL_SCORE_MAX. */
export function totalScoreWeight(): number {
  return COMPONENT_ORDER.reduce((sum, c) => sum + DEAL_SCORE_WEIGHTS[c], 0);
}
