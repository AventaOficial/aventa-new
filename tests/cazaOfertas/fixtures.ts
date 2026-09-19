/**
 * CazaOfertasss — FASE 0. Fixtures sintéticos de contrato.
 *
 * Todos los timestamps son fijos: un test de determinismo no puede depender del
 * reloj de la máquina.
 */

import {
  buildDealCandidate,
  buildPublicationRecord,
  buildTelegramCardSnapshot,
  generateTelegramCard,
  publicationIdentityKey,
  type AffiliateAttachment,
  type BuildPublicationRecordInput,
  type DealCandidate,
  type DealCandidateDraft,
  type DealEvidence,
} from '@/lib/cazaOfertas';

export const NOW_ISO = '2026-09-19T12:00:00.000Z';
export const NOW = new Date(NOW_ISO);
export const CAPTURED_ISO = '2026-09-19T11:30:00.000Z';

export const AMAZON_RAW_URL =
  'https://www.amazon.com.mx/dp/B08N5WRWNW?tag=legacy-20&th=1&utm_source=newsletter';
export const AMAZON_CANONICAL_URL = 'https://amazon.com.mx/dp/B08N5WRWNW';

export const ML_RAW_URL =
  'https://www.mercadolibre.com.mx/audifonos-geniales/p/MLM1234567890?utm_medium=cpc';
export const ML_CANONICAL_URL = 'https://mercadolibre.com.mx/audifonos-geniales/p/MLM1234567890';

/** Evidencia fuerte: API oficial + historial observado denso. */
export function strongEvidence(overrides: Partial<DealEvidence> = {}): DealEvidence {
  return {
    source: 'store_official_api',
    capturedAt: CAPTURED_ISO,
    currentPrice: 1999,
    referencePrice: 3499,
    currency: 'MXN',
    evidenceQuality: 'strong',
    priceConfidence: 'verified',
    historicalConfidence: 'observed_history',
    observationWindowDays: 30,
    observationCount: 20,
    couponApplied: false,
    promotionApplied: true,
    ...overrides,
  };
}

/** Evidencia que sólo repite el "40% OFF" de la página. */
export function pageClaimEvidence(overrides: Partial<DealEvidence> = {}): DealEvidence {
  return strongEvidence({
    source: 'page_claim',
    priceConfidence: 'reported',
    historicalConfidence: 'page_claimed',
    observationWindowDays: null,
    observationCount: null,
    ...overrides,
  });
}

export function amazonDraft(overrides: Partial<DealCandidateDraft> = {}): DealCandidateDraft {
  return {
    store: 'amazon_mx',
    title: 'Audífonos inalámbricos con cancelación de ruido',
    url: AMAZON_RAW_URL,
    currentPrice: 1999,
    referencePrice: 3499,
    currency: 'MXN',
    category: 'electronics',
    seller: { trustClass: 'official_store', displayName: 'Amazon México', externalSellerId: null, reputationScore: null },
    availability: 'in_stock',
    evidence: strongEvidence(),
    detectedAt: NOW_ISO,
    ...overrides,
  };
}

export function mercadoLibreDraft(
  overrides: Partial<DealCandidateDraft> = {}
): DealCandidateDraft {
  return {
    store: 'mercadolibre_mx',
    title: 'Audífonos inalámbricos con cancelación de ruido',
    url: ML_RAW_URL,
    currentPrice: 1999,
    referencePrice: 3499,
    currency: 'MXN',
    category: 'electronics',
    seller: { trustClass: 'official_store', displayName: 'Tienda oficial', externalSellerId: null, reputationScore: null },
    availability: 'in_stock',
    evidence: strongEvidence(),
    detectedAt: NOW_ISO,
    ...overrides,
  };
}

export function amazonAffiliate(
  overrides: Partial<AffiliateAttachment> = {}
): AffiliateAttachment {
  return {
    affiliateNetwork: 'amazon_associates_mx',
    affiliateUrl: 'https://www.amazon.com.mx/dp/B08N5WRWNW?tag=cazaofertasss-20',
    affiliateTrackingLabel: 'caza_0f1e2d3c_20260919',
    affiliateGeneratedAt: NOW_ISO,
    affiliateCredentialRef: 'CAZAOFERTAS_AMAZON_ASSOCIATE_TAG',
    ...overrides,
  };
}

export function mercadoLibreAffiliate(
  overrides: Partial<AffiliateAttachment> = {}
): AffiliateAttachment {
  return {
    affiliateNetwork: 'mercadolibre_affiliates',
    affiliateUrl: `${ML_CANONICAL_URL}?matt_word=cazaofertasss`,
    affiliateTrackingLabel: 'caza_0f1e2d3c_20260919',
    affiliateGeneratedAt: NOW_ISO,
    affiliateCredentialRef: 'CAZAOFERTAS_ML_AFFILIATE_TAG',
    ...overrides,
  };
}

/** Candidato monetizable Amazon listo para prepare/tests. */
export function monetizableAmazonCandidate(): DealCandidate {
  const r = buildDealCandidate(amazonDraft(), { now: NOW, affiliate: amazonAffiliate() });
  if (!r.ok) throw new Error(r.reasons.join(','));
  return r.value;
}

/** Construye input de publication con snapshot coherente. */
export function publicationInputWithSnapshot(
  overrides: Partial<BuildPublicationRecordInput> = {}
): BuildPublicationRecordInput {
  const candidate = monetizableAmazonCandidate();
  const channel = overrides.telegramChannel ?? '@cazaofertasss';
  const trackingLabel = overrides.trackingLabel ?? candidate.affiliate!.affiliateTrackingLabel;
  const dealId = overrides.dealId ?? candidate.id;
  const store = overrides.store ?? candidate.store;
  const affiliateNetwork = overrides.affiliateNetwork ?? candidate.affiliate!.affiliateNetwork;
  const affiliateUrl = overrides.affiliateUrl ?? candidate.affiliateUrl!;
  const publishedRevision = overrides.publishedRevision ?? candidate.revision;
  const preparedAt = overrides.preparedAt ?? NOW_ISO;

  const publicationId = publicationIdentityKey({
    dealId,
    affiliateNetwork,
    telegramChannel: channel,
    trackingLabel,
  });

  const card = generateTelegramCard({
    ...candidate,
    id: dealId,
    store,
    affiliateUrl,
    revision: publishedRevision,
  });
  if (!card.ok) throw new Error(card.reasons.join(','));

  // Asegurar que el texto del snapshot contiene la affiliate URL final.
  const text = card.value.text.includes(affiliateUrl)
    ? card.value.text
    : `${card.value.text}\n${affiliateUrl}`;

  const snapshot = buildTelegramCardSnapshot({
    publicationId,
    candidate: {
      ...candidate,
      id: dealId,
      store,
      affiliateUrl,
      revision: publishedRevision,
    },
    card: { ...card.value, dealId, ctaUrl: affiliateUrl, text },
    generatedAt: preparedAt,
  });
  if (!snapshot.ok) throw new Error(snapshot.reasons.join(','));

  return {
    dealId,
    store,
    affiliateNetwork,
    trackingLabel,
    telegramChannel: channel,
    preparedAt,
    affiliateUrl,
    publishedRevision,
    maxAttempts: overrides.maxAttempts,
    cardSnapshot: overrides.cardSnapshot ?? snapshot.value,
  };
}

export function buildTestPublicationRecord(
  overrides: Partial<BuildPublicationRecordInput> = {}
) {
  return buildPublicationRecord(publicationInputWithSnapshot(overrides));
}
