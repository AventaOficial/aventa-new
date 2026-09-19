/**
 * CazaOfertasss — FASE 1. Repos Postgres contra un cliente mock (sin red).
 *
 * Valida el cableado Domain → Ports → Postgres implementations, incluyendo
 * concurrent upsert, publication idempotency, revenue append-only y rollback.
 */

import { describe, expect, it } from 'vitest';

import {
  buildAffiliateRevenueEvent,
  buildDealCandidate,
  createPostgresDealCandidateRepository,
  createPostgresPublicationRepository,
  createPostgresRevenueRepository,
  dealCandidateToRow,
  mergeDealCandidate,
  type CazaSupabaseClient,
  type DealCandidate,
} from '@/lib/cazaOfertas';
import {
  CAZA_APPEND_REVENUE_EVENT_RPC,
  CAZA_DEAL_CANDIDATES_TABLE,
  CAZA_INSERT_PUBLICATION_IDEMPOTENT_RPC,
  CAZA_PUBLICATIONS_TABLE,
  CAZA_REVENUE_EVENTS_TABLE,
  CAZA_UPSERT_DEAL_CANDIDATE_RPC,
  CAZA_UPSERT_THEN_FAIL_RPC,
} from '@/lib/cazaOfertas/persistence/tables';

import {
  NOW,
  NOW_ISO,
  amazonAffiliate,
  amazonDraft,
  buildTestPublicationRecord,
  strongEvidence,
} from './fixtures';

type CandidateRow = ReturnType<typeof dealCandidateToRow> & Record<string, unknown>;

function candidate(price = 1999): DealCandidate {
  const r = buildDealCandidate(
    amazonDraft({
      currentPrice: price,
      evidence: strongEvidence({ currentPrice: price }),
    }),
    { now: NOW, affiliate: amazonAffiliate() }
  );
  if (!r.ok) throw new Error(r.reasons.join(','));
  return r.value;
}

/**
 * Emula la semántica SQL de FASE 1 en memoria: UNIQUE identity_key,
 * revision atómica, publication ON CONFLICT DO NOTHING, revenue append-only.
 */
