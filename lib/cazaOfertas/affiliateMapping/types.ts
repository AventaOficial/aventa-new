/**
 * CazaOfertasss — FASE 4.1. Affiliate mapping operado.
 *
 * Un mapping es una asociación OPERADA (cargada por un humano/proceso
 * autorizado) entre la identidad de un producto y su URL afiliada. No se
 * genera programáticamente: ni Amazon ni Mercado Libre exponen una API
 * confirmada para ello.
 *
 * Autoridades que NO se duplican aquí:
 *   - identidad          → identity.ts (`buildDealIdentity`)
 *   - monetizabilidad    → affiliate.ts (`validateAffiliateAttachment`, markers)
 *   - tracking label     → affiliate.ts (`isValidTrackingLabel`, `buildTrackingLabel`)
 *
 * Nunca almacena secretos: el credential ref del attachment se deriva de la
 * red (`AFFILIATE_NETWORKS[network].credentialEnvVar`), no se persiste.
 */

import type { AFFILIATE_MAPPING_STATUSES } from '../constants';
import type {
  AffiliateAttachment,
  AffiliateNetworkId,
  CazaStoreId,
  DealIdentityStrategy,
  IsoTimestamp,
} from '../types';

export type AffiliateMappingStatus = (typeof AFFILIATE_MAPPING_STATUSES)[number];

export interface AffiliateMapping {
  /** Derivado de identityKey: `caza_map_<hash>`. */
  readonly id: string;
  /** Igual a `DealIdentity.key`: `store:pid:X` (primaria) o `store:url:hash` (fallback). */
  readonly identityKey: string;
  readonly identityStrategy: DealIdentityStrategy;
  readonly store: CazaStoreId;
  readonly externalProductId: string | null;
  /** URL canónica normalizada por identity.ts. */
  readonly canonicalUrl: string;
  readonly affiliateUrl: string;
  readonly network: AffiliateNetworkId;
  /** Validado por `isValidTrackingLabel`. `null` ⇒ no hay tracking declarado. */
  readonly trackingLabel: string | null;
  readonly status: AffiliateMappingStatus;
  readonly validFrom: IsoTimestamp;
  readonly validUntil: IsoTimestamp | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/** Entrada cruda de operador. Todo es no confiable. */
export interface AffiliateMappingDraft {
  readonly store: string;
  readonly externalProductId?: string | null;
  readonly canonicalUrl: string;
  readonly affiliateUrl: string;
  /** Default: red de la tienda. Si se provee debe coincidir. */
  readonly network?: string | null;
  readonly trackingLabel?: string | null;
  readonly status?: string | null;
  readonly validFrom?: IsoTimestamp | null;
  readonly validUntil?: IsoTimestamp | null;
}

export type AffiliateMappingUpsertAction = 'created' | 'updated' | 'unchanged';

export interface AffiliateMappingUpsertOutcome {
  readonly action: AffiliateMappingUpsertAction;
  readonly mapping: AffiliateMapping;
}

/**
 * Repositorio de mappings. Lookup puntual por claves (≤ AFFILIATE_MAPPING_LOOKUP_MAX_KEYS).
 * No existe listAll.
 */
export interface AffiliateMappingRepository {
  findByIdentityKey(identityKey: string): Promise<AffiliateMapping | null>;
  findByIdentityKeys(identityKeys: readonly string[]): Promise<readonly AffiliateMapping[]>;
  /** Upsert por `identity_key` (unique). */
  upsert(mapping: AffiliateMapping): Promise<AffiliateMappingUpsertOutcome>;
}

export type AffiliateMappingLookupOutcome =
  | 'FOUND'
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'DISABLED'
  | 'AMBIGUOUS';

export interface AffiliateMappingLookupResult {
  readonly outcome: AffiliateMappingLookupOutcome;
  readonly mapping: AffiliateMapping | null;
  /** Sólo en FOUND. Validado por affiliate.ts. */
  readonly attachment: AffiliateAttachment | null;
  /** `mapping` si el operador declaró label; `derived_internal` si se derivó el label interno de publicación. */
  readonly trackingLabelSource: 'mapping' | 'derived_internal' | null;
  readonly reasons: readonly string[];
}
