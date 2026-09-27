import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate/resolveAffiliateOfferUrl';
import { explainMercadoLibreImageGate, mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';
import { emptyParseOfferPayload, extractOfferFromUrl } from '@/lib/offers/offerExtraction/extractOfferFromUrl';
import { resolveAmazonOfferUrl } from '@/lib/offers/urlResolution/amazonResolver';

const fetchMlApiMock = vi.fn();

vi.mock('@/lib/integrations/mercadolibre/apiClient', () => ({
  fetchMlApi: (...args: unknown[]) => fetchMlApiMock(...args),
}));

const ITEM_A = 'https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123-O.jpg';
const OTHER = 'https://http2.mlstatic.com/D_NQ_NP_2X_BBB222-MLA999-O.jpg';

describe('outbound único', () => {
  const prev = process.env.AMAZON_ASSOCIATE_TAG;

  afterEach(() => {
    if (prev == null) delete process.env.AMAZON_ASSOCIATE_TAG;
    else process.env.AMAZON_ASSOCIATE_TAG = prev;
  });

  it('Amazon: la URL mostrada y la publicada son la misma llamada', async () => {
    process.env.AMAZON_ASSOCIATE_TAG = 'aventa-20';
    const input = 'https://www.amazon.com.mx/dp/B0TESTABCD';
    const shown = await resolveAndNormalizeAffiliateOfferUrl(input);
    const published = await resolveAndNormalizeAffiliateOfferUrl(input);
    expect(shown).toBe(published);
    expect(shown).toContain('tag=aventa-20');
    expect(shown).toContain('/dp/B0TESTABCD');
  });

  it('Mercado Libre y Liverpool no divergen entre dos llamadas', async () => {
    const ml = 'https://www.mercadolibre.com.mx/x/p/MLM12345678';
    const lvp = 'https://www.liverpool.com.mx/tienda/pdp/audifonos/110555444';
    expect(await resolveAndNormalizeAffiliateOfferUrl(ml)).toBe(await resolveAndNormalizeAffiliateOfferUrl(ml));
    expect(await resolveAndNormalizeAffiliateOfferUrl(lvp)).toBe(await resolveAndNormalizeAffiliateOfferUrl(lvp));
  });

  it('el lote no calcula outbound con otra función', () => {
    const service = readFileSync(join(process.cwd(), 'lib/offers/batch/service.ts'), 'utf8');
    expect(service).not.toContain('applyPlatformAffiliateTags');
    expect(service).toContain('core?.outboundUrl');
    const route = readFileSync(join(process.cwd(), 'app/api/parse-offer-url/route.ts'), 'utf8');
    expect(route).toContain('outcome.body');
    expect(route).not.toContain('extractLiverpoolProduct');
  });
});

describe('Amazon extraction core', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('canonical /dp y variant th', async () => {
    const r = await resolveAmazonOfferUrl('https://www.amazon.com.mx/gp/product/B0TESTABCD?th=1&tag=old');
    expect(r.canonicalUrl).toContain('/dp/B0TESTABCD');
    expect(r.canonicalUrl).not.toContain('tag=');
    expect(r.variantIdentity).toBe('1');
    expect(r.productFingerprint).toBe('amz:B0TESTABCD');
  });

  it('happy path no inventa seller ni disponibilidad', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          '<html><head><meta property="og:title" content="Kindle Paperwhite"/><meta property="og:image" content="https://m.media-amazon.com/images/I/71TESTIMG1.jpg"/></head><span id="productTitle">Kindle Paperwhite</span></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        ),
      ),
    );
    const outcome = await extractOfferFromUrl('https://www.amazon.com.mx/dp/B0TESTABCD');
    expect(outcome.body.title).toMatch(/Kindle/);
    expect(outcome.body.images.length).toBeGreaterThan(0);
    expect(outcome.core.identity.productId).toBe('B0TESTABCD');
    expect(outcome.core.canonicalUrl).toContain('/dp/B0TESTABCD');
    expect(outcome.core.merchant.seller).toBeNull();
    expect(outcome.core.availability.status).toBeNull();
    expect(outcome.core.product.brand).toBeNull();
    expect(outcome.core.merchant.sellerType).toBeNull();
    expect(outcome.core.fulfillment.installments).toBeNull();
    expect(outcome.core.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
    expect(outcome.core.diagnostics.accessFailure).toBeNull();
    expect(outcome.core.outboundUrl).toBe(
      await resolveAndNormalizeAffiliateOfferUrl(outcome.core.canonicalUrl || outcome.core.sourceUrl),
    );
    expect(outcome.body.reason).toBeNull();
  });

  it('bot wall deja la extracción vacía', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<html><title>Amazon.com.mx</title><form id="opfcaptcha"></form></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    const outcome = await extractOfferFromUrl('https://www.amazon.com.mx/dp/B0TESTABCD');
    expect(outcome.body.images).toEqual([]);
    expect(outcome.body.title).toBeNull();
    expect(outcome.core.merchant.seller).toBeNull();
    expect(outcome.core.extraction.status).toBe('partial');
    expect(outcome.core.identity.productId).toBe('B0TESTABCD');
    expect(outcome.core.diagnostics.accessFailure).toBe('ACCESS_BLOCKED');
    expect(outcome.core.extraction.warnings).toContain('ACCESS_BLOCKED');
  });

  it('una ficha leída sin precio no se marca como bloqueo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          '<html><span id="productTitle">Kindle Paperwhite</span><meta property="og:image" content="https://m.media-amazon.com/images/I/71TESTIMG1.jpg"/></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        ),
      ),
    );
    const outcome = await extractOfferFromUrl('https://www.amazon.com.mx/dp/B0TESTABCD');
    expect(outcome.core.product.title).toMatch(/Kindle/);
    expect(outcome.core.pricing.currentPrice).toBeNull();
    expect(outcome.core.diagnostics.accessFailure).toBeNull();
    expect(outcome.core.extraction.warnings).toContain('NO_PRICE');
    expect(outcome.core.extraction.warnings).not.toContain('ACCESS_BLOCKED');
    expect(outcome.core.extraction.warnings).not.toContain('TIMEOUT');
  });

  it('un timeout no se confunde con una ficha sin precio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }),
    );
    const outcome = await extractOfferFromUrl('https://www.amazon.com.mx/dp/B0TESTABCD');
    expect(outcome.core.diagnostics.accessFailure).toBe('TIMEOUT');
    expect(outcome.core.pricing.currentPrice).toBeNull();
    expect(outcome.core.extraction.warnings).toContain('TIMEOUT');
    expect(outcome.core.extraction.warnings).not.toContain('ACCESS_BLOCKED');
  });

  it('la marca solo entra si el JSON-LD es de ese ASIN', async () => {
    const html = `<html><script type="application/ld+json">{"@type":"Product","sku":"B0OTRO9999","brand":{"@type":"Brand","name":"Ajeno"}}</script><script type="application/ld+json">{"@type":"Product","sku":"B0TESTABCD","name":"Kindle","brand":{"@type":"Brand","name":"Amazon"},"offers":{"@type":"Offer","availability":"https://schema.org/InStock","price":"1999"}}</script><meta property="og:title" content="Kindle"/><meta property="og:image" content="https://m.media-amazon.com/images/I/71TESTIMG1.jpg"/></html>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })));
    const outcome = await extractOfferFromUrl('https://www.amazon.com.mx/dp/B0TESTABCD');
    expect(outcome.core.product.brand).toBe('Amazon');
    expect(outcome.core.availability.status).toBe('InStock');
    expect(outcome.core.product.brand).not.toBe('Ajeno');
    expect(outcome.body.title).toBe(outcome.core.product.title);
  });
});

describe('ML image gate', () => {
  it('API 1 + HTML de otro listing no se mezcla', () => {
    const accepted = mergeMercadoLibreImageCandidates({
      apiPictures: [ITEM_A],
      htmlImages: [OTHER, OTHER],
      productScopedHtmlImages: [],
    });
    expect(accepted).toEqual([ITEM_A]);
    expect(accepted).not.toContain(OTHER);
    const gate = explainMercadoLibreImageGate({
      apiPictures: [ITEM_A],
      htmlImages: [OTHER, OTHER],
      accepted,
    });
    expect(gate.apiCount).toBe(1);
    expect(gate.acceptedCount).toBe(1);
    expect(gate.rejectedCount).toBeGreaterThan(0);
    expect(gate.rejectReason).toBe('unverified_other_listing');
  });
});

describe('Mercado Libre y Liverpool en el core', () => {
  afterEach(() => {
    fetchMlApiMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('lee seller, marca, disponibilidad y envío del mismo item', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (String(path).includes('/prices') || String(path).includes('/sale_price')) {
        return { ok: false, status: 404, authenticated: true };
      }
      if (String(path).startsWith('/items/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            title: 'Audifonos',
            price: 499,
            original_price: 799,
            status: 'active',
            seller: { nickname: 'AudioShop' },
            attributes: [{ id: 'BRAND', value_name: 'Sony' }, { id: 'MODEL', value_name: 'WH' }],
            shipping: { mode: 'me2' },
            pictures: [{ id: 'AAA111', secure_url: 'https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-O.jpg' }],
            permalink: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-audifonos',
          },
        };
      }
      if (String(path).startsWith('/products/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            name: 'Catalogo hermano',
            pictures: [{ id: 'OTRO999', url: 'https://http2.mlstatic.com/D_NQ_NP_2X_OTRO999-O.jpg' }],
          },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          '<html><img src="https://http2.mlstatic.com/D_NQ_NP_2X_OTROHTML-O.jpg"/></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        ),
      ),
    );
    const outcome = await extractOfferFromUrl(
      'https://articulo.mercadolibre.com.mx/MLM-1234567890-audifonos',
    );
    expect(outcome.core.merchant.seller).toBe('AudioShop');
    expect(outcome.core.product.brand).toBe('Sony');
    expect(outcome.core.availability.status).toBe('active');
    expect(outcome.core.fulfillment.shipping).toBe('me2');
    expect(outcome.core.merchant.sellerType).toBeNull();
    expect(outcome.core.fulfillment.installments).toBeNull();
    expect(outcome.core.media.images.join(' ')).not.toContain('OTRO999');
    expect(outcome.core.media.images.join(' ')).not.toContain('OTROHTML');
    expect(outcome.core.identity.productId).toContain('MLM');
    expect(outcome.body.suggested_discount_price).toBe(outcome.core.pricing.currentPrice);
    expect(outcome.core.outboundUrl).toBe(
      await resolveAndNormalizeAffiliateOfferUrl(outcome.core.canonicalUrl || outcome.core.sourceUrl),
    );
  });

  it('Liverpool toma marca y disponibilidad solo del JSON-LD de ese SKU', async () => {
    const html = `<html><script type="application/ld+json">{"@type":"Product","name":"Audifonos Sony","sku":"999000111","brand":{"name":"Otra"},"offers":{"price":"10","availability":"https://schema.org/OutOfStock"}}</script><script type="application/ld+json">{"@type":"Product","name":"Audifonos Sony","sku":"110555444","brand":{"name":"Sony"},"image":"https://sscdn.liverpool.com.mx/a.jpg","offers":{"@type":"Offer","price":"1599","priceCurrency":"MXN","availability":"https://schema.org/InStock"}}</script></html>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })));
    const outcome = await extractOfferFromUrl(
      'https://www.liverpool.com.mx/tienda/pdp/audifonos/110555444',
    );
    expect(outcome.core.identity.productFingerprint).toBe('lvp:110555444');
    expect(outcome.core.canonicalUrl).toContain('110555444');
    expect(outcome.core.product.brand).toBe('Sony');
    expect(outcome.core.availability.status).toBe('InStock');
    expect(outcome.core.merchant.seller).toBeNull();
    expect(outcome.core.pricing.currentPrice).not.toBeNull();
    expect(outcome.core.outboundUrl).toBe(
      await resolveAndNormalizeAffiliateOfferUrl(outcome.core.canonicalUrl || outcome.core.sourceUrl),
    );
  });
});

