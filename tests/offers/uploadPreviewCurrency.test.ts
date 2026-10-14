import { describe, expect, it } from 'vitest';
import { uploadPreviewCurrency } from '@/lib/offers/sourceCurrency';
import { presentOfferPrice } from '@/lib/formatPrice';
import { UNNORMALIZED_PRICE_LABEL } from '@/lib/money/types';

const SHORT = 'https://meli.la/2AbCdEf';

describe('moneda de la vista previa al subir', () => {
  it('un enlace corto usa la moneda que confirmó el análisis del enlace', () => {
    const currency = uploadPreviewCurrency({ offerUrl: SHORT, parsed: { url: SHORT, currency: 'MXN' } });
    expect(currency).toBe('MXN');
    expect(presentOfferPrice(1299, currency)).not.toBe(UNNORMALIZED_PRICE_LABEL);
  });

  it('sin análisis, se queda la regla por tienda', () => {
    expect(uploadPreviewCurrency({ offerUrl: 'https://www.amazon.com.mx/dp/B0TEST1234', parsed: null })).toBe('MXN');
    expect(uploadPreviewCurrency({ offerUrl: SHORT, parsed: null })).toBeNull();
  });

  it('un análisis de otro enlace no cuenta', () => {
    expect(
      uploadPreviewCurrency({ offerUrl: SHORT, parsed: { url: 'https://meli.la/otro', currency: 'MXN' } }),
    ).toBeNull();
  });

  it('una moneda que no es ISO no se acepta; el análisis no tapa a la tienda', () => {
    expect(uploadPreviewCurrency({ offerUrl: SHORT, parsed: { url: SHORT, currency: '$' } })).toBeNull();
    expect(uploadPreviewCurrency({ offerUrl: SHORT, parsed: { url: SHORT, currency: null } })).toBeNull();
    const ml = 'https://articulo.mercadolibre.com.mx/MLM-123';
    expect(uploadPreviewCurrency({ offerUrl: ml, parsed: { url: ml, currency: null } })).toBe('MXN');
  });

  it('una divisa extranjera confirmada no se muestra como pesos', () => {
    const us = 'https://www.amazon.com/dp/B0TEST1234';
    const currency = uploadPreviewCurrency({ offerUrl: us, parsed: { url: us, currency: 'USD' } });
    expect(currency).toBe('USD');
    expect(presentOfferPrice(50, currency)).toBe(UNNORMALIZED_PRICE_LABEL);
  });
});
