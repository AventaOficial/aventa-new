/**
 * CazaOfertasss — FASE 4.1. Fila `caza_affiliate_mappings` ↔ dominio.
 */

import type { AffiliateMapping, AffiliateMappingStatus } from '../affiliateMapping/types';
import type { AffiliateNetworkId, CazaStoreId, DealIdentityStrategy } from '../types';

export interface CazaAffiliateMappingRow {
  id: string;
  identity_key: string;
  identity_strategy: string;
  store: string;
  external_product_id: string | null;
  canonical_url: string;
  affiliate_url: string;
  network: string;
  tracking_label: string | null;
  status: string;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

function iso(value: string, field: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`caza.mapper.invalid_timestamp:${field}`);
  return new Date(ms).toISOString();
}

export function affiliateMappingToRow(mapping: AffiliateMapping): CazaAffiliateMappingRow {
  return {
    id: mapping.id,
    identity_key: mapping.identityKey,
    identity_strategy: mapping.identityStrategy,
    store: mapping.store,
    external_product_id: mapping.externalProductId,
    canonical_url: mapping.canonicalUrl,
    affiliate_url: mapping.affiliateUrl,
    network: mapping.network,
    tracking_label: mapping.trackingLabel,
    status: mapping.status,
    valid_from: mapping.validFrom,
    valid_until: mapping.validUntil,
    created_at: mapping.createdAt,
    updated_at: mapping.updatedAt,
  };
}

export function rowToAffiliateMapping(row: CazaAffiliateMappingRow): AffiliateMapping {
  if (!row || typeof row !== 'object') throw new Error('caza.mapper.mapping_row_missing');
  if (typeof row.identity_key !== 'string' || row.identity_key.length === 0) {
    throw new Error('caza.mapper.mapping_identity_key_missing');
  }
  return {
    id: row.id,
    identityKey: row.identity_key,
    identityStrategy: row.identity_strategy as DealIdentityStrategy,
    store: row.store as CazaStoreId,
    externalProductId: row.external_product_id ?? null,
    canonicalUrl: row.canonical_url,
    affiliateUrl: row.affiliate_url,
    network: row.network as AffiliateNetworkId,
    trackingLabel: row.tracking_label ?? null,
    status: row.status as AffiliateMappingStatus,
    validFrom: iso(row.valid_from, 'valid_from'),
    validUntil: row.valid_until ? iso(row.valid_until, 'valid_until') : null,
    createdAt: iso(row.created_at, 'created_at'),
    updatedAt: iso(row.updated_at, 'updated_at'),
  };
}
