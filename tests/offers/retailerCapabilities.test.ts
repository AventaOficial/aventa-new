import { describe, expect, it } from 'vitest';
import {
  OFFER_URL_EXTRACTION_CAPABILITIES,
  listFullDepthRetailers,
} from '@/lib/offers/productExtraction/retailerCapabilities';

describe('retailerCapabilities matrix', () => {
  it('Amazon, Mercado Libre, Walmart, Liverpool, Coppel y Elektra están en depth full', () => {
    const full = listFullDepthRetailers().map((c) => c.id);
    expect(full).toContain('amazon');
    expect(full).toContain('mercado_libre');
    expect(full).toContain('walmart_mx');
    expect(full).toContain('liverpool');
    expect(full).toContain('coppel');
    expect(full).toContain('elektra');
  });

  it('cada entrada tiene identity y multiImage definidos', () => {
    for (const c of OFFER_URL_EXTRACTION_CAPABILITIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(['full', 'generic', 'host_only']).toContain(c.depth);
      expect([
        'asin',
        'ml_item',
        'walmart_item',
        'liverpool_sku',
        'coppel_sku',
        'elektra_sku',
        'hostname',
        'none',
      ]).toContain(c.identity);
      expect(['strong', 'jsonld', 'weak']).toContain(c.multiImage);
    }
  });
});
