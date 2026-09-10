import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  extractMercadoLibreItemId,
  normalizeMercadoLibreInputUrl,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';
import {
  isRejectedMercadoLibreImage,
  mergeMlImageCandidates,
  picturesFromMlVariations,
} from '@/lib/offers/mlImageProvenance';
import { mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';
import { normalizePastedOfferUrl, applyMercadoLibreAffiliateTag } from '@/lib/offerUrl';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';
import { validatePublicOfferUrl } from '@/lib/server/validatePublicOfferUrl';

const LONG_SHARE_URL =
  'https://www.mercadolibre.com.mx/p/MLM18625838?pdp_filters=item_id:MLM1413356802&matt_tool=17030900#origin=share&sid=share&wid=MLM1413356802&action=copy';

describe('resolveMercadoLibreItem', () => {
  it('1. URL corta ML path articulo', () => {
    expect(
      extractMercadoLibreItemId('https://articulo.mercadolibre.com.mx/MLM-1234567890-espejo-_JM'),
    ).toBe('MLM1234567890');
  });

  it('2. URL larga share ML → item real', () => {
    const r = resolveMercadoLibreItem(LONG_SHARE_URL);
    expect(r?.itemId).toBe('MLM1413356802');
    expect(r?.siteId).toBe('MLM');
    expect(r?.catalogProductId).toBe('MLM18625838');
    expect(r?.confidence).toBe('high');
  });

  it('3. URL con query wid', () => {
    expect(extractMercadoLibreItemId('https://www.mercadolibre.com.mx/p/foo?wid=MLM1234567890')).toBe(
      'MLM1234567890',
    );
  });

  it('4. URL con hash wid (mobile share)', () => {
    const r = resolveMercadoLibreItem(
      'https://www.mercadolibre.com.mx/p/MLM18625838#wid=MLM1413356802&action=copy',
    );
    expect(r?.itemId).toBe('MLM1413356802');
    expect(r?.resolutionMethod).toBe('hash_wid');
  });

  it('5. URL con query + hash', () => {
    const r = resolveMercadoLibreItem(LONG_SHARE_URL);
    expect(r?.itemId).toBe('MLM1413356802');
    expect(r?.resolutionMethod).toBe('query_pdp_filters');
  });

  it('6. item_id dentro de pdp_filters', () => {
    const r = resolveMercadoLibreItem(
      'https://www.mercadolibre.com.mx/p/MLM1?pdp_filters=item_id:MLM1413356802',
    );
    expect(r?.itemId).toBe('MLM1413356802');
    expect(r?.resolutionMethod).toBe('query_pdp_filters');
  });

  it('7. item_id dentro de wid', () => {
    expect(extractMercadoLibreItemId('https://www.mercadolibre.com.mx/p/x?wid=MLM9998887776')).toBe(
      'MLM9998887776',
    );
  });

  it('8. item_id canonical path_catalog', () => {
    const r = resolveMercadoLibreItem('https://www.mercadolibre.com.mx/p/MLM67398689');
    expect(r?.itemId).toBe('MLM67398689');
    expect(r?.resolutionMethod).toBe('path_catalog');
    expect(r?.confidence).toBe('low');
  });

  it('9. malformed URL → null', () => {
    expect(resolveMercadoLibreItem('not-a-url')).toBeNull();
  });

  it('10. non-ML URL → null', () => {
    expect(resolveMercadoLibreItem('https://www.amazon.com.mx/dp/B0TESTASI1')).toBeNull();
  });

  it('canonical URL incluye wid del item real', () => {
    const r = resolveMercadoLibreItem(LONG_SHARE_URL);
    expect(r?.canonicalUrl).toContain('MLM18625838');
    expect(r?.canonicalUrl).toContain('wid=MLM1413356802');
  });
});

describe('normalize paste (mobile clipboard)', () => {
  it('whitespace + newline', () => {
    const pasted = '  https://www.mercadolibre.com.mx/p/MLM1\n?wid=MLM1413356802  ';
    expect(normalizeMercadoLibreInputUrl(pasted)).toBe(
      'https://www.mercadolibre.com.mx/p/MLM1?wid=MLM1413356802',
    );
    expect(normalizePastedOfferUrl(pasted)).toBe(
      'https://www.mercadolibre.com.mx/p/MLM1?wid=MLM1413356802',
    );
  });

  it('agrega https si falta', () => {
    expect(normalizePastedOfferUrl('mercadolibre.com.mx/p/MLM1')).toBe(
      'https://mercadolibre.com.mx/p/MLM1',
    );
  });

  it('preserva fragment hash', () => {
    const url = 'https://www.mercadolibre.com.mx/p/MLM1#wid=MLM999';
    expect(normalizePastedOfferUrl(url)).toBe(url);
  });

  it('encoded characters + long query', () => {
    const url =
      'https://www.mercadolibre.com.mx/p/MLM1?pdp_filters=item_id%3AMLM1413356802&foo=bar%20baz';
    const n = normalizePastedOfferUrl(url);
    expect(resolveMercadoLibreItem(n)?.itemId).toBe('MLM1413356802');
  });

  it('trailing slash + host case', () => {
    const r = resolveMercadoLibreItem('HTTPS://WWW.MERCADOLIBRE.COM.MX/p/MLM18625838/?wid=MLM1413356802');
    expect(r?.itemId).toBe('MLM1413356802');
    expect(r?.siteId).toBe('MLM');
  });

  it('validatePublicOfferUrl acepta URL larga pegada con saltos', () => {
    const pasted = `${LONG_SHARE_URL.slice(0, 40)}\n${LONG_SHARE_URL.slice(40)}`;
    const result = validatePublicOfferUrl(pasted);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(extractMercadoLibreItemId(result.href)).toBe('MLM1413356802');
    }
  });
});

