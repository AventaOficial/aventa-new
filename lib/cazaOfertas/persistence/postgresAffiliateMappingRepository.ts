/**
 * CazaOfertasss — FASE 4.1. PostgresAffiliateMappingRepository.
 *
 * Implementa `AffiliateMappingRepository` sobre `caza_affiliate_mappings`.
 *   - Lookup puntual por identity_key (IN acotado). Nunca scan.
 *   - Upsert por unique(identity_key): el motor resuelve la concurrencia.
 * Server-only (service_role). El dominio no conoce SQL.
 */

import { affiliateMappingMaterialFields } from '../affiliateMapping/mapping';
import type {
  AffiliateMapping,
  AffiliateMappingRepository,
  AffiliateMappingUpsertOutcome,
} from '../affiliateMapping/types';
import { AFFILIATE_MAPPING_LOOKUP_MAX_KEYS } from '../constants';
import {
  affiliateMappingToRow,
  rowToAffiliateMapping,
  type CazaAffiliateMappingRow,
} from './affiliateMappingMappers';
import type { CazaSupabaseClient } from './supabaseClient';
import { CAZA_AFFILIATE_MAPPINGS_TABLE } from './tables';

function assertIdentityKey(identityKey: string): void {
  if (typeof identityKey !== 'string' || identityKey.trim().length === 0) {
    throw new Error('caza.repo.identity_key_invalid');
  }
}

export function createPostgresAffiliateMappingRepository(
  client: CazaSupabaseClient
): AffiliateMappingRepository {
  async function findByIdentityKey(identityKey: string): Promise<AffiliateMapping | null> {
    assertIdentityKey(identityKey);
    const { data, error } = await client
      .from(CAZA_AFFILIATE_MAPPINGS_TABLE)
      .select('*')
      .eq('identity_key', identityKey)
      .maybeSingle();
    if (error) throw new Error(`caza.repo.mapping_find_failed:${error.message}`);
    if (!data) return null;
    return rowToAffiliateMapping(data as CazaAffiliateMappingRow);
  }

  return {
    findByIdentityKey,

    async findByIdentityKeys(identityKeys) {
      if (identityKeys.length === 0) return [];
      if (identityKeys.length > AFFILIATE_MAPPING_LOOKUP_MAX_KEYS) {
        throw new Error('caza.repo.mapping_lookup_keys_exceeded');
      }
      for (const key of identityKeys) assertIdentityKey(key);
      const { data, error } = await client
        .from(CAZA_AFFILIATE_MAPPINGS_TABLE)
        .select('*')
        .in('identity_key', identityKeys)
        .order('identity_key', { ascending: true })
        .limit(AFFILIATE_MAPPING_LOOKUP_MAX_KEYS);
      if (error) throw new Error(`caza.repo.mapping_lookup_failed:${error.message}`);
      const rows = Array.isArray(data) ? (data as CazaAffiliateMappingRow[]) : [];
      return rows.map(rowToAffiliateMapping);
    },

    async upsert(mapping): Promise<AffiliateMappingUpsertOutcome> {
      if (!mapping?.identityKey) throw new Error('caza.repo.malformed_mapping');
      const existing = await findByIdentityKey(mapping.identityKey);
      if (existing && affiliateMappingMaterialFields(existing, mapping).length === 0) {
        return { action: 'unchanged', mapping: existing };
      }
      const row = affiliateMappingToRow({
        ...mapping,
        createdAt: existing?.createdAt ?? mapping.createdAt,
      });
      const { error } = await client
        .from(CAZA_AFFILIATE_MAPPINGS_TABLE)
        .upsert({ ...row }, { onConflict: 'identity_key' });
      if (error) throw new Error(`caza.repo.mapping_upsert_failed:${error.message}`);
      const stored = await findByIdentityKey(mapping.identityKey);
      if (!stored) throw new Error('caza.repo.mapping_upsert_not_visible');
      return { action: existing ? 'updated' : 'created', mapping: stored };
    },
  };
}
