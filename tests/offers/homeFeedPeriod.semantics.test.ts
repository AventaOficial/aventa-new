import { describe, expect, it } from 'vitest';
import { resolveHomeFeedPeriod } from '@/lib/offers/homeFeedClient';

describe('resolveHomeFeedPeriod — Recientes semantics', () => {
  it('Recientes (latest) uses week, not day — avoids empty “broken” feed', () => {
    expect(resolveHomeFeedPeriod('latest', 'day')).toBe('week');
    expect(resolveHomeFeedPeriod('latest', 'week')).toBe('week');
    expect(resolveHomeFeedPeriod('latest', 'month')).toBe('week');
  });

  it('Día a día (vitales) also uses week (no period control in UI)', () => {
    expect(resolveHomeFeedPeriod('vitales', 'day')).toBe('week');
  });

  it('Top respects explicit day/week/month selector', () => {
    expect(resolveHomeFeedPeriod('top', 'day')).toBe('day');
    expect(resolveHomeFeedPeriod('top', 'week')).toBe('week');
    expect(resolveHomeFeedPeriod('top', 'month')).toBe('month');
  });

  it('home-feed Recientes remapping does not redefine Top day semantics', () => {
    // Isolation contract: /api/feed/home period helper must not collapse Top→week.
    expect(resolveHomeFeedPeriod('latest', 'day')).toBe('week');
    expect(resolveHomeFeedPeriod('top', 'day')).toBe('day');
  });
});
