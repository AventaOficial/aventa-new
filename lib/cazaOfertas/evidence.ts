/**
 * CazaOfertasss — FASE 0. Evidence.
 *
 * Autoridad: esta capa decide QUÉ podemos afirmar y con qué respaldo. No
 * puntúa, no publica, no calcula descuento (eso es `price.ts`).
 *
 * Regla dura: un descuento nunca es válido sólo porque una página diga "X% OFF".
 */

import {
  EVIDENCE_MAX_AGE_MS,
  HISTORY_MIN_OBSERVATIONS,
  HISTORY_MIN_WINDOW_DAYS,
  IMPLAUSIBLE_DISCOUNT_PERCENT,
} from './constants';
import { computeDiscountPercent, normalizeCurrency, normalizePrice } from './price';
import type {
  CazaResult,
  DealEvidence,
  EvidenceQuality,
  HistoricalConfidence,
  ReferencePriceResolution,
} from './types';
import { failResult, okResult } from './types';

/** Fuentes que pueden sostener un precio ACTUAL verificado. */
const VERIFIABLE_CURRENT_PRICE_SOURCES: ReadonlySet<DealEvidence['source']> = new Set([
  'store_official_api',
  'store_product_page',
]);

/** Bases de referencia que pueden sostener un descuento publicable. */
const AUTHORITATIVE_REFERENCE_BASES: ReadonlySet<HistoricalConfidence> = new Set([
  'observed_history',
  'store_reference_price',
]);

const QUALITY_RANK: Readonly<Record<EvidenceQuality, number>> = {
  unusable: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
};

export function parseTimestamp(raw: unknown): CazaResult<number> {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return failResult(['timestamp.missing']);
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return failResult(['timestamp.unparseable']);
  return okResult(ms);
}

export function evidenceAgeMs(evidence: DealEvidence, now: Date): number | null {
  const captured = parseTimestamp(evidence.capturedAt);
  if (!captured.ok) return null;
  return now.getTime() - captured.value;
}

/** Evidencia obsoleta o del futuro no puede sostener una publicación. */
export function isEvidenceStale(
  evidence: DealEvidence,
  now: Date,
  maxAgeMs: number = EVIDENCE_MAX_AGE_MS
): boolean {
  const age = evidenceAgeMs(evidence, now);
  if (age === null) return true;
  if (age < 0) return true; // timestamp futuro ⇒ reloj no confiable
  return age > maxAgeMs;
}

/** ¿El historial tiene densidad suficiente para afirmar un precio observado? */
export function historyIsSufficient(evidence: DealEvidence): boolean {
  const { observationWindowDays, observationCount } = evidence;
  if (observationWindowDays === null || observationCount === null) return false;
  return (
    observationWindowDays >= HISTORY_MIN_WINDOW_DAYS &&
    observationCount >= HISTORY_MIN_OBSERVATIONS
  );
}

export interface EvidenceValidation {
  readonly usable: boolean;
  readonly stale: boolean;
  readonly reasons: readonly string[];
}

/** Valida la forma y coherencia interna de la evidencia. No la puntúa. */
export function validateEvidence(evidence: DealEvidence, now: Date): EvidenceValidation {
  const reasons: string[] = [];

  const currency = normalizeCurrency(evidence.currency);
  if (!currency.ok) reasons.push(...currency.reasons);

  const current = normalizePrice(evidence.currentPrice);
  if (!current.ok) reasons.push(...current.reasons.map((r) => `evidence_current_${r}`));

  if (evidence.referencePrice !== null) {
    const reference = normalizePrice(evidence.referencePrice);
    if (!reference.ok) reasons.push(...reference.reasons.map((r) => `evidence_reference_${r}`));
  }

  const captured = parseTimestamp(evidence.capturedAt);
  if (!captured.ok) reasons.push(...captured.reasons.map((r) => `evidence_${r}`));

  if (evidence.evidenceQuality === 'unusable') {
    reasons.push('evidence.quality_unusable');
  }

  // Coherencia: no se puede declarar precio verificado desde una fuente no verificable.
  if (
    evidence.priceConfidence === 'verified' &&
    !VERIFIABLE_CURRENT_PRICE_SOURCES.has(evidence.source)
  ) {
    reasons.push(`evidence.price_confidence_unsupported_by_source:${evidence.source}`);
  }

  // Coherencia: historial observado exige densidad declarada.
  if (evidence.historicalConfidence === 'observed_history' && !historyIsSufficient(evidence)) {
    reasons.push('evidence.observed_history_insufficient_density');
  }

  if (evidence.observationWindowDays !== null && evidence.observationWindowDays < 0) {
    reasons.push('evidence.observation_window_negative');
  }
  if (evidence.observationCount !== null && evidence.observationCount < 0) {
    reasons.push('evidence.observation_count_negative');
  }

  const stale = isEvidenceStale(evidence, now);
  if (stale) reasons.push('evidence.stale');

  const usable = reasons.length === 0;
  return { usable, stale, reasons: usable ? ['evidence.usable'] : reasons };
}

