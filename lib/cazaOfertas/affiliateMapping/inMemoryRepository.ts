/**
 * CazaOfertasss — FASE 4.1. Repositorio in-memory de mappings (tests / harness).
 * Misma semántica que Postgres: unique por identity_key, upsert atómico.
 */

import { AFFILIATE_MAPPING_LOOKUP_MAX_KEYS } from '../constants';
import { affiliateMappingMaterialFields } from './mapping';
import type {
  AffiliateMapping,
  AffiliateMappingRepository,
  AffiliateMappingUpsertOutcome,
} from './types';

export interface InMemoryAffiliateMappingRepository extends AffiliateMappingRepository {
  size(): number;
  clear(): void;
  /** Contadores para tests de concurrencia. */
  readonly stats: { lookups: number; upserts: number };
}

export function createInMemoryAffiliateMappingRepository(): InMemoryAffiliateMappingRepository {
  const byKey = new Map<string, AffiliateMapping>();
  const stats = { lookups: 0, upserts: 0 };

  return {
    stats,
    size: () => byKey.size,
    clear: () => byKey.clear(),
    async findByIdentityKey(identityKey) {
      stats.lookups += 1;
      return byKey.get(identityKey) ?? null;
    },
    async findByIdentityKeys(identityKeys) {
      stats.lookups += 1;
      if (identityKeys.length > AFFILIATE_MAPPING_LOOKUP_MAX_KEYS) {
        throw new Error('affiliate_mapping.lookup_keys_exceeded');
      }
      const out: AffiliateMapping[] = [];
      for (const key of identityKeys) {
        const found = byKey.get(key);
        if (found) out.push(found);
      }
      return out;
    },
    async upsert(mapping): Promise<AffiliateMappingUpsertOutcome> {
      stats.upserts += 1;
      const existing = byKey.get(mapping.identityKey);
      if (!existing) {
        byKey.set(mapping.identityKey, mapping);
        return { action: 'created', mapping };
      }
      if (affiliateMappingMaterialFields(existing, mapping).length === 0) {
        return { action: 'unchanged', mapping: existing };
      }
      const merged: AffiliateMapping = { ...mapping, createdAt: existing.createdAt };
      byKey.set(mapping.identityKey, merged);
      return { action: 'updated', mapping: merged };
    },
  };
}
