/**
 * CazaOfertasss — FASE 4. Port de discovery provider-neutral.
 *
 * Una fuente OBSERVA y devuelve drafts crudos paginados. No valida, no puntúa,
 * no decide identidad. No existe `fetchAll`/`listAll`: `limit` es obligatorio.
 *
 * No hay scraping ni endpoints no documentados. Los adapters de tienda
 * actuales (Amazon MX, Mercado Libre MX) siguen fail-closed: al puentearlos
 * aquí devuelven `CAPABILITY_UNSUPPORTED`, nunca datos inventados.
 */

import { ADAPTER_NOT_IMPLEMENTED_REASON, type DealStoreAdapter } from '../stores/adapter';
import type { CazaResult, CazaStoreId, DealCandidateDraft, IsoTimestamp } from '../types';
import { failResult, okResult } from '../types';
import type { CazaClock } from './types';

/** Reason code canónico cuando la fuente no tiene capacidad oficial de discovery. */
export const DISCOVERY_CAPABILITY_UNSUPPORTED = 'CAPABILITY_UNSUPPORTED' as const;

export interface DealDiscoveryQuery {
  /** Límite duro de ítems para esta página. */
  readonly limit: number;
  readonly cursor?: string | null;
  /** Sólo ofertas observadas desde este instante (si la fuente lo soporta). */
  readonly since?: IsoTimestamp | null;
}

export interface DealDiscoveryPage {
  readonly items: readonly DealCandidateDraft[];
  readonly nextCursor: string | null;
  readonly source: string;
  readonly observedAt: IsoTimestamp;
}

export interface DealDiscoverySource {
  /** Identidad estable de la fuente, p.ej. `store:amazon_mx`. Sin secretos. */
  readonly sourceId: string;
  readonly store: CazaStoreId;
  discover(query: DealDiscoveryQuery): Promise<CazaResult<DealDiscoveryPage>>;
}

export function isCapabilityUnsupportedResult(result: CazaResult<unknown>): boolean {
  return !result.ok && result.reasons.includes(DISCOVERY_CAPABILITY_UNSUPPORTED);
}

function boundedLimit(limit: unknown, max: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) return 1;
  return Math.min(Math.floor(limit), max);
}

/**
 * Puente `DealStoreAdapter.discover` → `DealDiscoverySource`.
 *
 * Si el adapter declara la capacidad como no soportada, la fuente responde
 * `CAPABILITY_UNSUPPORTED` + el reason original del adapter. No hay fallback.
 */
export function createStoreAdapterDiscoverySource(
  adapter: DealStoreAdapter,
  options: { readonly clock?: CazaClock; readonly maxPageSize?: number } = {}
): DealDiscoverySource {
  const clock = options.clock ?? (() => new Date());
  const maxPageSize = options.maxPageSize ?? 50;
  const sourceId = `store:${adapter.store}`;

  return {
    sourceId,
    store: adapter.store,
    async discover(query) {
      if (adapter.capabilities.discover !== 'supported') {
        return failResult([
          DISCOVERY_CAPABILITY_UNSUPPORTED,
          `${ADAPTER_NOT_IMPLEMENTED_REASON}:${adapter.store}.discover:${adapter.capabilities.discover}`,
        ]);
      }
      const page = await adapter.discover({
        limit: boundedLimit(query.limit, maxPageSize),
        cursor: query.cursor ?? null,
      });
      if (!page.ok) {
        const unsupported = page.reasons.some((r) => r.startsWith(ADAPTER_NOT_IMPLEMENTED_REASON));
        return failResult(
          unsupported ? [DISCOVERY_CAPABILITY_UNSUPPORTED, ...page.reasons] : page.reasons
        );
      }
      return okResult({
        items: page.value.drafts.slice(0, boundedLimit(query.limit, maxPageSize)),
        nextCursor: page.value.nextCursor,
        source: sourceId,
        observedAt: clock().toISOString(),
      });
    },
  };
}

export interface StaticDiscoverySourceOptions {
  readonly sourceId: string;
  readonly store: CazaStoreId;
  readonly items: readonly DealCandidateDraft[];
  readonly clock?: CazaClock;
}

/**
 * Fuente estática paginada por cursor numérico. Existe para tests, fixtures y
 * carga operada (p.ej. import manual). No hace red. Respeta `limit` siempre.
 */
export function createStaticDiscoverySource(
  options: StaticDiscoverySourceOptions
): DealDiscoverySource {
  const clock = options.clock ?? (() => new Date());
  const items = options.items;

  return {
    sourceId: options.sourceId,
    store: options.store,
    async discover(query) {
      const limit = boundedLimit(query.limit, 200);
      const start = parseCursor(query.cursor);
      if (start === null) return failResult(['discovery.cursor_invalid']);
      const slice = items.slice(start, start + limit);
      const end = start + slice.length;
      return okResult({
        items: slice,
        nextCursor: end < items.length ? String(end) : null,
        source: options.sourceId,
        observedAt: clock().toISOString(),
      });
    },
  };
}

function parseCursor(cursor: string | null | undefined): number | null {
  if (cursor === null || cursor === undefined || cursor === '') return 0;
  if (!/^\d{1,9}$/.test(cursor)) return null;
  return Number(cursor);
}
