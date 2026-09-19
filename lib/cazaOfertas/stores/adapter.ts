/**
 * CazaOfertasss — FASE 0. Contrato de adapter de tienda.
 *
 * Autoridad: un adapter OBSERVA una tienda. No valida ofertas, no puntúa y no
 * decide monetización. Devuelve datos crudos + evidencia declarada.
 *
 * FASE 0 no implementa scraping. Si un programa no ofrece integración oficial
 * confirmada, su capacidad se declara `unsupported` y el método falla de forma
 * explícita en lugar de inventar datos.
 */

import type {
  AffiliateAttachment,
  CazaResult,
  CazaStoreId,
  DealCandidateDraft,
  DealEvidence,
} from '../types';

export type AdapterCapabilityStatus = 'supported' | 'unsupported' | 'unknown';

export interface DealStoreCapabilities {
  /** Listar ofertas candidatas mediante integración oficial. */
  readonly discover: AdapterCapabilityStatus;
  /** Leer un producto puntual (precio, stock, vendedor). */
  readonly getProduct: AdapterCapabilityStatus;
  /** Confirmar el precio actual contra la fuente. */
  readonly validatePrice: AdapterCapabilityStatus;
  /** Generar un link afiliado programáticamente. */
  readonly createAffiliateLink: AdapterCapabilityStatus;
  /** Nota de por qué una capacidad no está disponible. */
  readonly notes: readonly string[];
}

export interface DiscoverQuery {
  /** Límite duro. Nunca existe un modo "traer todo". */
  readonly limit: number;
  readonly cursor?: string | null;
  readonly categoryHint?: string | null;
}

export interface DiscoverPage {
  readonly drafts: readonly DealCandidateDraft[];
  readonly nextCursor: string | null;
}

export interface StoreProductSnapshot {
  readonly store: CazaStoreId;
  readonly externalProductId: string;
  readonly title: string;
  readonly url: string;
  readonly currentPrice: number;
  readonly referencePrice: number | null;
  readonly currency: string;
  readonly availability: string;
  readonly evidence: DealEvidence;
}

export interface PriceValidation {
  readonly matches: boolean;
  readonly observedPrice: number | null;
  readonly evidence: DealEvidence | null;
  readonly reasons: readonly string[];
}

export interface CreateAffiliateLinkInput {
  readonly canonicalUrl: string;
  readonly dealId: string;
  readonly trackingLabel: string;
}

/**
 * Contrato de adapter. Todos los métodos devuelven `CazaResult` para que un
 * adapter no implementado sea un rechazo observable, no una excepción suelta.
 */
export interface DealStoreAdapter {
  readonly store: CazaStoreId;
  readonly capabilities: DealStoreCapabilities;

  discover(query: DiscoverQuery): Promise<CazaResult<DiscoverPage>>;
  getProduct(externalProductId: string): Promise<CazaResult<StoreProductSnapshot>>;
  validatePrice(externalProductId: string, expectedPrice: number): Promise<CazaResult<PriceValidation>>;
  createAffiliateLink(input: CreateAffiliateLinkInput): Promise<CazaResult<AffiliateAttachment>>;
}

export const ADAPTER_NOT_IMPLEMENTED_REASON = 'adapter.capability_not_implemented' as const;

export function capabilityUnavailable(
  store: CazaStoreId,
  capability: keyof Omit<DealStoreCapabilities, 'notes'>,
  status: AdapterCapabilityStatus
): CazaResult<never> {
  return {
    ok: false,
    reasons: [`${ADAPTER_NOT_IMPLEMENTED_REASON}:${store}.${capability}:${status}`],
  };
}
