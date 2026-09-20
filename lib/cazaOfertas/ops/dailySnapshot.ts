/**
 * CazaOfertasss — FASE 3.3. Daily business snapshot (analytics read-model).
 *
 * NO es financial authority. UNKNOWN → null, nunca 0 inventado.
 */

import type { CazaCategoryId, CazaCurrency, CazaStoreId, IsoTimestamp, MoneyAmount } from '../types';
import type { CazaBusinessEvent, CazaBusinessEventStorePort } from './businessEvents';

export interface CazaTopBucket<T extends string | null> {
  readonly key: T;
  readonly count: number;
}

export interface CazaDailySnapshot {
  readonly date: string; // YYYY-MM-DD UTC
  readonly dealsDiscovered: number | null;
  readonly dealsValidated: number | null;
  readonly dealsRejected: number | null;
  readonly dealsPublished: number | null;
  readonly telegramPublished: number | null;
  readonly clicks: number | null;
  readonly knownAttributions: number | null;
  readonly unknownAttributions: number | null;
  readonly pendingOrders: number | null;
  readonly approvedOrders: number | null;
  readonly cancelledOrders: number | null;
  /** Solo si hay evidencia COMMISSION en ops events — no inventa montos. */
  readonly commission: MoneyAmount | null;
  readonly currency: CazaCurrency | null;
  readonly activePublications: number | null;
  readonly topStores: readonly CazaTopBucket<CazaStoreId>[];
  readonly topCategories: readonly CazaTopBucket<CazaCategoryId | null>[];
  readonly computedAt: IsoTimestamp;
  readonly schemaVersion: 'caza.ops.daily.v1';
}

export interface BuildDailySnapshotInput {
  readonly date: string;
  readonly events: readonly CazaBusinessEvent[];
  readonly activePublications: number | null;
  readonly topStores?: readonly CazaTopBucket<CazaStoreId>[];
  readonly topCategories?: readonly CazaTopBucket<CazaCategoryId | null>[];
  readonly commission?: MoneyAmount | null;
  readonly computedAt: IsoTimestamp;
}

function countType(events: readonly CazaBusinessEvent[], type: CazaBusinessEvent['eventType']): number | null {
  let n = 0;
  let seen = false;
  for (const e of events) {
    if (e.eventType === type) {
      seen = true;
      n += 1;
    }
  }
  return seen ? n : null;
}

export function buildDailySnapshot(input: BuildDailySnapshotInput): CazaDailySnapshot {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error('caza.ops.daily.date_invalid');
  }
  const e = input.events;
  const commission = input.commission ?? null;

  return {
    date: input.date,
    dealsDiscovered: countType(e, 'DEAL_DISCOVERED'),
    dealsValidated: countType(e, 'DEAL_VALIDATED'),
    dealsRejected: countType(e, 'DEAL_REJECTED'),
    dealsPublished: countType(e, 'DEAL_PUBLISHED'),
    telegramPublished: countType(e, 'DEAL_PUBLISHED'),
    clicks: countType(e, 'CLICK'),
    knownAttributions: countType(e, 'ATTRIBUTION_KNOWN'),
    unknownAttributions: countType(e, 'ATTRIBUTION_UNKNOWN'),
    pendingOrders: countType(e, 'ORDER_PENDING'),
    approvedOrders: countType(e, 'ORDER_APPROVED'),
    cancelledOrders: countType(e, 'ORDER_CANCELLED'),
    commission,
    currency: commission?.currency ?? null,
    activePublications: input.activePublications,
    topStores: input.topStores ?? [],
    topCategories: input.topCategories ?? [],
    computedAt: input.computedAt,
    schemaVersion: 'caza.ops.daily.v1',
  };
}

/** Carga acotada de eventos del día UTC desde el store (limit obligatorio). */
export async function loadDailyBusinessEvents(
  store: CazaBusinessEventStorePort,
  date: string,
  limit: number
): Promise<readonly CazaBusinessEvent[]> {
  const fromInclusive = `${date}T00:00:00.000Z`;
  const next = new Date(Date.parse(fromInclusive) + 24 * 60 * 60 * 1000).toISOString();
  return store.listByWindow({
    fromInclusive,
    toExclusive: next,
    limit,
  });
}
