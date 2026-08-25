import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRACKET_TARGETS,
  PRICE_BRACKETS,
  biggestGap,
  bracketForPrice,
  buildCatalogGaps,
  parseBracketTargets,
} from '@/lib/catalog/priceBrackets';

describe('bracketForPrice', () => {
  it('coloca cada precio en su rango', () => {
    expect(bracketForPrice(0)).toBe('hasta_200');
    expect(bracketForPrice(199.99)).toBe('hasta_200');
    expect(bracketForPrice(200)).toBe('de_200_1k');
    expect(bracketForPrice(999)).toBe('de_200_1k');
    expect(bracketForPrice(1000)).toBe('de_1k_3k');
    expect(bracketForPrice(2999)).toBe('de_1k_3k');
    expect(bracketForPrice(3000)).toBe('de_3k_10k');
    expect(bracketForPrice(9999)).toBe('de_3k_10k');
    expect(bracketForPrice(10000)).toBe('mas_10k');
    expect(bracketForPrice(250000)).toBe('mas_10k');
  });

  it('rechaza valores inválidos', () => {
    expect(bracketForPrice(null)).toBeNull();
    expect(bracketForPrice(undefined)).toBeNull();
    expect(bracketForPrice(-5)).toBeNull();
    expect(bracketForPrice(Number.NaN)).toBeNull();
  });

  it('cubre los cinco rangos acordados sin huecos', () => {
    expect(PRICE_BRACKETS).toHaveLength(5);
    for (let i = 1; i < PRICE_BRACKETS.length; i += 1) {
      expect(PRICE_BRACKETS[i].min).toBe(PRICE_BRACKETS[i - 1].max);
    }
    expect(PRICE_BRACKETS[PRICE_BRACKETS.length - 1].max).toBeNull();
  });
});

describe('parseBracketTargets', () => {
  it('usa los default cuando no hay config', () => {
    expect(parseBracketTargets(null)).toEqual(DEFAULT_BRACKET_TARGETS);
    expect(parseBracketTargets('nada')).toEqual(DEFAULT_BRACKET_TARGETS);
  });

  it('mezcla lo configurado e ignora basura', () => {
    const targets = parseBracketTargets({
      hasta_200: 40,
      de_200_1k: 'x',
      mas_10k: -3,
      inventado: 99,
    });
    expect(targets.hasta_200).toBe(40);
    expect(targets.de_200_1k).toBe(DEFAULT_BRACKET_TARGETS.de_200_1k);
    expect(targets.mas_10k).toBe(DEFAULT_BRACKET_TARGETS.mas_10k);
  });
});

describe('buildCatalogGaps', () => {
  it('calcula huecos y progreso', () => {
    const gaps = buildCatalogGaps(
      { hasta_200: 3, de_200_1k: 30, de_1k_3k: 0 },
      { hasta_200: 20, de_200_1k: 30, de_1k_3k: 25, de_3k_10k: 15, mas_10k: 10 }
    );
    const map = Object.fromEntries(gaps.map((g) => [g.id, g]));
    expect(map.hasta_200.missing).toBe(17);
    expect(map.hasta_200.fillPercent).toBe(15);
    expect(map.de_200_1k.missing).toBe(0);
    expect(map.de_200_1k.fillPercent).toBe(100);
    expect(map.de_1k_3k.missing).toBe(25);
  });

  it('encuentra el hueco más grande', () => {
    const gaps = buildCatalogGaps({ hasta_200: 19, de_1k_3k: 0 });
    expect(biggestGap(gaps)?.id).toBe('de_200_1k');
  });

  it('devuelve null si el catálogo está completo', () => {
    const gaps = buildCatalogGaps({
      hasta_200: 99,
      de_200_1k: 99,
      de_1k_3k: 99,
      de_3k_10k: 99,
      mas_10k: 99,
    });
    expect(biggestGap(gaps)).toBeNull();
  });
});