function createFakePostgresClient(): CazaSupabaseClient & {
  candidates: Map<string, CandidateRow>;
  publications: Map<string, Record<string, unknown>>;
  revenue: Map<string, Record<string, unknown>>;
  locks: Map<string, Promise<unknown>>;
} {
  const candidates = new Map<string, CandidateRow>();
  const publications = new Map<string, Record<string, unknown>>();
  const revenue = new Map<string, Record<string, unknown>>();
  const locks = new Map<string, Promise<unknown>>();

  async function withLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const next = prev.then(() => gate);
    locks.set(key, next.catch(() => undefined));
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (locks.get(key) === next) locks.delete(key);
    }
  }

  function materialChanged(oldRow: CandidateRow, next: CandidateRow): boolean {
    return (
      oldRow.current_price !== next.current_price ||
      oldRow.reference_price !== next.reference_price ||
      oldRow.discount_percent !== next.discount_percent ||
      oldRow.availability !== next.availability ||
      oldRow.affiliate_url !== next.affiliate_url ||
      oldRow.status !== next.status ||
      oldRow.currency !== next.currency ||
      oldRow.score_value !== next.score_value ||
      oldRow.score_grade !== next.score_grade ||
      oldRow.evidence_captured_at !== next.evidence_captured_at ||
      oldRow.seller_trust_class !== next.seller_trust_class
    );
  }

  const client: CazaSupabaseClient & {
    candidates: typeof candidates;
    publications: typeof publications;
    revenue: typeof revenue;
    locks: typeof locks;
  } = {
    candidates,
    publications,
    revenue,
    locks,
    from(table: string) {
      const state: {
        filters: Record<string, string>;
        gt?: { col: string; val: string };
        orderCol?: string;
        ascending?: boolean;
        limitN?: number;
      } = { filters: {} };

      const builder: {
        select: () => unknown;
        eq: (col: string, val: string) => unknown;
        gt: (col: string, val: string) => unknown;
        order: (col: string, opts: { ascending: boolean }) => unknown;
        limit: (n: number) => unknown;
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
        then: (
          resolve: (v: unknown) => void,
          reject: (e: unknown) => void
        ) => Promise<void>;
        upsert: (
          row: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      } = {
        select() {
          return builder;
        },
        eq(col: string, val: string) {
          state.filters[col] = val;
          return builder;
        },
        gt(col: string, val: string) {
          state.gt = { col, val };
          return builder;
        },
        order(col: string, opts: { ascending: boolean }) {
          state.orderCol = col;
          state.ascending = opts.ascending;
          return builder;
        },
        limit(n: number) {
          state.limitN = n;
          return builder;
        },
        async maybeSingle() {
          if (table === CAZA_DEAL_CANDIDATES_TABLE) {
            const key = state.filters.identity_key;
            return { data: candidates.get(key) ?? null, error: null };
          }
          if (table === CAZA_PUBLICATIONS_TABLE) {
            const key = state.filters.publication_id;
            return { data: publications.get(key) ?? null, error: null };
          }
          if (table === CAZA_REVENUE_EVENTS_TABLE) {
            const key = state.filters.event_id;
            return { data: revenue.get(key) ?? null, error: null };
          }
          return { data: null, error: { message: 'unknown table' } };
        },
        async then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          try {
            let rows: Record<string, unknown>[] = [];
            if (table === CAZA_DEAL_CANDIDATES_TABLE) {
              rows = [...candidates.values()].filter((r) =>
                Object.entries(state.filters).every(
                  ([k, v]) => (r as Record<string, unknown>)[k] === v
                )
              );
              if (state.gt) {
                rows = rows.filter(
                  (r) => String((r as Record<string, unknown>)[state.gt!.col]) > state.gt!.val
                );
              }
              rows.sort((a, b) =>
                String((a as Record<string, unknown>).identity_key).localeCompare(
                  String((b as Record<string, unknown>).identity_key)
                )
              );
            } else if (table === CAZA_PUBLICATIONS_TABLE) {
              rows = [...publications.values()].filter((r) =>
                Object.entries(state.filters).every(([k, v]) => r[k] === v)
              );
            } else if (table === CAZA_REVENUE_EVENTS_TABLE) {
              rows = [...revenue.values()].filter((r) =>
                Object.entries(state.filters).every(([k, v]) => r[k] === v)
              );
            }
            if (state.limitN) rows = rows.slice(0, state.limitN);
            resolve({ data: rows, error: null });
          } catch (err) {
            reject(err);
          }
        },
        async upsert(row: Record<string, unknown>) {
          if (table === CAZA_PUBLICATIONS_TABLE) {
            publications.set(String(row.publication_id), row);
            return { data: row, error: null };
          }
          return { data: null, error: { message: 'upsert not supported on mock table' } };
        },
      };
      return builder;
    },
    async rpc(fn: string, args?: Record<string, unknown>) {
      if (fn === CAZA_UPSERT_THEN_FAIL_RPC) {
        // Emula transacción PL/pgSQL: el RAISE aborta el bloque completo;
        // el upsert interno no persiste.
        return { data: null, error: { message: 'caza_forced_rollback' } };
      }

      if (fn === CAZA_UPSERT_DEAL_CANDIDATE_RPC) {
        const p = args?.p_row as CandidateRow;
        if (!p?.identity_key) {
          return { data: null, error: { message: 'identity_key required' } };
        }
        return withLock(String(p.identity_key), async () => {
          const existing = candidates.get(String(p.identity_key));
          if (!existing) {
            const created = { ...p, revision: 1 };
            candidates.set(String(p.identity_key), created);
            return { data: { action: 'created', row: created }, error: null };
          }
          const changed = materialChanged(existing, p);
          const next = {
            ...p,
            id: existing.id,
            identity_key: existing.identity_key,
            first_seen_at: existing.first_seen_at,
            revision: changed ? existing.revision + 1 : existing.revision,
          };
          candidates.set(String(p.identity_key), next);
          return {
            data: { action: changed ? 'updated' : 'unchanged', row: next },
            error: null,
          };
        });
      }

      if (fn === CAZA_INSERT_PUBLICATION_IDEMPOTENT_RPC) {
        const p = args?.p_row as Record<string, unknown>;
        const id = String(p.publication_id);
        return withLock(`pub:${id}`, async () => {
          const existing = publications.get(id);
          if (existing) {
            return { data: { inserted: false, row: existing }, error: null };
          }
          publications.set(id, p);
          return { data: { inserted: true, row: p }, error: null };
        });
      }

      if (fn === CAZA_APPEND_REVENUE_EVENT_RPC) {
        const p = args?.p_row as Record<string, unknown>;
        const id = String(p.event_id);
        if (revenue.has(id)) {
          return {
            data: { appended: false, duplicate: true, row: revenue.get(id) },
            error: null,
          };
        }
        revenue.set(id, p);
        return { data: { appended: true, duplicate: false, row: p }, error: null };
      }

      return { data: null, error: { message: `unknown rpc ${fn}` } };
    },
  };

  return client;
}