describe('ML images provenance + rejection', () => {
  const ITEM_A = 'https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123-O.jpg';
  const ITEM_B = 'https://http2.mlstatic.com/D_NQ_NP_2X_BBB222-MLA123-O.jpg';
  const RELATED = 'https://http2.mlstatic.com/D_NQ_NP_2X_CCC333-MLA999-O.jpg';
  const BANNER = 'https://http2.mlstatic.com/D_NQ_NP_2X_banner-promo-MLA999-O.jpg';
  const LOGO = 'https://aventaofertas.com/logo.png';
  const RECOMMEND = 'https://http2.mlstatic.com/D_NQ_NP_2X_recommend-carousel-O.jpg';

  it('21-22. banner y logo rechazados', () => {
    expect(isRejectedMercadoLibreImage(BANNER, 'MLM1')).toBe(true);
    expect(isRejectedMercadoLibreImage(LOGO, 'MLM1')).toBe(true);
    expect(isRejectedMercadoLibreImage(RECOMMEND, 'MLM1')).toBe(true);
  });

  it('19. wrong item images rejected por provenance', () => {
    const merged = mergeMlImageCandidates(
      [
        [
          {
            url: ITEM_A,
            source: 'ml_api',
            sourceItemId: 'MLM1413356802',
            pictureId: 'A',
            isPrimary: true,
          },
          {
            url: RELATED,
            source: 'ml_api',
            sourceItemId: 'MLM9999999999',
            pictureId: 'R',
            isPrimary: false,
          },
        ],
      ],
      { sourceItemId: 'MLM1413356802' },
    );
    expect(merged.map((c) => c.url)).toEqual([ITEM_A]);
  });

  it('17-18. API + variation images del mismo item', () => {
    const vars = picturesFromMlVariations(
      { variations: [{ picture_ids: ['VAR111', 'VAR222'] }] },
      'MLM1413356802',
    );
    expect(vars).toHaveLength(2);
    expect(vars.every((c) => c.source === 'ml_api_variation')).toBe(true);
    expect(vars.every((c) => c.sourceItemId === 'MLM1413356802')).toBe(true);
  });

  it('20. recommended HTML no entra cuando API >=2', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [ITEM_A, ITEM_B],
      htmlImages: [RELATED, BANNER, RECOMMEND],
      sourceItemId: 'MLM1413356802',
      mlSource: 'ml_api',
    });
    expect(merged).toEqual([ITEM_A, ITEM_B]);
  });

  it('23. zero images → vacío', () => {
    expect(
      mergeMercadoLibreImageCandidates({
        apiPictures: [],
        htmlImages: [RELATED],
        trustedHtmlImages: [],
      }),
    ).toEqual([]);
  });

  it('24. one image API', () => {
    expect(
      mergeMercadoLibreImageCandidates({
        apiPictures: [ITEM_A],
        htmlImages: [RELATED],
        mlSource: 'ml_api',
        sourceItemId: 'MLM1',
      }),
    ).toEqual([ITEM_A]);
  });

  it('25. multiple images conservadas', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [ITEM_A, ITEM_B, ITEM_A],
      sourceItemId: 'MLM1',
      mlSource: 'ml_api',
    });
    expect(merged.length).toBe(2);
  });
});

