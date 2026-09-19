import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  aggregateRejectionReasons,
  bucketRejectionReason,
  collectPlatformPulse,
  sanitizePlatformPulsePayload,
  PLATFORM_PULSE_SECRET_KEY_RE,
} from '@/lib/observability';

const SECRET_FIELD_RE =
  /(api[_-]?key|secret|password|token|bearer|service_role|authorization)/i;

type MockQueryState = {
  table: string;
  head: boolean;
  filters: Record<string, unknown>;
};

function makeThenableChain(resolve: () => Promise<unknown>) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ['select', 'eq', 'gte', 'is', 'neq', 'order', 'in']) {
    chain[method] = (...args: unknown[]) => {
      if (method === 'eq' && typeof args[0] === 'string') {
        (chain as { __state?: MockQueryState }).__state!.filters[args[0]] = args[1];
      }
      if (method === 'gte' && typeof args[0] === 'string') {
        (chain as { __state?: MockQueryState }).__state!.filters[`${args[0]}__gte`] = args[1];
      }
      return self();
    };
  }
  chain.limit = () => resolve();
  chain.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => resolve().then(onFulfilled, onRejected);
  return chain;
}

function makeSupabaseMock(
  resolver: (state: MockQueryState) => Promise<{
    data?: unknown;
    count?: number | null;
    error?: { message: string } | null;
  }>,
) {
  return {
    from: vi.fn((table: string) => {
      const state: MockQueryState = { table, head: false, filters: {} };
      const chain = makeThenableChain(() => resolver(state));
      (chain as { __state?: MockQueryState }).__state = state;
      const originalSelect = chain.select as (...args: unknown[]) => unknown;
      chain.select = (...args: unknown[]) => {
        const opts = args[1] as { head?: boolean } | undefined;
        if (opts?.head) state.head = true;
        return originalSelect(...args);
      };
      return chain;
    }),
    rpc: vi.fn(async (fn: string) => {
      if (fn === 'hunter_supply_activity') return { data: [], error: null };
      if (fn === 'hunter_supply_aggregate') {
        return {
          data: [
            {
              source_id: 'ml_api',
              source_lane: 'machine',
              candidates_discovered: 12,
              rejected: 2,
              pending: 1,
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    }),
  };
}

function walkForSecrets(value: unknown, path = 'root'): string[] {
  const hits: string[] = [];
  if (value === null || value === undefined) return hits;
  if (typeof value === 'string') {
    if (SECRET_FIELD_RE.test(value) && value.length > 12) hits.push(path);
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...walkForSecrets(item, `${path}[${i}]`)));
    return hits;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD_RE.test(k)) hits.push(`${path}.${k}`);
      hits.push(...walkForSecrets(v, `${path}.${k}`));
    }
  }
  return hits;
}

describe('platformPulse rejection bucketing', () => {
  it('agrupa razones de rechazo en buckets de alto nivel', () => {
    expect(bucketRejectionReason('duplicate fingerprint')).toBe('duplicate');
    expect(bucketRejectionReason('bad price vs store')).toBe('price');
    expect(bucketRejectionReason('broken affiliate link')).toBe('link');
    expect(bucketRejectionReason('low quality score')).toBe('quality');
    expect(bucketRejectionReason('auto expired timeout')).toBe('expired');
    expect(bucketRejectionReason('')).toBe('unspecified');
  });

  it('aggregateRejectionReasons cuenta por bucket', () => {
    const agg = aggregateRejectionReasons([
      { rejection_reason: 'duplicate offer' },
      { rejection_reason: 'duplicate again' },
      { rejection_reason: 'bad link' },
    ]);
    expect(agg).toEqual({ duplicate: 2, link: 1 });
  });
});

describe('sanitizePlatformPulsePayload', () => {
  it('elimina claves con forma de secreto', () => {
    const clean = sanitizePlatformPulsePayload({
      ok: true,
      api_key: 'should-vanish',
      nested: { bearer_token: 'nope', count: 3 },
    });
    expect(clean).toEqual({ ok: true, nested: { count: 3 } });
    expect(PLATFORM_PULSE_SECRET_KEY_RE.test('api_key')).toBe(true);
  });
});

