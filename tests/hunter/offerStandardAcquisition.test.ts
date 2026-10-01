import { describe, expect, it } from 'vitest';
import type { IngestItem } from '@/lib/bots/ingest/types';
import {
  classifyAcquisitionCandidate,
  classifyOfferFamily,
  matchDemandCatalog,
  parseUnitEconomics,
  prioritizeAcquisitionPool,
} from '@/lib/hunter/offerStandard';
import { NICHE_DAY_TO_DAY, NICHE_ELECTRONICS } from '@/lib/hunter/supply/nicheProfiles';
import { HUNTER_MODULES } from '@/lib/hunter/modules';

function item(url: string, title?: string): IngestItem {
  return {
    url,
    source: 'ml_api_legacy',
    precomputedMeta: title
      ? {
          canonicalUrl: url,
          title,
          store: 'mercadolibre',
          imageUrl: 'https://http2.mlstatic.com/x.jpg',
          discountPrice: 199,
          originalPrice: 399,
          discountPercent: 50,
        }
      : undefined,
  };
}

describe('Offer Standard acquisition', () => {
  it('clasifica premium crush y demanda alta en flagship', () => {
    const rec = classifyAcquisitionCandidate({
      title: 'Samsung Galaxy S25 Ultra 256 GB',
      currentPrice: 18999,
    });
    expect(rec.family).toBe('premium_crush');
    expect(rec.demandScore).toBeGreaterThanOrEqual(5);
    expect(rec.brand).toBe('samsung');
    expect(rec.acquisitionScore).toBeGreaterThan(80);
  });

  it('stock-up extrae pack y no usa el % de etiqueta como definición', () => {
    expect(classifyOfferFamily('Persil detergente líquido 6.64 L')).toBe('stock_up');
    const units = parseUnitEconomics('Regio papel higiénico 18 rollos', 189);
    expect(units.packCount).toBe(18);
    expect(units.unitPrice).toBeCloseTo(10.5, 1);
  });

  it('claves digitales / launcher dudoso van a anomaly con score bajo', () => {
    const rec = classifyAcquisitionCandidate({
      title: 'Far Cry 6 Complete Edition clave Nuuvem',
    });
    expect(rec.family).toBe('anomaly');
    expect(rec.acquisitionScore).toBeLessThanOrEqual(18);
  });

  it('no pega marcas cortas dentro de otras palabras', () => {
    expect(matchDemandCatalog('Interface HDMI cable')).toBeNull();
    expect(matchDemandCatalog('ACE detergente en polvo 9kg')?.brand).toBe('ace');
  });

  it('prioriza demanda y aplaza duplicados de familia sin borrar el pool', () => {
    const pool = prioritizeAcquisitionPool([
      item('https://a/1', 'Far Cry 6 Complete Edition clave Nuuvem'),
      item('https://a/2', 'Samsung Galaxy S25 Ultra 256 GB'),
      item('https://a/3', 'Samsung Galaxy S25 128 GB'),
      item('https://a/4'),
      item('https://a/5', 'Nike Dunk Low Panda'),
    ]);
    expect(pool.map((p) => p.url)).toEqual([
      'https://a/2',
      'https://a/5',
      'https://a/4',
      'https://a/1',
      'https://a/3',
    ]);
  });

  it('amplía queries de nicho hacia marca/modelo y stock-up', () => {
    expect(NICHE_ELECTRONICS.mlQueries).toEqual(
      expect.arrayContaining(['samsung galaxy s25 oferta', 'hisense tv oferta', 'motorola edge oferta']),
    );
    expect(NICHE_DAY_TO_DAY.mlQueries).toEqual(
      expect.arrayContaining(['persil oferta', 'colgate pack oferta', 'papel higienico oferta']),
    );
    expect(NICHE_ELECTRONICS.mlCategoryIds).toContain('MLM1051');
  });

  it('el ranking no sustituye DQE: el módulo es de adquisición', () => {
    expect(HUNTER_MODULES.some((m) => m.id === 'offer_standard' && m.status === 'live')).toBe(true);
    expect(HUNTER_MODULES.some((m) => m.id === 'deal_quality')).toBe(true);
  });
});
