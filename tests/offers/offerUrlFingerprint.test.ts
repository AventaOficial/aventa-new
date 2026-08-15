import { describe, it, expect } from 'vitest';
import {
  extractAmazonAsin,
  extractMercadoLibreItemId,
  offerUrlFingerprint,
  offerUrlsAreSameProduct,
} from '../../lib/offers/offerUrlFingerprint';

describe('offerUrlFingerprint', () => {
  it('trata la misma ML con distintos tags como el mismo producto', () => {
    const a =
      'https://www.mercadolibre.com.mx/algo/MLM1234567890?tag=plataforma-20';
    const b =
      'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo-_JM?tag=creador-20&matt_tool=1';
    // Path forms differ; wid/item id extraction should still match when id present
    const withWid =
      'https://www.mercadolibre.com.mx/p/foo?wid=MLM1234567890&tag=x';
    const withWid2 =
      'https://www.mercadolibre.com.mx/p/foo?wid=MLM1234567890&tag=y';
    expect(offerUrlsAreSameProduct(withWid, withWid2)).toBe(true);
    expect(extractMercadoLibreItemId(a)).toBe('MLM1234567890');
    expect(extractMercadoLibreItemId('https://articulo.mercadolibre.com.mx/MLM-1234567890-espejo-_JM')).toBe(
      'MLM1234567890',
    );
    expect(extractMercadoLibreItemId('https://www.mercadolibre.com.mx/p/MLM67398689')).toBe('MLM67398689');
    expect(offerUrlFingerprint(withWid)).toBe('ml:MLM1234567890');
  });

  it('trata el mismo ASIN Amazon con distintos tags como el mismo producto', () => {
    const a = 'https://www.amazon.com.mx/dp/B0TESTASI1?tag=aventa-20';
    const b = 'https://www.amazon.com.mx/gp/product/B0TESTASI1?tag=hunter-20';
    expect(extractAmazonAsin(a)).toBe('B0TESTASI1');
    expect(offerUrlsAreSameProduct(a, b)).toBe(true);
    expect(offerUrlFingerprint(a)).toBe('amz:B0TESTASI1');
  });

  it('no marca como duplicado productos distintos', () => {
    const a = 'https://www.amazon.com.mx/dp/B0AAAAAAA1?tag=x';
    const b = 'https://www.amazon.com.mx/dp/B0BBBBBBB2?tag=x';
    expect(offerUrlsAreSameProduct(a, b)).toBe(false);
  });
});
