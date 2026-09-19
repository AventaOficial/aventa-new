/**
 * CazaOfertasss — FASE 0. Modelo de dominio.
 *
 * Capas y autoridad (ninguna capa es autoridad de otra):
 *   discovery      → produce candidatos crudos, NO decide precio
 *   normalization  → canoniza precio/URL/identidad, NO decide validez
 *   evidence       → describe cómo sabemos lo que sabemos, NO puntúa
 *   validation     → decide si la oferta es sostenible, NO publica
 *   scoring        → ordena, NO valida
 *   affiliate      → decide monetizabilidad, NO valida la oferta
 *   dedupe         → decide identidad, NO reescribe precios
 *   publication    → prepara, NO valida ni puntúa
 *   tracking       → observa, NO deduce dinero
 *   revenue        → registra dinero externo, NO toca el money path de Aventa
 */

import {
  CAZAOFERTAS_CURRENCIES,
  CAZAOFERTAS_SCORE_VERSION,
  CAZAOFERTAS_STORES,
  DEAL_SCORE_WEIGHTS,
} from './constants';

// ---------------------------------------------------------------------------
// Primitivos
// ---------------------------------------------------------------------------

export type CazaStoreId = (typeof CAZAOFERTAS_STORES)[number];
export type CazaCurrency = (typeof CAZAOFERTAS_CURRENCIES)[number];

/** ISO-8601 UTC. Se mantiene como string para que el contrato sea serializable. */
export type IsoTimestamp = string;

export interface MoneyAmount {
  readonly value: number;
  readonly currency: CazaCurrency;
}

export type CazaCategoryId =
  | 'electronics'
  | 'computing'
  | 'home'
  | 'appliances'
  | 'beauty'
  | 'fashion'
  | 'toys'
  | 'sports'
  | 'grocery'
  | 'tools'
  | 'other';

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * Origen de la evidencia. `page_claim` existe para poder RECHAZAR descuentos
 * auto-declarados ("40% OFF"), no para creerlos.
 */
export type EvidenceSource =
  | 'store_official_api'
  | 'store_product_page'
  | 'page_claim'
  | 'internal_price_history'
  | 'operator_manual_entry';

export type EvidenceQuality = 'strong' | 'moderate' | 'weak' | 'unusable';

/** Confianza en el precio ACTUAL. */
export type PriceConfidence = 'verified' | 'reported' | 'unverified';

/**
 * Confianza en el precio de REFERENCIA. `page_claimed` nunca es autoridad:
 * es exactamente el caso "la página dice X% OFF".
 */
export type HistoricalConfidence =
  | 'observed_history'
  | 'store_reference_price'
  | 'page_claimed'
  | 'none';

export interface DealEvidence {
  readonly source: EvidenceSource;
  readonly capturedAt: IsoTimestamp;
  readonly currentPrice: number;
  readonly referencePrice: number | null;
  readonly currency: CazaCurrency;
  readonly evidenceQuality: EvidenceQuality;
  readonly priceConfidence: PriceConfidence;
  readonly historicalConfidence: HistoricalConfidence;
  /** Ventana observada en días. `null` = no tenemos historial, no "0 días". */
  readonly observationWindowDays: number | null;
  /** Observaciones dentro de la ventana. `null` = desconocido. */
  readonly observationCount: number | null;
  readonly couponApplied: boolean;
  readonly promotionApplied: boolean;
  readonly notes?: string;
}

/** Resultado de resolver QUÉ referencia podemos usar y con qué autoridad. */
export interface ReferencePriceResolution {
  readonly referencePrice: number | null;
  /** `true` sólo si la referencia puede sostener un descuento publicable. */
  readonly authoritative: boolean;
  readonly basis: HistoricalConfidence;
  readonly reasons: readonly string[];
}

// ---------------------------------------------------------------------------
// Seller / availability
// ---------------------------------------------------------------------------

export type SellerTrustClass = 'official_store' | 'high' | 'medium' | 'low' | 'unknown';

export interface DealSeller {
  readonly externalSellerId: string | null;
  readonly displayName: string | null;
  readonly trustClass: SellerTrustClass;
  /** `null` = desconocido. Nunca inventar 0. */
  readonly reputationScore: number | null;
}

