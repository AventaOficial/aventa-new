import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COUPON_SCHEMA_RECHECK_MS,
  couponSchemaKnownMissing,
  publicCouponsForOffer,
  recordCouponInteraction,
  resetCouponSchemaMemoForTests,
} from '@/lib/intelligence/coupon/store';

const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.coupon_links' in the schema cache" };

function client(linkError: { code: string; message: string } | null) {
  const from = vi.fn((table: string) => {
    if (table === 'offers') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'o1', store: 'amazon' }, error: null }) }) }) };
    }
    return { select: () => ({ in: () => ({ limit: async () => ({ data: linkError ? null : [], error: linkError }) }) }) };
  });
  return { sb: { from } as unknown as SupabaseClient, from };
}

describe('coupons: schema not provisioned', () => {
  beforeEach(() => resetCouponSchemaMemoForTests());

  it('offer page stops querying coupon tables after the first schema-missing error', async () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const { sb, from } = client(MISSING);
    expect(await publicCouponsForOffer(sb, 'o1', now)).toEqual({ coupons: [], ready: false });
    const callsAfterFirst = from.mock.calls.length;
    expect(couponSchemaKnownMissing(now.getTime())).toBe(true);

    expect(await publicCouponsForOffer(sb, 'o1', new Date(now.getTime() + 60_000))).toEqual({ coupons: [], ready: false });
    expect(from.mock.calls.length).toBe(callsAfterFirst);

    await publicCouponsForOffer(sb, 'o1', new Date(now.getTime() + COUPON_SCHEMA_RECHECK_MS + 1));
    expect(from.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('transient errors do not disable coupons', async () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const { sb } = client({ code: '57014', message: 'statement timeout' });
    await publicCouponsForOffer(sb, 'o1', now);
    expect(couponSchemaKnownMissing(now.getTime())).toBe(false);
  });

  it('interaction recording short-circuits while the schema is known missing', async () => {
    const now = new Date();
    const { sb, from } = client(MISSING);
    await publicCouponsForOffer(sb, 'o1', now);
    from.mockClear();
    const r = await recordCouponInteraction(sb, { offerId: 'o1', code: 'SAVE10', eventType: 'coupon_copy', idempotencyKey: 'k-12345678' });
    expect(r).toMatchObject({ recorded: false });
    expect(from).not.toHaveBeenCalled();
  });

  it('admin coupons API does not echo raw DB errors', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/admin/coupons/route.ts'), 'utf8');
    expect(route).not.toContain('detail:');
  });
});
