/**
 * In-memory Supabase-shaped store for Distribution E2E harness.
 * Supports the query shapes used by eligibility/enqueue/claim/drain/reclaim/ops.
 */

export type E2EOfferRow = {
  id: string;
  status: string;
  title: string;
  store: string | null;
  price: number | null;
  original_price: number | null;
  image_url: string | null;
  expires_at: string | null;
  category: string | null;
  coupons: string | null;
  bank_coupon: string | null;
  created_by: string | null;
};

export type E2EDestinationRow = {
  id: string;
  brand_id: string;
  provider: string;
  slug: string;
  display_name: string;
  external_destination_key: string;
  credential_ref: string | null;
  status: string;
  kind: string;
  category_ids: string[];
  tracking_campaign_key: string | null;
};

export type E2EPublicationRow = {
  id: string;
  offer_id: string;
  destination_id: string;
  distribution_version: number;
  idempotency_key: string;
  status: string;
  provider: string;
  external_message_id: string | null;
  external_destination_key: string | null;
  tracking_campaign_key: string | null;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type E2EEventRow = {
  id: string;
  publication_id: string;
  event_type: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type DistributionE2EStore = {
  offers: E2EOfferRow[];
  destinations: E2EDestinationRow[];
  publications: E2EPublicationRow[];
  events: E2EEventRow[];
  /** Tables touched during a run — boundary audit. */
  touchedTables: Set<string>;
  providerInvocations: number;
};

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}-${Date.now().toString(16)}`;
}

type Filter =
  | { kind: 'eq'; col: string; val: unknown }
  | { kind: 'in'; col: string; vals: unknown[] }
  | { kind: 'lte'; col: string; val: unknown }
  | { kind: 'gte'; col: string; val: unknown }
  | { kind: 'or'; expr: string };

function matchRow(row: Record<string, unknown>, filters: Filter[]): boolean {
  for (const f of filters) {
    if (f.kind === 'eq') {
      if (row[f.col] !== f.val) return false;
    } else if (f.kind === 'in') {
      if (!f.vals.includes(row[f.col])) return false;
    } else if (f.kind === 'lte') {
      const a = row[f.col];
      if (a == null) return false;
      if (String(a) > String(f.val)) return false;
    } else if (f.kind === 'gte') {
      const a = row[f.col];
      if (a == null) return false;
      if (String(a) < String(f.val)) return false;
    } else if (f.kind === 'or') {
      // next_attempt_at.is.null,next_attempt_at.lte.<iso>
      const parts = f.expr.split(',');
      let ok = false;
      for (const part of parts) {
        const p = part.trim();
        if (p.endsWith('.is.null')) {
          const col = p.replace(/\.is\.null$/, '');
          if (row[col] == null) ok = true;
        } else if (p.includes('.lte.')) {
          const [col, val] = p.split('.lte.');
          if (row[col!] != null && String(row[col!]) <= String(val)) ok = true;
        }
      }
      if (!ok) return false;
    }
  }
  return true;
}

function getTable(store: DistributionE2EStore, table: string): Record<string, unknown>[] {
  store.touchedTables.add(table);
  switch (table) {
    case 'offers':
      return store.offers as unknown as Record<string, unknown>[];
    case 'distribution_destinations':
      return store.destinations as unknown as Record<string, unknown>[];
    case 'distribution_publications':
      return store.publications as unknown as Record<string, unknown>[];
    case 'distribution_events':
      return store.events as unknown as Record<string, unknown>[];
    default:
      throw new Error(`[e2e-store] unexpected table: ${table}`);
  }
}

export function createEmptyE2EStore(): DistributionE2EStore {
  return {
    offers: [],
    destinations: [],
    publications: [],
    events: [],
    touchedTables: new Set(),
    providerInvocations: 0,
  };
}

/**
 * Minimal thenable query builder compatible with Distribution domain calls.
 */
export function createE2ESupabaseClient(store: DistributionE2EStore) {
  function from(table: string) {
    const filters: Filter[] = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;
    let mode: 'select' | 'insert' | 'update' = 'select';

    const api: Record<string, unknown> = {};

    const runSelect = (): Record<string, unknown>[] => {
      let rows = getTable(store, table).filter((r) => matchRow(r, filters));
      if (orderCol) {
        const col = orderCol;
        rows = [...rows].sort((a, b) => {
          const av = String(a[col] ?? '');
          const bv = String(b[col] ?? '');
          return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows.map((r) => ({ ...r }));
    };

    const finish = async (asSingle: boolean) => {
      if (mode === 'insert' && pendingInsert) {
        if (table === 'distribution_publications') {
          const key = String(pendingInsert.idempotency_key ?? '');
          const exists = store.publications.find((p) => p.idempotency_key === key);
          if (exists) {
            return {
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            };
          }
          const now = new Date().toISOString();
          const row: E2EPublicationRow = {
            id: String(pendingInsert.id ?? uid('pub')),
            offer_id: String(pendingInsert.offer_id),
            destination_id: String(pendingInsert.destination_id),
            distribution_version: Number(pendingInsert.distribution_version ?? 1),
            idempotency_key: key,
            status: String(pendingInsert.status ?? 'pending'),
            provider: String(pendingInsert.provider ?? 'telegram'),
            external_message_id: (pendingInsert.external_message_id as string | null) ?? null,
            external_destination_key:
              (pendingInsert.external_destination_key as string | null) ?? null,
            tracking_campaign_key:
              (pendingInsert.tracking_campaign_key as string | null) ?? null,
            attempt_count: Number(pendingInsert.attempt_count ?? 0),
            next_attempt_at: (pendingInsert.next_attempt_at as string | null) ?? now,
            last_error_code: (pendingInsert.last_error_code as string | null) ?? null,
            last_error_message: (pendingInsert.last_error_message as string | null) ?? null,
            created_at: now,
            updated_at: now,
            published_at: (pendingInsert.published_at as string | null) ?? null,
          };
          store.publications.push(row);
          store.touchedTables.add(table);
          return { data: asSingle ? { ...row } : [{ ...row }], error: null };
        }
        if (table === 'distribution_events') {
          const row: E2EEventRow = {
            id: uid('evt'),
            publication_id: String(pendingInsert.publication_id),
            event_type: String(pendingInsert.event_type),
            meta: (pendingInsert.meta as Record<string, unknown>) ?? {},
            created_at: new Date().toISOString(),
          };
          store.events.push(row);
          store.touchedTables.add(table);
          return { data: asSingle ? { ...row } : [{ ...row }], error: null };
        }
        if (table === 'offers') {
          const row = pendingInsert as unknown as E2EOfferRow;
          store.offers.push(row);
          store.touchedTables.add(table);
          return { data: asSingle ? { ...row } : [{ ...row }], error: null };
        }
      }

      if (mode === 'update' && pendingUpdate) {
        const rows = getTable(store, table);
        const matched = rows.filter((r) => matchRow(r, filters));
        if (matched.length === 0) {
          return { data: null, error: null };
        }
        const target = matched[0]!;
        Object.assign(target, pendingUpdate);
        store.touchedTables.add(table);
        return { data: asSingle ? { ...target } : matched.map((r) => ({ ...r })), error: null };
      }

      const rows = runSelect();
      if (asSingle) {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    };

    api.select = () => api;
    api.insert = (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      mode = 'insert';
      pendingInsert = Array.isArray(payload) ? payload[0]! : payload;
      return api;
    };
    api.update = (payload: Record<string, unknown>) => {
      mode = 'update';
      pendingUpdate = payload;
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      filters.push({ kind: 'eq', col, val });
      return api;
    };
    api.in = (col: string, vals: unknown[]) => {
      filters.push({ kind: 'in', col, vals });
      return api;
    };
    api.lte = (col: string, val: unknown) => {
      filters.push({ kind: 'lte', col, val });
      return api;
    };
    api.gte = (col: string, val: unknown) => {
      filters.push({ kind: 'gte', col, val });
      return api;
    };
    api.or = (expr: string) => {
      filters.push({ kind: 'or', expr });
      return api;
    };
    api.order = (col: string, opts?: { ascending?: boolean }) => {
      orderCol = col;
      orderAsc = opts?.ascending !== false;
      return api;
    };
    api.limit = (n: number) => {
      limitN = n;
      // select chains often await limit() directly
      if (mode === 'select' && !pendingInsert && !pendingUpdate) {
        return finish(false);
      }
      return api;
    };
    api.maybeSingle = () => finish(true);
    api.single = () => finish(true);
    // allow await on builder after insert().select()
    api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      finish(false).then(resolve, reject);

    return api;
  }

  return { from };
}

export function seedDefaultDestination(store: DistributionE2EStore, destId: string): void {
  store.destinations.push({
    id: destId,
    brand_id: 'brand-e2e',
    provider: 'telegram',
    slug: 'e2e-staging-general',
    display_name: 'E2E Staging',
    external_destination_key: '-100999',
    credential_ref: 'TELEGRAM_BOT_TOKEN_STAGING',
    status: 'active',
    kind: 'general',
    category_ids: [],
    tracking_campaign_key: 'e2e-staging',
  });
}

export { uid };