describe('collectPlatformPulse', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.stubEnv('SETTLEMENT_BRIDGE_ENABLED', '');
    vi.stubEnv('DISTRIBUTION_ENGINE_ENABLED', '');
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.unstubAllEnvs();
  });

  it('settlement bridge OFF por defecto en money pulse', async () => {
    const pulse = await collectPlatformPulse({
      supabase: null,
      env: process.env,
    });
    expect(pulse.money.settlementBridgeEnabled).toBe(false);
    expect(pulse.money.note).toMatch(/OFF|unavailable|Supabase/i);
  });

  it('respeta flag settlement cuando está habilitado (solo booleano)', async () => {
    vi.stubEnv('SETTLEMENT_BRIDGE_ENABLED', 'true');
    const pulse = await collectPlatformPulse({ supabase: null, env: process.env });
    expect(pulse.money.settlementBridgeEnabled).toBe(true);
    const serialized = JSON.stringify(pulse);
    expect(serialized).not.toContain('SETTLEMENT_BRIDGE_ENABLED');
    expect(serialized).not.toMatch(/service_role|api[_-]?key/i);
  });

  it('agrega dominios con mocks — sin campos de secreto', async () => {
    const clickCreatedAt = '2026-09-18T10:00:00.000Z';
    const distCounts: Record<string, number> = {
      pending: 2,
      publishing: 1,
      published: 10,
      retryable: 3,
      failed: 1,
      unknown_outcome: 0,
    };

    const sb = makeSupabaseMock(async (state) => {
      if (state.table === 'offers' && state.head) {
        return { count: 4, error: null };
      }
      if (state.table === 'moderation_outcomes') {
        return {
          data: [{ rejection_reason: 'duplicate fingerprint' }],
          error: null,
        };
      }
      if (state.table === 'distribution_publications' && state.head) {
        const status = String(state.filters.status ?? '');
        return { count: distCounts[status] ?? 0, error: null };
      }
      if (state.table === 'affiliate_conversions') {
        return {
          data: [
            { id: 'c1', attribution_status: 'attributed', status: 'confirmed' },
            { id: 'c2', attribution_status: 'unattributed', status: 'received' },
          ],
          error: null,
        };
      }
      if (state.table === 'affiliate_commissions') {
        return {
          data: [
            { id: 'm1', status: 'reported' },
            { id: 'm2', status: 'approved' },
          ],
          error: null,
        };
      }
      if (state.table === 'reward_outbound_clicks') {
        return {
          data: [
            {
              id: 'clk-1',
              offer_id: 'o1',
              network: 'amazon',
              channel: 'telegram',
              campaign_key: null,
              destination_url: 'https://example.com',
              original_destination_url: null,
              created_at: clickCreatedAt,
            },
          ],
          error: null,
        };
      }
      if (state.table === 'offer_events' && state.head) {
        return { count: 5, error: null };
      }
      if (state.table === 'affiliate_ledger_entries' && state.head) {
        return { count: 7, error: null };
      }
      if (state.table === 'affiliate_economic_events' && state.head) {
        return { count: 1, error: null };
      }
      return { data: [], count: 0, error: null };
    });

    const pulse = await collectPlatformPulse({
      supabase: sb as never,
      windowHours: 24,
      now: new Date('2026-09-18T12:00:00.000Z'),
    });

    expect(pulse.supply.pending).toBe(4);
    expect(pulse.supply.rejectionReasons).toEqual({ duplicate: 1 });
    expect(pulse.distribution.enqueue).toBe(2);
    expect(pulse.distribution.claim).toBe(1);
    expect(pulse.distribution.published).toBe(10);
    expect(pulse.attribution.clicks).toBe(1);
    expect(pulse.attribution.conversions).toBe(2);
    expect(pulse.money.commissionsApproved).toBe(1);
    expect(pulse.money.ledgerEntries).toBe(7);
    expect(pulse.money.settlementEligible).toBe(1);
    expect(pulse.money.settlementBridgeEnabled).toBe(false);

    const secretHits = walkForSecrets(pulse);
    expect(secretHits).toEqual([]);
  });

  it('fail-soft cuando distribution_publications no existe', async () => {
    const sb = makeSupabaseMock(async (state) => {
      if (state.table === 'distribution_publications') {
        return {
          count: null,
          error: { message: 'relation "distribution_publications" does not exist' },
        };
      }
      if (state.table === 'offers' && state.head) {
        return { count: 0, error: null };
      }
      if (state.table === 'moderation_outcomes') {
        return { data: [], error: null };
      }
      return { data: [], count: 0, error: null };
    });

    const pulse = await collectPlatformPulse({
      supabase: sb as never,
      windowHours: 24,
    });

    expect(pulse.distribution.available).toBe(false);
    expect(pulse.distribution.status).toBe('unavailable');
    expect(pulse.distribution.enqueue).toBeNull();
    expect(pulse.supply.available).toBe(true);
  });
});
