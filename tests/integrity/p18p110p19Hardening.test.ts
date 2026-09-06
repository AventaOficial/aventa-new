/**
 * FASE 0.10 — P1-8 write queue, P1-10 dedupe helpers, P1-9 favorites rollback.
 */
import { describe, it, expect } from 'vitest';
import {
  claimedJobRows,
  resolveFailureStatus,
  isStaleProcessingLock,
  WRITE_JOB_MAX_ATTEMPTS,
} from '../../lib/server/writeQueue';
import {
  isStrongProductFingerprint,
  strongProductFingerprintForUrl,
  isUniqueViolation,
} from '../../lib/offers/findDuplicateOffer';
import {
  applyFavoriteToggle,
  isFavoriteUniqueViolation,
} from '../../lib/offers/applyFavoriteToggle';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('P1-8 — write queue', () => {
  it('1 — claim único: solo ids reclamados', () => {
    expect(claimedJobRows([{ id: 1 }, { id: 2 }], [{ id: 2 }])).toEqual([{ id: 2 }]);
  });

  it('2 — concurrent workers: empty claim → none', () => {
    expect(claimedJobRows([{ id: 1 }, { id: 2 }], [])).toEqual([]);
  });

  it('3-4 — retry then max attempts', () => {
    expect(resolveFailureStatus(1).status).toBe('pending');
    expect(resolveFailureStatus(WRITE_JOB_MAX_ATTEMPTS - 1).permanent).toBe(false);
    expect(resolveFailureStatus(WRITE_JOB_MAX_ATTEMPTS)).toEqual({
      status: 'failed',
      permanent: true,
    });
  });

  it('5 — permanent failure at max', () => {
    expect(resolveFailureStatus(99).permanent).toBe(true);
  });

  it('6 — transient stays pending', () => {
    expect(resolveFailureStatus(2)).toEqual({ status: 'pending', permanent: false });
  });

  it('7 — stale processing lock', () => {
    const now = Date.parse('2026-09-06T12:00:00.000Z');
    expect(isStaleProcessingLock(null, now)).toBe(true);
    expect(isStaleProcessingLock('2026-09-06T11:00:00.000Z', now, 15 * 60 * 1000)).toBe(true);
    expect(isStaleProcessingLock('2026-09-06T11:50:00.000Z', now, 15 * 60 * 1000)).toBe(false);
  });

  it('8 — duplicate claim ids ignored outside request', () => {
    expect(claimedJobRows([{ id: 10 }], [{ id: 10 }, { id: 99 }])).toEqual([{ id: 10 }]);
  });

  it('10 — failed does not loop forever (cap)', () => {
    for (let a = 1; a <= WRITE_JOB_MAX_ATTEMPTS + 3; a++) {
      const r = resolveFailureStatus(a);
      if (a < WRITE_JOB_MAX_ATTEMPTS) expect(r.status).toBe('pending');
      else expect(r.status).toBe('failed');
    }
  });
});

describe('P1-10 — offer dedupe fingerprint', () => {
  it('12 — strong fingerprint amazon', () => {
    const fp = strongProductFingerprintForUrl('https://www.amazon.com.mx/dp/B0TESTASI1?tag=x');
    expect(fp).toBe('amz:B0TESTASI1');
    expect(isStrongProductFingerprint(fp)).toBe(true);
  });

  it('13 — weak url fingerprint not strong', () => {
    expect(strongProductFingerprintForUrl('https://www.amazon.com.mx/s?k=audifonos')).toBeNull();
  });

  it('15 — different ASINs different fingerprints', () => {
    const a = strongProductFingerprintForUrl('https://www.amazon.com.mx/dp/B0AAAAAAA1');
    const b = strongProductFingerprintForUrl('https://www.amazon.com.mx/dp/B0BBBBBBB2');
    expect(a).not.toBe(b);
  });

  it('17 — unique violation detection', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ message: 'duplicate key value' })).toBe(true);
    expect(isUniqueViolation({ code: '42501' })).toBe(false);
  });

  it('23-ish — same product different tags → same strong fp', () => {
    const a = strongProductFingerprintForUrl('https://www.amazon.com.mx/dp/B0TESTASI1?tag=a');
    const b = strongProductFingerprintForUrl('https://www.amazon.com.mx/dp/B0TESTASI1?tag=b');
    expect(a).toBe(b);
  });
});

function mockFavoriteClient(opts: {
  deleteError?: { code?: string; message?: string } | null;
  insertError?: { code?: string; message?: string } | null;
}): SupabaseClient {
  return {
    from: () => ({
      delete: () => ({
        eq: () => ({
          eq: async () => ({ error: opts.deleteError ?? null }),
        }),
      }),
      insert: async () => ({ error: opts.insertError ?? null }),
    }),
  } as unknown as SupabaseClient;
}

describe('P1-9 — favorites rollback', () => {
  it('23 — favorite success', async () => {
    const r = await applyFavoriteToggle({
      client: mockFavoriteClient({}),
      userId: 'u1',
      offerId: 'o1',
      wasFavorite: false,
    });
    expect(r).toEqual({ ok: true, isFavorite: true });
  });

  it('24 — unfavorite success', async () => {
    const r = await applyFavoriteToggle({
      client: mockFavoriteClient({}),
      userId: 'u1',
      offerId: 'o1',
      wasFavorite: true,
    });
    expect(r).toEqual({ ok: true, isFavorite: false });
  });

  it('25 — add failure rollback', async () => {
    const r = await applyFavoriteToggle({
      client: mockFavoriteClient({ insertError: { message: 'fail', code: '500' } }),
      userId: 'u1',
      offerId: 'o1',
      wasFavorite: false,
    });
    expect(r).toEqual({ ok: false, isFavorite: false });
  });

  it('26 — remove failure rollback', async () => {
    const r = await applyFavoriteToggle({
      client: mockFavoriteClient({ deleteError: { message: 'fail' } }),
      userId: 'u1',
      offerId: 'o1',
      wasFavorite: true,
    });
    expect(r).toEqual({ ok: false, isFavorite: true });
  });

  it('27-29 — error codes still rollback to previous', async () => {
    const r = await applyFavoriteToggle({
      client: mockFavoriteClient({ insertError: { code: '42501', message: 'rls' } }),
      userId: 'u1',
      offerId: 'o1',
      wasFavorite: false,
    });
    expect(r.isFavorite).toBe(false);
  });

  it('33 — duplicate backend insert → keep favorite', async () => {
    expect(isFavoriteUniqueViolation({ code: '23505' })).toBe(true);
    const r = await applyFavoriteToggle({
      client: mockFavoriteClient({ insertError: { code: '23505', message: 'duplicate key' } }),
      userId: 'u1',
      offerId: 'o1',
      wasFavorite: false,
    });
    expect(r).toEqual({ ok: true, isFavorite: true });
  });
});
