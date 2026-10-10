import { describe, expect, it } from 'vitest';
import { deferDuplicateProducts } from '@/lib/offers/feedDiversity';
import { applyVitalesFeedTransform } from '@/lib/offers/homeFeedClient';

describe('diversidad del feed cotidiano', () => {
  it('deja pasar dos variantes y aplaza el resto sin borrarlas', () => {
    const items = [1, 2, 3, 4].map((n) => ({
      title: 'Pasta dental menta 100 ml',
      brand: 'Walmart',
      votes: { up: n, down: 0, score: n },
    }));
    const out = deferDuplicateProducts(items, 2);
    expect(out).toHaveLength(4);
    expect(out.slice(0, 2).every((item) => item.title.includes('Pasta'))).toBe(true);
    expect(out[2].votes.score).toBe(3);
  });

  it('Día a día sigue excluyendo el score alto y además aplaza duplicados', () => {
    const list = [
      { title: 'Té manzanilla', brand: 'Amazon', votes: { up: 0, down: 0, score: 90 } },
      { title: 'Creatina 300 g', brand: 'Amazon', votes: { up: 8, down: 0, score: 8 } },
      { title: 'Creatina 300 g', brand: 'Amazon', votes: { up: 7, down: 0, score: 7 } },
      { title: 'Creatina 300 g', brand: 'Amazon', votes: { up: 6, down: 0, score: 6 } },
      { title: 'Detergente líquido', brand: 'Soriana', votes: { up: 4, down: 0, score: 4 } },
    ];
    const out = applyVitalesFeedTransform(list, 10, 1);
    expect(out.some((item) => item.votes.score >= 90)).toBe(false);
    expect(out[0].title).not.toBe(out[1]?.title);
    expect(out.map((item) => item.title).filter((title) => title.startsWith('Creatina'))).toHaveLength(3);
  });
});
