import { describe, expect, it } from 'vitest';
import { isMercadoLibreHost, resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';

describe('host Mercado Libre estricto', () => {
  it.each(['mercadolibre.com.mx', 'www.mercadolibre.com.mx', 'articulo.mercadolibre.com.mx', 'meli.la', 'MercadoLibre.com.MX'])(
    'acepta %s',
    (host) => expect(isMercadoLibreHost(host)).toBe(true),
  );

  it.each([
    'mercadolibre.evil.com',
    'mercadolibre.com.mx.evil.com',
    'evilmercadolibre.com.mx',
    'notmeli.la',
    'meli.la.evil.com',
    'example.com',
  ])('rechaza %s', (host) => expect(isMercadoLibreHost(host)).toBe(false));

  it('resolveMercadoLibreItem no resuelve hosts que solo contienen la marca', () => {
    expect(resolveMercadoLibreItem('https://mercadolibre.evil.com/MLM-1234567890-x')).toBeNull();
    expect(resolveMercadoLibreItem('https://articulo.mercadolibre.com.mx/MLM-1234567890-x')).not.toBeNull();
  });

  it('la marca en la query de otro host no activa etiquetas ML', () => {
    const prev = process.env.ML_AFFILIATE_TAG;
    process.env.ML_AFFILIATE_TAG = 'aventa_test';
    try {
      const foreign = 'https://www.example.com/p?ref=mercadolibre.com.mx';
      expect(applyPlatformAffiliateTags(foreign)).toBe(foreign);
    } finally {
      if (prev === undefined) delete process.env.ML_AFFILIATE_TAG;
      else process.env.ML_AFFILIATE_TAG = prev;
    }
  });
});
