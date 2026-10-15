import { describe, expect, it } from 'vitest';
import {
  applySearchPriceAlternates,
  organizeSearchHits,
  searchHitVoteScore,
} from '@/lib/offers/organizeSearchHits';
import type { PublicSearchHit } from '@/lib/offers/searchPublicOffers';

const AMZ = 'https://www.amazon.com.mx/dp/B08N5WRWNW';

function hit(
  id: string,
  overrides: Partial<PublicSearchHit> & { price: number; original_price?: number | null },
): PublicSearchHit {
  return {
    id,
    title: 'Producto',
    price: overrides.price,
    original_price: overrides.original_price ?? 1000,
    image_url: null,
    image_urls: null,
    msi_months: null,
    bank_coupon: null,
    store: 'ML',
    offer_url: overrides.offer_url ?? AMZ,
    description: null,
    hunter_comment: null,
    steps: null,
    conditions: null,
    coupons: null,
    created_at: null,
    created_by: null,
    up_votes: overrides.up_votes ?? 0,
    down_votes: overrides.down_votes ?? 0,
    score: overrides.score ?? 0,
    ranking_momentum: overrides.ranking_momentum ?? null,
    ranking_blend: overrides.ranking_blend ?? null,
    ...overrides,
  };
}

describe('organizeSearchHits', () => {
  it('colapsa el mismo producto y prioriza votos en la tarjeta', () => {
    const hits = [
      hit('cheap', { price: 400, score: 1, ranking_momentum: 1 }),
      hit('popular', { price: 500, score: 20, ranking_momentum: 20 }),
    ];
    const { hits: out, priceAlternateByLeaderId } = organizeSearchHits(hits);
    expect(out.map((h) => h.id)).toEqual(['popular']);
    expect(priceAlternateByLeaderId.get('popular')).toEqual({
      offer_id: 'cheap',
      price: 400,
      discount_pct: 60,
    });
  });

  it('mantiene el orden de relevancia por primera aparición del grupo', () => {
    const other = hit('other', { price: 99, offer_url: 'https://www.amazon.com.mx/dp/B09V3KXJPB' });
    const a = hit('a1', { price: 500, ranking_momentum: 5 });
    const a2 = hit('a2', { price: 400, ranking_momentum: 10 });
    const { hits: out } = organizeSearchHits([other, a, a2]);
    expect(out.map((h) => h.id)).toEqual(['other', 'a2']);
  });

  it('applySearchPriceAlternates adjunta el campo en el hit', () => {
    const map = new Map([['lead', { offer_id: 'alt', price: 1, discount_pct: 90 }]]);
    const [row] = applySearchPriceAlternates([hit('lead', { price: 2 })], map);
    expect(row.search_price_alternate?.offer_id).toBe('alt');
  });
});

describe('searchHitVoteScore', () => {
  it('prefiere ranking_momentum', () => {
    expect(searchHitVoteScore(hit('x', { price: 1, ranking_momentum: 7, score: 2 }))).toBe(7);
  });
});
