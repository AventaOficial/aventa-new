/**
 * CazaOfertasss — FASE 0. Ensamblado del DealCandidate.
 *
 * Esta capa ORQUESTA: valida entrada (validation) → normaliza (price/identity)
 * → interroga evidencia (evidence) → puntúa (scoring) → evalúa monetización
 * (affiliate). No reimplementa ninguna de esas decisiones.
 */

import { assessAffiliateEligibility } from './affiliate';
import { TITLE_MAX_LENGTH } from './constants';
import { resolveDiscountClaim, validateEvidence } from './evidence';
import { buildDealIdentity, dealCandidateIdFromIdentity } from './identity';
import { normalizeCurrency, normalizePrice } from './price';
import { computeDealScore } from './scoring';
import type {
  AffiliateAttachment,
  CazaResult,
  DealCandidate,
  DealCandidateStatus,
  DealSeller,
} from './types';
import { failResult, okResult } from './types';
import {
  coerceAvailability,
  coerceCategory,
  coerceSellerTrustClass,
  dealCandidateDraftSchema,
  parseWithSchema,
} from './validation';

/** Quita controles y colapsa espacios. El título es texto de display, no identidad. */
export function sanitizeTitle(raw: string): string {
  const withoutControls = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  return withoutControls.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_LENGTH);
}

export interface BuildDealCandidateOptions {
  readonly now: Date;
  readonly affiliate?: AffiliateAttachment | null;
}

export function buildDealCandidate(
  rawDraft: unknown,
  options: BuildDealCandidateOptions
): CazaResult<DealCandidate> {
  const parsed = parseWithSchema(dealCandidateDraftSchema, rawDraft);
  if (!parsed.ok) return failResult(parsed.reasons);
  const draft = parsed.value;

  const identity = buildDealIdentity({
    store: draft.store,
    url: draft.url,
    externalProductId: draft.externalProductId ?? null,
  });
  if (!identity.ok) return failResult(identity.reasons);

  const currency = normalizeCurrency(draft.currency);
  if (!currency.ok) return failResult(currency.reasons);

  const currentPrice = normalizePrice(draft.currentPrice);
  if (!currentPrice.ok) return failResult(currentPrice.reasons);

  // La moneda de la evidencia debe coincidir con la del candidato: si no,
  // cualquier descuento sería una comparación entre monedas distintas.
  if (draft.evidence.currency !== currency.value) {
    return failResult([
      `currency.mismatch_evidence:${draft.evidence.currency}!=${currency.value}`,
    ]);
  }

  // El precio actual declarado debe coincidir con el observado en la evidencia.
  const evidenceCurrent = normalizePrice(draft.evidence.currentPrice);
  if (!evidenceCurrent.ok) {
    return failResult(evidenceCurrent.reasons.map((r) => `evidence_current_${r}`));
  }
  if (evidenceCurrent.value !== currentPrice.value) {
    return failResult([
      `price.mismatch_with_evidence:${currentPrice.value}!=${evidenceCurrent.value}`,
    ]);
  }

  // El precio de referencia declarado también debe coincidir con la evidencia:
  // si no, el descuento sería una afirmación sin respaldo.
  const draftReferenceRaw = draft.referencePrice ?? null;
  const evidenceReferenceRaw = draft.evidence.referencePrice;
  if ((draftReferenceRaw === null) !== (evidenceReferenceRaw === null)) {
    return failResult(['reference_price.presence_mismatch_with_evidence']);
  }
  if (draftReferenceRaw !== null && evidenceReferenceRaw !== null) {
    const draftReference = normalizePrice(draftReferenceRaw);
    if (!draftReference.ok) {
      return failResult(draftReference.reasons.map((r) => `reference_${r}`));
    }
    const evidenceReference = normalizePrice(evidenceReferenceRaw);
    if (!evidenceReference.ok) {
      return failResult(evidenceReference.reasons.map((r) => `evidence_reference_${r}`));
    }
    if (draftReference.value !== evidenceReference.value) {
      return failResult([
        `reference_price.mismatch_with_evidence:${draftReference.value}!=${evidenceReference.value}`,
      ]);
    }
  }

  const evidence = { ...draft.evidence, currency: currency.value };
  const evidenceValidation = validateEvidence(evidence, options.now);

  const discountClaim = resolveDiscountClaim(evidence);
  if (!discountClaim.ok) return failResult(discountClaim.reasons);

  const category = coerceCategory(draft.category);
  const availability = coerceAvailability(draft.availability);
  const seller: DealSeller = {
    externalSellerId: draft.seller?.externalSellerId ?? null,
    displayName: draft.seller?.displayName ?? null,
    trustClass: coerceSellerTrustClass(draft.seller?.trustClass),
    reputationScore: draft.seller?.reputationScore ?? null,
  };

  const score = computeDealScore({
    discountPercent: discountClaim.value.discountPercent,
    discountClaimable: discountClaim.value.claimable,
    evidence,
    sellerTrustClass: seller.trustClass,
    availability,
    category,
    evidenceStale: evidenceValidation.stale,
    evidenceUsable: evidenceValidation.usable,
  });

  const attachment = options.affiliate ?? null;
  const eligibility = assessAffiliateEligibility({
    identity: identity.value,
    canonicalUrl: identity.value.normalizedUrl,
    attachment,
  });

  const status = resolveStatus(score.grade === 'REJECT', eligibility.monetizable);
  const detectedAt = draft.detectedAt ?? options.now.toISOString();

  return okResult({
    id: dealCandidateIdFromIdentity(identity.value),
    store: draft.store,
    externalProductId: identity.value.externalProductId,
    title: sanitizeTitle(draft.title),
    canonicalUrl: identity.value.normalizedUrl,
    affiliateUrl: eligibility.monetizable && attachment ? attachment.affiliateUrl : null,
    currentPrice: currentPrice.value,
    referencePrice: discountClaim.value.referencePrice,
    currency: currency.value,
    discountPercent: discountClaim.value.discountPercent,
    category,
    seller,
    availability,
    evidence,
    detectedAt,
    score,
    status,
    identity: identity.value,
    affiliate: eligibility.monetizable ? attachment : null,
    firstSeenAt: detectedAt,
    updatedAt: options.now.toISOString(),
    revision: 1,
  });
}

function resolveStatus(rejected: boolean, monetizable: boolean): DealCandidateStatus {
  if (rejected) return 'REJECTED';
  return monetizable ? 'PUBLICATION_READY' : 'VALIDATED';
}
