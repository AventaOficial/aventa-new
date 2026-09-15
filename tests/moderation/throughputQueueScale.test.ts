import { describe, expect, it } from 'vitest';
import { CLAIM_QUEUE_HARD_CAP, isSlaBreached } from '@/lib/moderation/slaContract';
import { sortPendingOffersForModeration } from '@/lib/moderation/sortPendingOffers';
import { evaluateModerationPriority } from '@/lib/moderation/moderationPriority';

const IMG = 'https://http2.mlstatic.com/D_NQ_NP_2X_123-O.jpg';

function botMeta(signals: Record<string, unknown>) {
  return {
    v: 1,
    source: 'ml_worker',
    signals,
  };
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

const strongSignals = {
  effectiveDiscountPercent: 22,
  suspectedArtificialListPrice: false,
  historyReady: true,
  habitual30d: 180,
};

describe('moderation queue scale + SLA ordering', () => {
  it('ordena 100/500/1000 candidatos sin O(N²) aparente y prioriza HIGH VALUE + breach', () => {
    for (const n of [100, 500, 1000] as const) {
      expect(n).toBeLessThanOrEqual(CLAIM_QUEUE_HARD_CAP);

      const offers = Array.from({ length: n }, (_, i) => {
        if (i === 0) {
          return {
            id: 'o-0',
            title: 'weak',
            price: 100,
            original_price: 500,
            image_url: IMG,
            category: 'tecnologia',
            created_at: hoursAgo(50),
            is_bot: true,
            bot_meta: botMeta({
              effectiveDiscountPercent: 0,
              suspectedArtificialListPrice: true,
              cardDiscountSource: 'badge_reconstructed',
              historyReady: false,
            }),
          };
        }
        if (i === 1) {
          return {
            id: 'o-1',
            title: 'fresh high',
            price: 100,
            original_price: 200,
            image_url: IMG,
            category: 'supermercado',
            created_at: hoursAgo(0.5),
            is_bot: true,
            bot_meta: botMeta(strongSignals),
          };
        }
        if (i === 2) {
          return {
            id: 'o-2',
            title: 'stale high',
            price: 100,
            original_price: 200,
            image_url: IMG,
            category: 'supermercado',
            created_at: hoursAgo(5),
            is_bot: true,
            bot_meta: botMeta(strongSignals),
          };
        }
        return {
          id: `o-${i}`,
          title: `Offer ${i}`,
          price: 80,
          original_price: 100,
          image_url: IMG,
          category: 'tecnologia',
          created_at: hoursAgo(1 + (i % 20)),
          is_bot: true,
          bot_meta: botMeta({
            effectiveDiscountPercent: 8,
            historyReady: false,
            habitual30d: 0,
            suspectedArtificialListPrice: false,
          }),
        };
      });

      const t0 = performance.now();
      const sorted = sortPendingOffersForModeration(offers);
      const elapsed = performance.now() - t0;

      expect(sorted).toHaveLength(n);
      expect(elapsed).toBeLessThan(2_000);

      const top = sorted[0]!;
      const topPri = evaluateModerationPriority({
        price: top.price,
        originalPrice: top.original_price,
        imageUrl: top.image_url,
        isBot: top.is_bot,
        createdAt: top.created_at,
        botMeta: top.bot_meta,
      });
      expect(topPri.priority).toBe('P1_HIGH_VALUE');
      const topAge = (Date.now() - new Date(top.created_at).getTime()) / 3_600_000;
      expect(isSlaBreached({ priority: topPri.priority, ageHours: topAge })).toBe(true);
      expect(top.id).toBe('o-2');

      const idxFresh = sorted.findIndex((o) => o.id === 'o-1');
      const idxBreach = sorted.findIndex((o) => o.id === 'o-2');
      expect(idxBreach).toBeLessThan(idxFresh);
    }
  });

  it('el hard cap documenta que claim nunca carga >1000 al sorter', () => {
    expect(CLAIM_QUEUE_HARD_CAP).toBe(1000);
  });
});
