/**
 * CazaOfertasss — FASE 3.3. Publication performance (provider-neutral).
 *
 * Analytics only. UNKNOWN fields remain null. No revenue ranking when unknown.
 */

import type { AffiliateNetworkId, CazaCategoryId, CazaStoreId, IsoTimestamp, MoneyAmount } from '../types';

export interface PublicationPerformanceRecord {
  readonly publicationId: string;
  readonly candidateIdentityKey: string;
  readonly store: CazaStoreId;
  readonly category: CazaCategoryId | null;
  readonly affiliateNetwork: AffiliateNetworkId;
  readonly trackingLabel: string;
  readonly publishedAt: IsoTimestamp | null;
  readonly revision: number | null;
  readonly clicks: number | null;
  readonly orders: number | null;
  readonly approvedOrders: number | null;
  readonly commission: MoneyAmount | null;
  readonly currency: MoneyAmount['currency'] | null;
  /** true si hay actividad observable pero commission es null. */
  readonly revenueUnknown: boolean;
}

export interface PublicationPerformanceQuery {
  readonly limit: number;
  readonly window?: { fromInclusive: IsoTimestamp; toExclusive: IsoTimestamp };
}

export interface PublicationPerformancePort {
  listByClicks(query: PublicationPerformanceQuery): Promise<readonly PublicationPerformanceRecord[]>;
  listWithoutClicks(query: PublicationPerformanceQuery): Promise<readonly PublicationPerformanceRecord[]>;
  listActiveWithRevenueUnknown(
    query: PublicationPerformanceQuery
  ): Promise<readonly PublicationPerformanceRecord[]>;
  aggregateByStore(
    query: PublicationPerformanceQuery
  ): Promise<readonly { store: CazaStoreId; publications: number; clicks: number | null }[]>;
  aggregateByCategory(
    query: PublicationPerformanceQuery
  ): Promise<
    readonly { category: CazaCategoryId | null; publications: number; clicks: number | null }[]
  >;
}

function bound(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) throw new Error('caza.ops.perf.limit_invalid');
  return Math.min(Math.floor(limit), 200);
}

function inWindow(
  publishedAt: string | null,
  window?: PublicationPerformanceQuery['window']
): boolean {
  if (!window) return true;
  if (!publishedAt) return false;
  const t = Date.parse(publishedAt);
  return t >= Date.parse(window.fromInclusive) && t < Date.parse(window.toExclusive);
}

/**
 * Read-model in-memory sobre registros ya materializados.
 * No hace fetchAll del universo: opera sobre el slice pasado (bounded por caller).
 */
export function createInMemoryPublicationPerformance(
  records: readonly PublicationPerformanceRecord[]
): PublicationPerformancePort {
  return {
    async listByClicks(query) {
      const limit = bound(query.limit);
      return [...records]
        .filter((r) => inWindow(r.publishedAt, query.window))
        .filter((r) => r.clicks !== null && r.clicks > 0)
        .sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0) || a.publicationId.localeCompare(b.publicationId))
        .slice(0, limit);
    },
    async listWithoutClicks(query) {
      const limit = bound(query.limit);
      return [...records]
        .filter((r) => inWindow(r.publishedAt, query.window))
        .filter((r) => r.clicks === null || r.clicks === 0)
        // clicks === 0 solo si evidencia explícita de cero clicks; null = unknown
        .filter((r) => r.clicks === null || r.clicks === 0)
        .slice(0, limit);
    },
    async listActiveWithRevenueUnknown(query) {
      const limit = bound(query.limit);
      return [...records]
        .filter((r) => inWindow(r.publishedAt, query.window))
        .filter((r) => r.revenueUnknown)
        .filter((r) => r.clicks !== null && r.clicks > 0)
        .sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0))
        .slice(0, limit);
    },
    async aggregateByStore(query) {
      const limit = bound(query.limit);
      const map = new Map<CazaStoreId, { publications: number; clicksSum: number; hasClick: boolean }>();
      for (const r of records) {
        if (!inWindow(r.publishedAt, query.window)) continue;
        const cur = map.get(r.store) ?? { publications: 0, clicksSum: 0, hasClick: false };
        cur.publications += 1;
        if (r.clicks !== null) {
          cur.hasClick = true;
          cur.clicksSum += r.clicks;
        }
        map.set(r.store, cur);
      }
      return [...map.entries()]
        .map(([store, v]) => ({
          store,
          publications: v.publications,
          clicks: v.hasClick ? v.clicksSum : null,
        }))
        .sort((a, b) => b.publications - a.publications)
        .slice(0, limit);
    },
    async aggregateByCategory(query) {
      const limit = bound(query.limit);
      const map = new Map<
        string,
        { category: CazaCategoryId | null; publications: number; clicksSum: number; hasClick: boolean }
      >();
      for (const r of records) {
        if (!inWindow(r.publishedAt, query.window)) continue;
        const key = r.category ?? '__null__';
        const cur = map.get(key) ?? {
          category: r.category,
          publications: 0,
          clicksSum: 0,
          hasClick: false,
        };
        cur.publications += 1;
        if (r.clicks !== null) {
          cur.hasClick = true;
          cur.clicksSum += r.clicks;
        }
        map.set(key, cur);
      }
      return [...map.values()]
        .map((v) => ({
          category: v.category,
          publications: v.publications,
          clicks: v.hasClick ? v.clicksSum : null,
        }))
        .sort((a, b) => b.publications - a.publications)
        .slice(0, limit);
    },
  };
}

/** Prohíbe ranking por commission cuando commission es null. */
export function assertNoRevenueRankingWhenUnknown(
  records: readonly PublicationPerformanceRecord[]
): void {
  for (const r of records) {
    if (r.revenueUnknown && r.commission !== null) {
      throw new Error('caza.ops.perf.revenue_unknown_with_commission');
    }
  }
}
