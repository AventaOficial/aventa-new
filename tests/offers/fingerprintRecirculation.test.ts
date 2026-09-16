import { describe, expect, it } from 'vitest';
import {
  AUTO_REJECTED_TIMEOUT_REASON,
  TIMEOUT_REJECT_COOLDOWN_HOURS,
  findDuplicateOfferByUrl,
  offerRowBlocksHunterDuplicate,
  offerRowBlocksHunterTimeoutCooldown,
} from '@/lib/offers/findDuplicateOffer';

const NOW = new Date('2026-09-13T18:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const ML_URL = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-producto-test-_JM?tag=aventa';

type QueryResult = { data: unknown[] | null; error: null };

/** Cadena thenable mínima compatible con el estilo supabase-js (.from().select()...). */
function mockSupabase(handlers: {
  byFingerprintLive?: unknown[];
  byExactUrl?: unknown[];
  byScan?: unknown[];
  byTimeoutCooldown?: unknown[];
}) {
  const calls: { table: string; filters: string[] }[] = [];

  function chain(initialFilters: string[] = []) {
    const state = { filters: [...initialFilters], limitN: 5, orderCol: '' as string };
    const api: Record<string, unknown> = {};
    const self = () => api;

    api.select = () => self();
    api.eq = (col: string, val: unknown) => {
      state.filters.push(`eq:${col}=${String(val)}`);
      return self();
    };
    api.in = (col: string, vals: unknown[]) => {
      state.filters.push(`in:${col}=${vals.join(',')}`);
      return self();
    };
    api.is = (col: string, val: unknown) => {
      state.filters.push(`is:${col}=${String(val)}`);
      return self();
    };
    api.not = (col: string, op: string, val: unknown) => {
      state.filters.push(`not:${col}.${op}=${String(val)}`);
      return self();
    };
    api.gte = (col: string, val: unknown) => {
      state.filters.push(`gte:${col}=${String(val)}`);
      return self();
    };
    api.order = (col: string) => {
      state.orderCol = col;
      return self();
    };
    api.limit = (n: number) => {
      state.limitN = n;
      const filters = state.filters.join('|');
      calls.push({ table: 'offers', filters });

      let data: unknown[] = [];
      if (filters.includes("in:status=pending,approved,published") && filters.includes('eq:product_fingerprint=')) {
        data = handlers.byFingerprintLive ?? [];
      } else if (filters.includes("in:status=pending,approved,published") && filters.includes('eq:offer_url=')) {
        data = handlers.byExactUrl ?? [];
      } else if (
        filters.includes("in:status=pending,approved,published") &&
        filters.includes('not:offer_url.is=null')
      ) {
        data = handlers.byScan ?? [];
      } else if (
        filters.includes(`eq:status=rejected`) &&
        filters.includes(`eq:rejection_reason=${AUTO_REJECTED_TIMEOUT_REASON}`)
      ) {
        data = handlers.byTimeoutCooldown ?? [];
      }

      const result: QueryResult = { data, error: null };
      return Promise.resolve(result);
    };

    return api;
  }

  return {
    client: {
      from: (table: string) => {
        expect(table).toBe('offers');
        return chain();
      },
    },
    calls,
  };
}

describe('anti-recirculación por product_fingerprint', () => {
  it('pending vigente + mismo fingerprint => bloqueado', async () => {
    expect(
      offerRowBlocksHunterDuplicate(
        { status: 'pending', deleted_at: null, expires_at: null },
        NOW
      )
    ).toBe(true);

    const { client } = mockSupabase({
      byFingerprintLive: [
        {
          id: 'pending-1',
          status: 'pending',
          deleted_at: null,
          expires_at: null,
          created_at: hoursAgo(2),
          price: 100,
        },
      ],
    });

    const match = await findDuplicateOfferByUrl(client as never, ML_URL, { now: NOW });
    expect(match).not.toBeNull();
    expect(match?.id).toBe('pending-1');
    expect(match?.kind).toBe('pending_fresh');
  });

  it('timeout rejected + mismo fingerprint dentro del cooldown => bloqueado', async () => {
    const row = {
      id: 'rej-timeout-1',
      status: 'rejected',
      rejection_reason: AUTO_REJECTED_TIMEOUT_REASON,
      deleted_at: null,
      updated_at: hoursAgo(12),
      created_at: hoursAgo(80),
      price: 200,
    };
    expect(offerRowBlocksHunterTimeoutCooldown(row, NOW)).toBe(true);

    const { client } = mockSupabase({
      byFingerprintLive: [],
      byExactUrl: [],
      byScan: [],
      byTimeoutCooldown: [row],
    });

    const match = await findDuplicateOfferByUrl(client as never, ML_URL, { now: NOW });
    expect(match).not.toBeNull();
    expect(match?.id).toBe('rej-timeout-1');
    expect(match?.kind).toBe('timeout_cooldown');
  });

  it('timeout rejected fuera del cooldown => no bloquea', () => {
    expect(
      offerRowBlocksHunterTimeoutCooldown(
        {
          status: 'rejected',
          rejection_reason: AUTO_REJECTED_TIMEOUT_REASON,
          updated_at: hoursAgo(TIMEOUT_REJECT_COOLDOWN_HOURS + 1),
        },
        NOW
      )
    ).toBe(false);
  });

  it('rechazo humano no entra en cooldown de recirculación', () => {
    expect(
      offerRowBlocksHunterTimeoutCooldown(
        {
          status: 'rejected',
          rejection_reason: 'No es una buena oferta para publicar en Aventa.',
          updated_at: hoursAgo(1),
        },
        NOW
      )
    ).toBe(false);
  });

  it('fingerprint nuevo => permitido', async () => {
    const { client } = mockSupabase({
      byFingerprintLive: [],
      byExactUrl: [],
      byScan: [],
      byTimeoutCooldown: [],
    });

    const match = await findDuplicateOfferByUrl(client as never, ML_URL, { now: NOW });
    expect(match).toBeNull();
  });

  it('insertIngestedOffer sigue gateando con findDuplicateOfferByUrl', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'lib/bots/ingest/insertIngestedOffer.ts'), 'utf8');
    expect(src).toMatch(/findDuplicateOfferByUrl/);
  });
});

describe('offerRowBlocksHunterTimeoutCooldown bordes', () => {
  it('bloquea en el límite exacto del cooldown', () => {
    expect(
      offerRowBlocksHunterTimeoutCooldown(
        {
          status: 'rejected',
          rejection_reason: AUTO_REJECTED_TIMEOUT_REASON,
          updated_at: hoursAgo(TIMEOUT_REJECT_COOLDOWN_HOURS),
        },
        NOW
      )
    ).toBe(true);
  });

  it('sin updated_at usa created_at', () => {
    expect(
      offerRowBlocksHunterTimeoutCooldown(
        {
          status: 'rejected',
          rejection_reason: AUTO_REJECTED_TIMEOUT_REASON,
          updated_at: null,
          created_at: hoursAgo(10),
        },
        NOW
      )
    ).toBe(true);
  });

  it('deleted_at libera el cooldown', () => {
    expect(
      offerRowBlocksHunterTimeoutCooldown(
        {
          status: 'rejected',
          rejection_reason: AUTO_REJECTED_TIMEOUT_REASON,
          deleted_at: hoursAgo(1),
          updated_at: hoursAgo(1),
        },
        NOW
      )
    ).toBe(false);
  });
});