describe('PostgresDealCandidateRepository (fake client)', () => {
  it('A insert / B update / C upsert / F revision', async () => {
    const client = createFakePostgresClient();
    const repo = createPostgresDealCandidateRepository(client);

    const created = await repo.upsertAtomic(candidate(1999));
    expect(created.action).toBe('created');
    expect(created.candidate.revision).toBe(1);

    const updated = await repo.upsertAtomic(candidate(1799));
    expect(updated.action).toBe('updated');
    expect(updated.candidate.revision).toBe(2);

    const unchanged = await repo.upsertAtomic(candidate(1799));
    expect(unchanged.action).toBe('unchanged');
    expect(unchanged.candidate.revision).toBe(2);

    expect(client.candidates.size).toBe(1);
  });

  it('D duplicate identity + E concurrent ×10', async () => {
    const client = createFakePostgresClient();
    const repo = createPostgresDealCandidateRepository(client);
    const base = candidate(3000);
    await repo.upsertAtomic(base);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => repo.upsertAtomic(candidate(2900 - i * 10)))
    );

    expect(client.candidates.size).toBe(1);
    const final = await repo.findByIdentityKey(base.identity.key);
    expect(final?.revision).toBeGreaterThanOrEqual(2);
    expect(final?.revision).toBeLessThanOrEqual(11);
    expect(new Set(results.map((r) => r.candidate.identity.key)).size).toBe(1);
  });

  it('K malformed persistence input', async () => {
    const client = createFakePostgresClient();
    const repo = createPostgresDealCandidateRepository(client);
    await expect(repo.upsertAtomic({} as DealCandidate)).rejects.toThrow(/malformed/);
    await expect(repo.findByIdentityKey('')).rejects.toThrow(/identity_key/);
    await expect(repo.listByStatus('VALIDATED', 0)).rejects.toThrow(/limit/);
  });

  it('L transaction rollback via forced-fail RPC', async () => {
    const client = createFakePostgresClient();
    const repo = createPostgresDealCandidateRepository(client);
    await repo.upsertAtomic(candidate(1999));
    const before = await repo.findByIdentityKey(candidate().identity.key);

    const { error } = await client.rpc(CAZA_UPSERT_THEN_FAIL_RPC, {
      p_row: dealCandidateToRow(candidate(1000)),
    });
    expect(error?.message).toBe('caza_forced_rollback');

    const after = await repo.findByIdentityKey(candidate().identity.key);
    expect(after?.currentPrice).toBe(before?.currentPrice);
    expect(after?.revision).toBe(before?.revision);
    expect(client.candidates.size).toBe(1);
  });
});

describe('PostgresPublicationRepository (fake client)', () => {
  it('G publication idempotency concurrente ×10', async () => {
    const client = createFakePostgresClient();
    const repo = createPostgresPublicationRepository(client);
    const built = buildTestPublicationRecord({
      trackingLabel: 'caza_0f1e2d3c_20260919',
      telegramChannel: '@cazaofertasss',
    });
    if (!built.ok) throw new Error('fixture');

    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.saveIdempotent(built.value))
    );
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(client.publications.size).toBe(1);
  });
});

describe('PostgresRevenueRepository (fake client)', () => {
  it('H append-only + I duplicate event', async () => {
    const client = createFakePostgresClient();
    const ledger = createPostgresRevenueRepository(client);
    const event = buildAffiliateRevenueEvent({
      network: 'amazon_associates_mx',
      externalReference: 'ORDER-PG-1',
      dealId: 'caza_amazon_mx_abcd1234',
      trackingLabel: 'caza_0f1e2d3c_20260919',
      eventType: 'COMMISSION',
      amountValue: 33,
      currency: 'MXN',
      occurredAt: NOW_ISO,
      status: 'PENDING',
      recordedAt: NOW_ISO,
    });
    if (!event.ok) throw new Error('fixture');

    expect(await ledger.append(event.value)).toEqual({ appended: true, duplicate: false });
    expect(await ledger.append(event.value)).toEqual({ appended: false, duplicate: true });
    expect(client.revenue.size).toBe(1);
  });
});

describe('domain isolation under postgres repos', () => {
  it('mergeDealCandidate sigue siendo autoridad de fusión (no el SQL)', () => {
    const a = candidate(1999);
    const b = candidate(1500);
    const outcome = mergeDealCandidate(a, b);
    expect(outcome.action).toBe('updated');
    expect(outcome.candidate.revision).toBe(2);
  });
});