export type DealAvailability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';

// ---------------------------------------------------------------------------
// Identidad
// ---------------------------------------------------------------------------

export type DealIdentityStrategy = 'external_product_id' | 'canonical_url';

export interface DealIdentity {
  readonly strategy: DealIdentityStrategy;
  /** Clave canónica estable: `store:strategy:value`. El título NUNCA participa. */
  readonly key: string;
  readonly store: CazaStoreId;
  readonly externalProductId: string | null;
  readonly normalizedUrl: string;
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

export type DealScoreComponentId = keyof typeof DEAL_SCORE_WEIGHTS;

export type DealGrade = 'GREAT_DEAL' | 'GOOD_DEAL' | 'REJECT';

export interface DealScoreReason {
  readonly component: DealScoreComponentId | 'gate';
  readonly weight: number;
  readonly earned: number;
  readonly detail: string;
}

export interface DealScore {
  readonly version: typeof CAZAOFERTAS_SCORE_VERSION;
  readonly score: number;
  readonly grade: DealGrade;
  readonly reasons: readonly DealScoreReason[];
  /** Gates duros incumplidos. No vacío ⇒ score 0 y grade REJECT. */
  readonly gatesFailed: readonly string[];
}

// ---------------------------------------------------------------------------
// Affiliate
// ---------------------------------------------------------------------------

export type AffiliateNetworkId = 'mercadolibre_affiliates' | 'amazon_associates_mx';

export interface AffiliateAttachment {
  readonly affiliateNetwork: AffiliateNetworkId;
  readonly affiliateUrl: string;
  readonly affiliateTrackingLabel: string;
  readonly affiliateGeneratedAt: IsoTimestamp;
  /**
   * Nombre de la variable de entorno que contiene el ID/secreto de afiliación.
   * Nunca el valor. Nunca se serializa al cliente con el valor resuelto.
   */
  readonly affiliateCredentialRef: string;
}

export interface AffiliateEligibility {
  readonly eligible: boolean;
  readonly monetizable: boolean;
  readonly reasons: readonly string[];
}

// ---------------------------------------------------------------------------
// DealCandidate
// ---------------------------------------------------------------------------

export type DealCandidateStatus =
  | 'DISCOVERED'
  | 'VALIDATED'
  | 'REJECTED'
  | 'PUBLICATION_READY'
  | 'EXPIRED';

export interface DealCandidate {
  readonly id: string;
  readonly store: CazaStoreId;
  readonly externalProductId: string | null;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly affiliateUrl: string | null;
  readonly currentPrice: number;
  readonly referencePrice: number | null;
  readonly currency: CazaCurrency;
  readonly discountPercent: number;
  readonly category: CazaCategoryId;
  readonly seller: DealSeller;
  readonly availability: DealAvailability;
  readonly evidence: DealEvidence;
  readonly detectedAt: IsoTimestamp;
  readonly score: DealScore;
  readonly status: DealCandidateStatus;

  // Campos de infraestructura (no parte del mínimo pedido, sí del contrato).
  readonly identity: DealIdentity;
  readonly affiliate: AffiliateAttachment | null;
  readonly firstSeenAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  /** Incrementa sólo cuando cambia un campo materialmente observable. */
  readonly revision: number;
}

/** Entrada cruda de un adapter de tienda. Todo es no confiable. */
export interface DealCandidateDraft {
  readonly store: CazaStoreId;
  readonly externalProductId?: string | null;
  readonly title: string;
  readonly url: string;
  readonly currentPrice: number | string;
  readonly referencePrice?: number | string | null;
  readonly currency: string;
  readonly category?: string | null;
  readonly seller?: Partial<DealSeller> | null;
  readonly availability?: string | null;
  readonly evidence: DealEvidence;
  readonly detectedAt?: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Resultado genérico
// ---------------------------------------------------------------------------

export type CazaResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasons: readonly string[] };

export function okResult<T>(value: T): CazaResult<T> {
  return { ok: true, value };
}

export function failResult<T>(reasons: readonly string[]): CazaResult<T> {
  return { ok: false, reasons };
}
