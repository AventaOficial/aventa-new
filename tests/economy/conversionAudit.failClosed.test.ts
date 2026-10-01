import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { recordConversion } from '@/lib/economy/recordConversion';

type Stored = Record<string, unknown> & { id: string };

function conversionStore(opts?: { failAudits?: number }) {
  const rows = new Map<string, Stored>();
  const events: Array<Record<string, unknown>> = [];
  let failAudits = opts?.failAudits ?? 0;
  let deletes = 0;
  let seq = 0;

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'affiliate_economic_events') {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            if (failAudits > 0) {
              failAudits -= 1;
              return { error: { message: 'audit_down' } };
            }
            events.push(row);
            return { error: null };
          }),
        };
      }
      if (table !== 'affiliate_conversions') {
        return {
          insert: vi.fn(() => {
            throw new Error(`unexpected write ${table}`);
          }),
          update: vi.fn(() => {
            throw new Error(`unexpected write ${table}`);
          }),
          delete: vi.fn(() => {
            throw new Error(`unexpected write ${table}`);
          }),
        };
      }
      return {
        insert: vi.fn((row: Record<string, unknown>) => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              const key = `${row.source}|${row.network}|${row.external_conversion_id}`;
              const existing = [...rows.values()].find(
                (item) =>
                  `${item.source}|${item.network}|${item.external_conversion_id}` === key,
              );
              if (existing) {
                return { data: null, error: { code: '23505', message: 'duplicate' } };
              }
              seq += 1;
              const stored = { id: `conv-${seq}`, ...row } as Stored;
              rows.set(stored.id, stored);
              return { data: stored, error: null };
            }),
          })),
        })),
        select: vi.fn(() => {
          const filters: Record<string, string> = {};
          const api: Record<string, unknown> = {};
          api.eq = (col: string, val: string) => {
            filters[col] = val;
            return api;
          };
          api.maybeSingle = vi.fn(async () => {
            const found = [...rows.values()].find((item) =>
              Object.entries(filters).every(([col, val]) => item[col] === val),
            );
            return { data: found ?? null, error: null };
          });
          return api;
        }),
        update: vi.fn(() => {
          throw new Error('conversion audit retry must not update the row');
        }),
        delete: vi.fn(() => {
          deletes += 1;
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
      };
    }),
  };

  return { sb, rows, events, deletes: () => deletes };
}

const input = {
  source: 'api' as const,
  network: 'amazon' as const,
  externalConversionId: 'ORD-1',
  occurredAt: '2026-09-16T12:00:00.000Z',
};

describe('conversion audit fail-closed', () => {
  it('insert plus audit success returns the row', async () => {
    const store = conversionStore();
    const result = await recordConversion(store.sb as never, input);
    expect(result?.reused).toBe(false);
    expect(result?.conversionId).toBe('conv-1');
    expect(store.rows.size).toBe(1);
    expect(store.events.some((event) => event.event_type === 'created')).toBe(true);
    expect(store.deletes()).toBe(0);
  });

  it('insert plus audit failure keeps the row and does not report success', async () => {
    const store = conversionStore({ failAudits: 1 });
    const result = await recordConversion(store.sb as never, input);
    expect(result).toBeNull();
    expect(store.rows.size).toBe(1);
    expect(store.events).toHaveLength(0);
    expect(store.deletes()).toBe(0);
  });

  it('retry after audit failure reuses the same row when the audit succeeds', async () => {
    const store = conversionStore({ failAudits: 1 });
    const first = await recordConversion(store.sb as never, input);
    const retry = await recordConversion(store.sb as never, input);
    expect(first).toBeNull();
    expect(retry?.reused).toBe(true);
    expect(retry?.conversionId).toBe('conv-1');
    expect(store.rows.size).toBe(1);
    expect(store.events).toHaveLength(1);
    expect(store.deletes()).toBe(0);
  });

  it('duplicate conversion reuses the canonical row', async () => {
    const store = conversionStore();
    const a = await recordConversion(store.sb as never, input);
    const b = await recordConversion(store.sb as never, input);
    expect(a?.conversionId).toBe(b?.conversionId);
    expect(b?.reused).toBe(true);
    expect(store.rows.size).toBe(1);
  });

  it('concurrent duplicate conversion keeps one row', async () => {
    const store = conversionStore();
    const results = await Promise.all([
      recordConversion(store.sb as never, input),
      recordConversion(store.sb as never, input),
    ]);
    const ids = new Set(results.map((result) => result?.conversionId).filter(Boolean));
    expect(store.rows.size).toBe(1);
    expect(ids.size).toBe(1);
  });

  it('does not delete conversions or touch other economic tables', () => {
    const src = readFileSync(join(process.cwd(), 'lib/economy/recordConversion.ts'), 'utf8');
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/affiliate_ledger_entries|creator_rewards|payout_intents/);
  });
});