describe('affiliate + URL layers', () => {
  const prevTag = process.env.ML_AFFILIATE_TAG;
  const prevTool = process.env.ML_MATT_TOOL;
  const prevWord = process.env.ML_MATT_WORD;

  beforeEach(() => {
    process.env.ML_AFFILIATE_TAG = 'aventa-test';
    process.env.ML_MATT_TOOL = '17030900';
    process.env.ML_MATT_WORD = 'aventa';
  });

  afterEach(() => {
    if (prevTag === undefined) delete process.env.ML_AFFILIATE_TAG;
    else process.env.ML_AFFILIATE_TAG = prevTag;
    if (prevTool === undefined) delete process.env.ML_MATT_TOOL;
    else process.env.ML_MATT_TOOL = prevTool;
    if (prevWord === undefined) delete process.env.ML_MATT_WORD;
    else process.env.ML_MATT_WORD = prevWord;
  });

  it('26. affiliate URL generated', () => {
    const tagged = applyPlatformAffiliateTags('https://www.mercadolibre.com.mx/p/MLM1?wid=MLM1413356802');
    expect(tagged).toContain('tag=aventa-test');
    expect(tagged).toContain('matt_tool=17030900');
  });

  it('27. affiliate missing cuando no hay env', () => {
    delete process.env.ML_AFFILIATE_TAG;
    delete process.env.ML_MATT_TOOL;
    delete process.env.ML_MATT_WORD;
    const plain = 'https://www.mercadolibre.com.mx/p/MLM1?wid=MLM1413356802';
    expect(applyPlatformAffiliateTags(plain)).toBe(plain);
  });

  it('28-30. original / canonical / monetized separados conceptualmente', () => {
    const original = LONG_SHARE_URL;
    const resolved = resolveMercadoLibreItem(original);
    const canonical = resolved?.canonicalUrl ?? '';
    const monetized = applyPlatformAffiliateTags(canonical);
    expect(original).toContain('matt_tool=17030900');
    expect(canonical).toContain('wid=MLM1413356802');
    expect(canonical).not.toContain('origin=share');
    expect(monetized).toContain('tag=aventa-test');
    expect(monetized).not.toBe(original);
    expect(applyMercadoLibreAffiliateTag(canonical, 'aventa-test')).toContain('tag=aventa-test');
  });
});

describe('fetchMercadoLibrePublicOffer API statuses', () => {
  const fetchMlApiMock = vi.fn();

  beforeEach(() => {
    fetchMlApiMock.mockReset();
    vi.resetModules();
    vi.doMock('@/lib/integrations/mercadolibre/apiClient', () => ({
      fetchMlApi: (...args: unknown[]) => fetchMlApiMock(...args),
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/lib/integrations/mercadolibre/apiClient');
    vi.resetModules();
  });

  it('11. API success', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.includes('/prices')) return { ok: false, status: 404, authenticated: true };
      if (path.startsWith('/items/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            title: 'Espejo',
            price: 100,
            pictures: [
              { id: 'P1', secure_url: 'https://http2.mlstatic.com/D_NQ_NP_2X_P1-O.jpg' },
              { id: 'P2', secure_url: 'https://http2.mlstatic.com/D_NQ_NP_2X_P2-O.jpg' },
            ],
          },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });
    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const r = await fetchMercadoLibrePublicOffer(
      'https://articulo.mercadolibre.com.mx/MLM-1413356802-x',
    );
    expect(r?.source).toBe('ml_api');
    expect(r?.pictures.length).toBeGreaterThanOrEqual(2);
    expect(r?.itemId).toBe('MLM1413356802');
  });

  it('12-15. API 401 / 403 / timeout / not found → null o sin inventar fotos', async () => {
    fetchMlApiMock.mockResolvedValue({
      ok: false,
      status: 401,
      authenticated: true,
      timedOut: false,
    });
    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const r401 = await fetchMercadoLibrePublicOffer(
      'https://articulo.mercadolibre.com.mx/MLM-1413356802-x',
    );
    expect(r401).toBeNull();

    fetchMlApiMock.mockResolvedValue({
      ok: false,
      status: 403,
      authenticated: true,
      timedOut: false,
    });
    const r403 = await fetchMercadoLibrePublicOffer(
      'https://articulo.mercadolibre.com.mx/MLM-1413356802-x',
    );
    expect(r403).toBeNull();

    fetchMlApiMock.mockResolvedValue({
      ok: false,
      status: 0,
      authenticated: true,
      timedOut: true,
    });
    await expect(
      fetchMercadoLibrePublicOffer('https://articulo.mercadolibre.com.mx/MLM-1413356802-x'),
    ).rejects.toThrow(/timeout|AbortError|ml_api_timeout/i);

    fetchMlApiMock.mockResolvedValue({
      ok: true,
      status: 200,
      authenticated: true,
      data: { error: 'not_found', message: 'Item not found' },
    });
    const missing = await fetchMercadoLibrePublicOffer(
      'https://articulo.mercadolibre.com.mx/MLM-0000000001-x',
    );
    expect(missing).toBeNull();
  });
});
