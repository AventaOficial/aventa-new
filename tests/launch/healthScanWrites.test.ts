import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expireConfirmedGoneOffer, extendLiveOfferExpiry } from '@/lib/offers/healthScanWrites';

type Offer = { id: string; status: string; deleted_at: string | null; archived_at: string | null; expires_at: string | null };

/** Fake mínimo que aplica los filtros encadenados igual que PostgREST. */
function fake(offers: Offer[]) {
  const audits: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      if (table === 'moderation_logs') {
        return {
          insert: async (row: Record<string, unknown>) => {
            audits.push(row);
            return { error: null };
          },
        };
      }
      let patch: Partial<Offer> = {};
      const preds: ((o: Offer) => boolean)[] = [];
      const q = {
        update(p: Partial<Offer>) {
          patch = p;
          return q;
        },
        eq(col: keyof Offer, v: unknown) {
          preds.push((o) => o[col] === v);
          return q;
        },
        in(col: keyof Offer, vs: unknown[]) {
          preds.push((o) => vs.includes(o[col]));
          return q;
        },
        is(col: keyof Offer, v: null) {
          preds.push((o) => o[col] === v);
          return q;
        },
        or(expr: string) {
          const now = expr.split('expires_at.gt.')[1];
          preds.push((o) => o.expires_at == null || o.expires_at > now);
          return q;
        },
        async select() {
          const hit = offers.filter((o) => preds.every((p) => p(o)));
          for (const o of hit) Object.assign(o, patch);
          return { data: hit.map((o) => ({ id: o.id, status: o.status })), error: null };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, audits };
}

const live = (over: Partial<Offer> = {}): Offer => ({
  id: 'o1',
  status: 'approved',
  deleted_at: null,
  archived_at: null,
  expires_at: '2026-12-01T00:00:00.000Z',
  ...over,
});
const NOW = new Date('2026-10-04T12:00:00.000Z');

describe('health scanner writes', () => {
  it('expires a live offer and writes a system audit row', async () => {
    const offers = [live()];
    const f = fake(offers);
    const r = await expireConfirmedGoneOffer(f.client, {
      offerId: 'o1',
      previousExpiresAt: '2026-12-01T00:00:00.000Z',
      diagnostic: 'http_404|auto_expire_streak=2',
      streak: 2,
      now: NOW,
    });
    expect(r).toEqual({ expired: true, audited: true });
    expect(offers[0].expires_at).toBe(NOW.toISOString());
    expect(f.audits[0]).toMatchObject({
      offer_id: 'o1',
      user_id: null,
      action: 'expired',
      reason: 'health_scan_confirmed_gone',
    });
    expect((f.audits[0].metadata as Record<string, unknown>).previous_expires_at).toBe('2026-12-01T00:00:00.000Z');
  });

  it.each([
    ['rejected', live({ status: 'rejected' })],
    ['deleted', live({ deleted_at: '2026-10-01T00:00:00Z' })],
    ['archived', live({ archived_at: '2026-10-01T00:00:00Z' })],
    ['already expired', live({ expires_at: '2026-10-01T00:00:00.000Z' })],
  ])('never mutates or audits a %s offer (race-safe guard in the UPDATE)', async (_label, offer) => {
    const before = { ...offer };
    const f = fake([offer]);
    const r = await expireConfirmedGoneOffer(f.client, {
      offerId: 'o1',
      previousExpiresAt: offer.expires_at,
      diagnostic: null,
      streak: 2,
      now: NOW,
    });
    expect(r).toEqual({ expired: false, audited: false });
    expect(offer).toEqual(before);
    expect(f.audits).toHaveLength(0);
  });

  it('extension never resurrects rejected/archived offers', async () => {
    const archived = live({ archived_at: '2026-10-01T00:00:00Z', expires_at: '2026-10-01T00:00:00Z' });
    const f = fake([archived]);
    expect(await extendLiveOfferExpiry(f.client, { offerId: 'o1', expiresAt: '2026-10-11T00:00:00Z' })).toBe(false);
    expect(archived.expires_at).toBe('2026-10-01T00:00:00Z');

    const ok = live();
    const g = fake([ok]);
    expect(await extendLiveOfferExpiry(g.client, { offerId: 'o1', expiresAt: '2026-12-11T00:00:00Z' })).toBe(true);
    expect(ok.expires_at).toBe('2026-12-11T00:00:00Z');
  });
});
