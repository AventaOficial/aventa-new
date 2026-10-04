import { describe, expect, it } from 'vitest';
import { formatMexicoDateTime, remainingDaysLabel } from '@/lib/time/mexicoClock';
import { alignCommentLike, toggleCommentLike } from '@/lib/comments/commentLikeState';
import { presentOfferFreshness } from '@/lib/offers/freshness/present';
import { isConfirmedGoneDiagnostic } from '@/lib/offers/evaluateOfferHealth';

describe('mexico clock hydration', () => {
  it('formats a UTC instant in America/Mexico_City, not the server zone', () => {
    const label = formatMexicoDateTime('2026-10-04T03:46:25.754Z');
    expect(label).toMatch(/3\/10\/2026/);
    expect(label).toMatch(/9:46:25/);
    expect(label).toMatch(/p/i);
  });

  it('counts remaining days from expires_at, not local setDate', () => {
    const now = Date.parse('2026-10-04T12:00:00.000Z');
    expect(remainingDaysLabel('2026-10-06T12:00:00.000Z', now)).toBe('2 días restantes');
    expect(remainingDaysLabel('2026-10-04T11:00:00.000Z', now)).toBeNull();
  });
});

describe('comment likes', () => {
  it('toggles a reply without remounting the rest of the thread', () => {
    const thread = [
      { id: 'a', liked_by_me: false, like_count: 1, replies: [{ id: 'b', liked_by_me: false, like_count: 0 }] },
    ];
    const next = toggleCommentLike(thread, 'b');
    expect(next[0].id).toBe('a');
    expect(next[0].liked_by_me).toBe(false);
    expect(next[0].replies?.[0]).toMatchObject({ liked_by_me: true, like_count: 1 });
    const again = toggleCommentLike(next, 'b');
    expect(again[0].replies?.[0]).toMatchObject({ liked_by_me: false, like_count: 0 });
  });

  it('aligns to the server flag once', () => {
    const thread = [{ id: 'a', liked_by_me: true, like_count: 2 }];
    expect(alignCommentLike(thread, 'a', true)[0].like_count).toBe(2);
    expect(alignCommentLike(thread, 'a', false)[0]).toMatchObject({ liked_by_me: false, like_count: 1 });
  });
});

describe('outbound honesty', () => {
  const now = new Date('2026-10-04T12:00:00.000Z');

  it('treats missing_title out_of_stock as unconfirmed', () => {
    expect(isConfirmedGoneDiagnostic('missing_title')).toBe(false);
    expect(isConfirmedGoneDiagnostic('http_404')).toBe(true);
    expect(isConfirmedGoneDiagnostic('http_410|auto_expire_streak=2')).toBe(true);
    const view = presentOfferFreshness({
      expiresAt: '2026-10-05T01:43:22.000Z',
      healthStatus: 'out_of_stock',
      confirmedGone: isConfirmedGoneDiagnostic('missing_discount_price'),
      lastCheckedAt: '2026-10-04T03:46:25.754Z',
      now,
    });
    expect(view.ctaEnabled).toBe(true);
    expect(view.detail).toMatch(/precio puede haber cambiado/i);
  });
});
