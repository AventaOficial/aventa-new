import { describe, it, expect } from 'vitest';
import { isMeliLaShortUrl, isMercadoLibreOfferUrl } from '@/lib/offerUrl';

describe('Mercado Libre / meli.la URLs', () => {
  it('detecta acortador meli.la', () => {
    expect(isMeliLaShortUrl('https://meli.la/1LSWBZi')).toBe(true);
    expect(isMeliLaShortUrl('https://www.mercadolibre.com.mx/foo')).toBe(false);
  });

  it('trata meli.la y mercadolibre como ML para tag', () => {
    expect(isMercadoLibreOfferUrl('https://meli.la/21iQJYT')).toBe(true);
    expect(isMercadoLibreOfferUrl('https://articulo.mercadolibre.com.mx/MLM-123')).toBe(true);
  });
});
