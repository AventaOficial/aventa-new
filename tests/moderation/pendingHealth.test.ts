import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPendingHealth, emptyPendingHealth } from '@/lib/moderation/pendingHealth';
import { preferOfferFirst } from '@/lib/moderation/claimNextModerationOffer';

const NOW = new Date('2026-09-08T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

type Call = { table: string; op: string };

function fakeSupabase(
  rows: unknown[],
  opts: { error?: { message: string } | null; calls?: Call[] } = {}
) {
  const calls = opts.calls ?? [];
  const client = {
    from(table: string) {
      const builder = {
        select() {
          calls.push({ table, op: 'select' });
          return builder;
        },
        eq: () => builder,
        order: () => builder,
        limit: () => Promise.resolve({ data: rows, error: opts.error ?? null }),
        update() {
          calls.push({ table, op: 'update' });
          return builder;
        },
        delete() {
          calls.push({ table, op: 'delete' });
          return builder;
        },
        insert() {
          calls.push({ table, op: 'insert' });
          return builder;
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('pending health: lectura de cola', () => {
  it('clasifica la cola leída', async () => {
    const { client } = fakeSupabase([
      { id: 'a', status: 'pending', created_at: hoursAgo(1) },
      { id: 'b', status: 'pending', created_at: hoursAgo(200) },
    ]);
    const summary = await getPendingHealth(client, { now: NOW });
    expect(summary.total).toBe(2);
    expect(summary.fresh).toBe(1);
    expect(summary.stale).toBe(1);
    expect(summary.needsAttention).toBe(1);
  });

  it('es solo lectura: nunca hace update, insert ni delete', async () => {
    const { client, calls } = fakeSupabase([
      { id: 'a', status: 'pending', created_at: hoursAgo(200) },
    ]);
    await getPendingHealth(client, { now: NOW });
    expect(calls.every((c) => c.op === 'select')).toBe(true);
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
    expect(calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('fail-closed: sin cliente o con error devuelve cola vacía y no lanza', async () => {
    expect(await getPendingHealth(null)).toEqual(emptyPendingHealth());
    const { client } = fakeSupabase([], { error: { message: 'boom' } });
    const summary = await getPendingHealth(client, { now: NOW });
    expect(summary.total).toBe(0);
    expect(summary.needsAttention).toBe(0);
  });

  it('esquema viejo sin columnas opcionales: reintenta con el core', async () => {
    const { client } = fakeSupabase([{ id: 'a', status: 'pending', created_at: hoursAgo(1) }], {
      error: { message: 'column offers.product_fingerprint does not exist' },
    });
    const summary = await getPendingHealth(client, { now: NOW });
    expect(summary.total).toBe(0);
  });
});

describe('deep-link a Focus: preferencia, no bypass', () => {
  const queue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('mueve al frente la oferta pedida y conserva el resto del orden', () => {
    expect(preferOfferFirst(queue, 'c').map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });

  it('si la oferta no es elegible, el orden no cambia', () => {
    expect(preferOfferFirst(queue, 'no-existe').map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(preferOfferFirst(queue, null).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('no muta la lista original', () => {
    const original = [...queue];
    preferOfferFirst(queue, 'c');
    expect(queue).toEqual(original);
  });
});