describe('ParseOfferPayload compatibility', () => {
  it('el payload vacío conserva las claves públicas', () => {
    const body = emptyParseOfferPayload('invalid_url');
    expect(body).toMatchObject({
      title: null,
      image: null,
      images: [],
      store: null,
      suggested_discount_price: null,
      suggested_original_price: null,
      suggested_category: null,
      reason: 'invalid_url',
      extraction_status: 'failed',
      missing: [],
    });
  });
});

describe('una sola autoridad de extracción', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/parse-offer-url/route.ts'), 'utf8');
  const batch = readFileSync(join(process.cwd(), 'lib/offers/batch/service.ts'), 'utf8');

  it('el formulario público y el lote llaman al mismo extractor', () => {
    expect(route).toContain('extractOfferFromUrl');
    expect(route).toContain('outcome.body');
    expect(route).toContain('enforceRateLimitCustom');
    expect(route).toContain("headers.get('authorization')");
    expect(batch).toContain('extractOfferFromUrl');
    expect(route).not.toContain('extractWalmartProduct');
    expect(route).not.toContain('extractLiverpoolProduct');
    expect(route).not.toContain('fetchFollowingRedirectsSafely');
    expect(route).not.toContain('resolveOfferUrl');
    expect(route).not.toContain('createCommunityOffer');
    expect(route).not.toContain('insertIngestedOffer');
    expect(route).not.toMatch(/from\('offers'\)/);
  });

  it('una URL inválida no se presenta como éxito', async () => {
    const outcome = await extractOfferFromUrl('esto-no-es-url');
    expect(outcome.body.reason).toBe('invalid_url');
    expect(outcome.body.extraction_status).toBe('failed');
    expect(outcome.body.title).toBeNull();
    expect(outcome.body.suggested_discount_price).toBeNull();
    expect(outcome.core.product.title).toBeNull();
  });

  it('un host fuera de la allowlist no se descarga', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const blocked = await extractOfferFromUrl('https://evil.example/producto');
    const local = await extractOfferFromUrl('https://127.0.0.1/latest/meta-data');
    expect(blocked.httpStatus).toBe(400);
    expect(blocked.adapter.blockedByHostPolicy).toBe(true);
    expect(blocked.body.reason).toBe('invalid_url');
    expect(blocked.body.title).toBeNull();
    expect(local.httpStatus).toBe(400);
    expect(local.adapter.blockedByHostPolicy).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('Walmart entra por el mismo extractor y no inventa seller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          '<html><meta property="og:title" content="Taladro W"/><meta property="og:image" content="https://i5.walmartimages.com.mx/asr/one.jpg"/></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        ),
      ),
    );
    const outcome = await extractOfferFromUrl('https://www.walmart.com.mx/ip/taladro/12345678');
    expect(outcome.core.provider).toBe('walmart');
    expect(outcome.body.title).toMatch(/Taladro/);
    expect(outcome.body.images.length).toBeGreaterThan(0);
    expect(outcome.core.canonicalUrl).toContain('/ip/12345678');
    expect(outcome.core.merchant.seller).toBeNull();
    expect(outcome.body.title).toBe(outcome.core.product.title);
    vi.unstubAllGlobals();
  });
});
