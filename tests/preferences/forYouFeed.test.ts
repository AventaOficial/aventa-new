import { describe, expect, it } from 'vitest';
import { buildAffinityFromPreferredSelections, sortOffersByAffinity } from '@/lib/preferences/affinity';
import { mergeForYouAffinityCandidates } from '@/lib/preferences/forYouFeed';

describe('forYouFeed', () => {
  it('incorpora ofertas recientes solo si encajan con la afinidad del usuario', () => {
    const affinity = buildAffinityFromPreferredSelections(['amazon']);
    const top = [{ id: 'a', store: 'Amazon México', category: 'tecnologia', ranking_blend: 50 }];
    const recent = [
      { id: 'b', store: 'Amazon México', category: 'tecnologia', ranking_blend: 0 },
      { id: 'c', store: 'Walmart', category: 'super', ranking_blend: 0 },
    ];
    const merged = mergeForYouAffinityCandidates(top, recent, affinity);
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('entre coincidencias de afinidad prioriza las más recientes', () => {
    const affinity = buildAffinityFromPreferredSelections(['amazon']);
    const offers = [
      { store: 'Amazon México', category: 'tecnologia', ranking_blend: 100, created_at: '2026-10-01T00:00:00Z' },
      { store: 'Amazon México', category: 'tecnologia', ranking_blend: 1, created_at: '2026-10-14T00:00:00Z' },
    ];
    const sorted = sortOffersByAffinity(offers, affinity);
    expect(sorted[0].created_at).toBe('2026-10-14T00:00:00Z');
  });
});