/**
 * Resuelve el precio de referencia utilizable y si es autoritativo.
 *
 * `page_claimed` produce SIEMPRE `authoritative: false`: es el caso en que la
 * página afirma un descuento sin respaldo. La referencia se conserva para
 * auditoría, pero no puede sostener un descuento publicable.
 */
export function resolveReferencePrice(evidence: DealEvidence): ReferencePriceResolution {
  const reasons: string[] = [];

  if (evidence.referencePrice === null) {
    return {
      referencePrice: null,
      authoritative: false,
      basis: 'none',
      reasons: ['reference.absent'],
    };
  }

  const reference = normalizePrice(evidence.referencePrice);
  if (!reference.ok) {
    return {
      referencePrice: null,
      authoritative: false,
      basis: 'none',
      reasons: reference.reasons.map((r) => `reference_${r}`),
    };
  }

  const basis = evidence.historicalConfidence;

  if (!AUTHORITATIVE_REFERENCE_BASES.has(basis)) {
    reasons.push(`reference.non_authoritative_basis:${basis}`);
    return { referencePrice: reference.value, authoritative: false, basis, reasons };
  }

  if (basis === 'observed_history' && !historyIsSufficient(evidence)) {
    reasons.push('reference.history_density_insufficient');
    return { referencePrice: reference.value, authoritative: false, basis, reasons };
  }

  if (QUALITY_RANK[evidence.evidenceQuality] < QUALITY_RANK.moderate) {
    reasons.push(`reference.quality_too_low:${evidence.evidenceQuality}`);
    return { referencePrice: reference.value, authoritative: false, basis, reasons };
  }

  reasons.push(`reference.authoritative:${basis}`);
  return { referencePrice: reference.value, authoritative: true, basis, reasons };
}

export interface DiscountClaim {
  readonly referencePrice: number | null;
  readonly discountPercent: number;
  readonly claimable: boolean;
  readonly reasons: readonly string[];
}

/**
 * Único camino permitido para obtener el descuento de un candidato.
 *
 * Un descuento sólo es reclamable si la referencia es autoritativa. Un
 * descuento implausible (> IMPLAUSIBLE_DISCOUNT_PERCENT) exige historial
 * observado, no el precio de lista de la tienda.
 */
export function resolveDiscountClaim(evidence: DealEvidence): CazaResult<DiscountClaim> {
  const current = normalizePrice(evidence.currentPrice);
  if (!current.ok) return failResult(current.reasons.map((r) => `evidence_current_${r}`));

  const resolution = resolveReferencePrice(evidence);
  const reasons: string[] = [...resolution.reasons];

  if (!resolution.authoritative) {
    return okResult({
      referencePrice: resolution.referencePrice,
      discountPercent: 0,
      claimable: false,
      reasons: [...reasons, 'discount.not_claimable'],
    });
  }

  const computed = computeDiscountPercent(current.value, resolution.referencePrice);
  if (!computed.ok) return failResult([...reasons, ...computed.reasons]);

  const { discountPercent } = computed.value;
  reasons.push(...computed.value.reasons);

  if (
    discountPercent >= IMPLAUSIBLE_DISCOUNT_PERCENT &&
    resolution.basis !== 'observed_history'
  ) {
    return okResult({
      referencePrice: resolution.referencePrice,
      discountPercent: 0,
      claimable: false,
      reasons: [...reasons, 'discount.implausible_without_observed_history'],
    });
  }

  return okResult({
    referencePrice: resolution.referencePrice,
    discountPercent,
    claimable: discountPercent > 0,
    reasons,
  });
}
