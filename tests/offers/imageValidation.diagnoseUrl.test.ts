import { describe, expect, it } from 'vitest';
import { validateOfferImageUrl } from '@/lib/offers/imageValidation';
import { diagnoseOfferUrl } from '@/lib/offers/diagnoseOfferUrl';

describe('imageValidation', () => {
  it('flags missing and junk', () => {
    expect(validateOfferImageUrl(null).status).toBe('missing');
    expect(validateOfferImageUrl('https://aventaofertas.com/placeholder.png').status).toBe(
      'broken_url',
    );
    expect(
      validateOfferImageUrl('https://http2.mlstatic.com/D_NQ_NP_123-MLA-F.jpg', {
        titleHint: 'Audífonos',
      }).status,
    ).toBe('ok');
  });

  it('flags tiny amazon thumbs', () => {
    const r = validateOfferImageUrl(
      'https://m.media-amazon.com/images/I/61ABC._AC_US40_.jpg',
      { titleHint: 'Producto' },
    );
    expect(r.status).toBe('tiny_thumb');
  });
});

describe('diagnoseOfferUrl (offline stages)', () => {
  it('rejects unsupported hosts without probing', async () => {
    const d = await diagnoseOfferUrl('https://example.com/product/1', {
      probeDestination: false,
    });
    expect(d.parserStatus).toBe('unsupported');
    expect(d.failureStage).toBe('retailer_detect');
  });

  it('classifies mercado libre identity from full URL without probe', async () => {
    const d = await diagnoseOfferUrl(
      'https://www.mercadolibre.com.mx/x/p/MLM1234567890',
      { probeDestination: false },
    );
    expect(d.retailer).toBe('mercado_libre');
    expect(d.parserStatus).toBe('ok');
    expect(d.normalizedUrl).toContain('mercadolibre');
  });

  it('classifies amazon ASIN paths', async () => {
    const d = await diagnoseOfferUrl(
      'https://www.amazon.com.mx/dp/B08N5WRWNW',
      { probeDestination: false },
    );
    expect(d.retailer).toBe('amazon');
    expect(d.parserStatus).toBe('ok');
  });
});
