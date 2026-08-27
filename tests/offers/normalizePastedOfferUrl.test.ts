import { describe, expect, it } from 'vitest';
import { normalizePastedOfferUrl } from '../../lib/offerUrl';

describe('normalizePastedOfferUrl', () => {
  it('añade https cuando falta el protocolo', () => {
    expect(normalizePastedOfferUrl('www.amazon.com.mx/dp/B0TEST')).toBe(
      'https://www.amazon.com.mx/dp/B0TEST',
    );
    expect(normalizePastedOfferUrl('articulo.mercadolibre.com.mx/MLM-123')).toBe(
      'https://articulo.mercadolibre.com.mx/MLM-123',
    );
  });

  it('conserva URLs con https y elimina espacios', () => {
    expect(normalizePastedOfferUrl('  https://www.mercadolibre.com.mx/p/MLM1  ')).toBe(
      'https://www.mercadolibre.com.mx/p/MLM1',
    );
  });
});
