import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/**
 * Supabase en memoria para los caminos de decisión: eq/in/not, update condicional,
 * insert, select/maybeSingle. Cada consulta cede el turno para que las decisiones
 * concurrentes se intercalen como en producción.
 */
export function createFakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));

  function from(table: string) {
    tables[table] ??= [];
    const filters: Filter[] = [];
    let patch: Row | null = null;
    let insertRows: Row[] | null = null;
    let single = false;
    let limitN: number | null = null;

    const run = async () => {
      await Promise.resolve();
      const rows = tables[table];
      if (insertRows) {
        rows.push(...insertRows.map((r) => ({ ...r })));
        return { data: insertRows, error: null };
      }
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (patch) {
        for (const r of matched) Object.assign(r, patch);
      }
      if (limitN != null) matched = matched.slice(0, limitN);
      const data = matched.map((r) => ({ ...r }));
      if (single) return { data: data[0] ?? null, error: null };
      return { data, error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, value: unknown) => {
        filters.push((r) => r[col] === value);
        return builder;
      },
      in: (col: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[col]));
        return builder;
      },
      not: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: (n: number) => {
        limitN = n;
        return builder;
      },
      update: (p: Row) => {
        patch = p;
        return builder;
      },
      insert: (r: Row | Row[]) => {
        insertRows = Array.isArray(r) ? r : [r];
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return run();
      },
      single: () => {
        single = true;
        return run();
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return builder;
  }

  return { supabase: { from } as unknown as SupabaseClient, tables };
}

export const BATCH_ID = '22222222-2222-4222-8222-222222222222';
export const COMMUNITY_BATCH_ID = '33333333-3333-4333-8333-333333333333';
export const MACHINE_CLIENT_ID = '44444444-4444-4444-8444-444444444444';
export const BOT_AUTHOR_ID = '55555555-5555-4555-8555-555555555555';
export const MODERATOR_ID = '66666666-6666-4666-8666-666666666666';

export function itemRow(id: string, over: Row = {}): Row {
  return {
    id,
    batch_id: BATCH_ID,
    status: 'NEEDS_REVIEW',
    identity_key: `amz:${id.slice(0, 8)}`,
    source_url: `https://www.amazon.com.mx/dp/${id.slice(0, 8)}`,
    canonical_url: null,
    normalized_url: null,
    retailer: 'amazon',
    store: 'Amazon',
    title: 'Detergente líquido 5 L',
    hint_title: null,
    price: 189,
    hint_price: 150,
    original_price: null,
    hint_original_price: 400,
    discount_percent: null,
    category: 'Limpieza',
    hint_note: null,
    duplicate_status: 'none',
    duplicate_offer_id: null,
    offer_id: null,
    images: ['https://m.media-amazon.com/images/I/x.jpg'],
    warnings: [],
    evidence: {},
    error_code: null,
    rejection_reason: null,
    attempts: 0,
    position: 0,
    ...over,
  };
}

export function seedTables(items: Row[]) {
  return {
    offer_batches: [
      { id: BATCH_ID, machine_client_id: MACHINE_CLIENT_ID, status: 'READY', meta: {} },
      { id: COMMUNITY_BATCH_ID, machine_client_id: null, status: 'READY', meta: {} },
    ],
    machine_clients: [{ id: MACHINE_CLIENT_ID, author_profile_id: BOT_AUTHOR_ID }],
    offer_batch_items: items,
    offer_batch_item_events: [],
  };
}
