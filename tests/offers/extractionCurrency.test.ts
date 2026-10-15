import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { confirmedExtractionCurrency } from '@/lib/offers/sourceCurrency';
import { resolveStoreBrand } from '@/lib/stores/storeBrand';

describe('moneda confirmada de extracción', () => {
  it('Amazon México y Mercado Libre México confirman MXN por el host', () => {
    expect(confirmedExtractionCurrency({ pageUrl: 'https://www.amazon.com.mx/dp/B0TESTASIN' })).toBe('MXN');
    expect(confirmedExtractionCurrency({ pageUrl: 'https://www.mercadolibre.com.mx/p/MLM18625838?wid=MLM1413356802' })).toBe('MXN');
  });

  it('un host no mexicano no se asume en MXN', () => {
    expect(confirmedExtractionCurrency({ pageUrl: 'https://www.amazon.com/dp/B0TESTASIN' })).toBeNull();
    expect(confirmedExtractionCurrency({ pageUrl: 'https://www.mercadolibre.com.ar/p/MLA1' })).toBeNull();
    expect(confirmedExtractionCurrency({ apiCurrency: '$', pageUrl: 'https://www.amazon.com/dp/B0TESTASIN' })).toBeNull();
  });

  it('la moneda ISO de la API gana sobre el host', () => {
    expect(confirmedExtractionCurrency({
      apiCurrency: 'USD',
      pageUrl: 'https://www.mercadolibre.com.mx/p/MLM18625838',
    })).toBe('USD');
  });

  it('Walmart y Liverpool mexicanos quedan en el mismo contrato', () => {
    expect(confirmedExtractionCurrency({ pageUrl: 'https://www.walmart.com.mx/ip/producto/123' })).toBe('MXN');
    expect(confirmedExtractionCurrency({ pageUrl: 'https://www.liverpool.com.mx/tienda/pdp/x/1' })).toBe('MXN');
  });
});

describe('identidad visual de tiendas', () => {
  it('usa los logos originales existentes y conserva fallback para tiendas desconocidas', () => {
    expect(resolveStoreBrand('Amazon').logoSrc).toBe('/stores/amazon.svg');
    expect(resolveStoreBrand('Mercado Libre').logoSrc).toBe('/stores/mercado-libre.svg');

    const originalLogos: Array<[string, string]> = [
      ['Costco', '/stores/Costco-logo.jpg'],
      ['Liverpool', '/stores/liverpool.avif'],
      ['Bodega Aurrera', '/stores/bodega-aurrera-logo_freelogovectors.net_.png'],
      ['Chedraui', '/stores/chedraui-logo-png_seeklogo-29285.png'],
    ];

    for (const [name, expectedPath] of originalLogos) {
      const brand = resolveStoreBrand(name);
      expect(brand.logoSrc, name).toBe(expectedPath);
      expect(() => readFileSync(`public${expectedPath}`), name).not.toThrow();
    }

    for (const name of ['Walmart', 'Coppel', 'Elektra', "Sam's Club"]) {
      const logoSrc = resolveStoreBrand(name).logoSrc;
      expect(logoSrc, name).toMatch(/^\/stores\/.+\.(?:svg|png|jpe?g|webp|avif)$/i);
      expect(() => readFileSync(`public${logoSrc}`), name).not.toThrow();
    }

    const unknown = resolveStoreBrand('Ferretería local');
    expect(unknown.logoSrc).toBeNull();
    expect(unknown.name).toBe('Ferretería local');
    expect(unknown.initials).toBe('FL');
  });
});

describe('el formulario público no duplica la extracción', () => {
  it('la ruta delega en extractOfferFromUrl', () => {
    const source = readFileSync('app/api/parse-offer-url/route.ts', 'utf8');
    expect(source).toContain('extractOfferFromUrl');
    expect(source).not.toContain('fetchMercadoLibrePublicOffer');
    expect(source).not.toContain('parseAmazon');
  });
});
