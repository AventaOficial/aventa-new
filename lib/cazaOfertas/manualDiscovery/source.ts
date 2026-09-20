/**
 * CazaOfertasss — FASE 4.1. ManualDealDiscoverySource.
 *
 * Implementa `DealDiscoverySource` sobre un import manual ya preparado. El
 * runner no distingue esta fuente de cualquier otra: observa drafts paginados
 * con `limit` obligatorio. Un import con varias tiendas produce una fuente
 * por tienda (el port exige `store`).
 */

import type { DealDiscoverySource } from '../orchestration/discoverySource';
import { createStaticDiscoverySource } from '../orchestration/discoverySource';
import type { CazaClock } from '../orchestration/types';
import type { CazaStoreId, DealCandidateDraft } from '../types';
import type { PreparedManualDealImport } from './import';

export interface ManualDealDiscoverySource extends DealDiscoverySource {
  readonly importId: string;
  readonly itemCount: number;
}

export interface ManualDealDiscoverySourceOptions {
  readonly clock?: CazaClock;
}

export function manualDiscoverySourceId(importId: string, store: CazaStoreId): string {
  return `manual:${importId}:${store}`;
}

/** Una fuente por tienda presente en el import. Orden estable por tienda. */
export function createManualDealDiscoverySources(
  prepared: PreparedManualDealImport,
  options: ManualDealDiscoverySourceOptions = {}
): readonly ManualDealDiscoverySource[] {
  const byStore = new Map<CazaStoreId, DealCandidateDraft[]>();
  for (const entry of prepared.drafts) {
    const bucket = byStore.get(entry.store) ?? [];
    bucket.push(entry.draft);
    byStore.set(entry.store, bucket);
  }
  const stores = [...byStore.keys()].sort();
  return stores.map((store) => {
    const items = byStore.get(store) ?? [];
    const inner = createStaticDiscoverySource({
      sourceId: manualDiscoverySourceId(prepared.report.importId, store),
      store,
      items,
      clock: options.clock,
    });
    return {
      ...inner,
      importId: prepared.report.importId,
      itemCount: items.length,
    };
  });
}

/** Conveniencia: import de una sola tienda. Falla si hay más de una. */
export function createManualDealDiscoverySource(
  prepared: PreparedManualDealImport,
  options: ManualDealDiscoverySourceOptions = {}
): ManualDealDiscoverySource {
  const sources = createManualDealDiscoverySources(prepared, options);
  if (sources.length > 1) {
    throw new Error(`manual_import.multiple_stores:${sources.map((s) => s.store).join('|')}`);
  }
  if (sources.length === 0) {
    const store = prepared.drafts[0]?.store ?? 'amazon_mx';
    return {
      ...createStaticDiscoverySource({
        sourceId: manualDiscoverySourceId(prepared.report.importId, store),
        store,
        items: [],
        clock: options.clock,
      }),
      importId: prepared.report.importId,
      itemCount: 0,
    };
  }
  return sources[0];
}
