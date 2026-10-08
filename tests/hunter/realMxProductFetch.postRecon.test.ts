/**
 * Post-recon MX product fetch — capa determinista de CI.
 *
 * Cubre el contrato de identidad, extracción y diagnósticos con fixtures
 * del extractor actual. No llama a Liverpool, Amazon ni Mercado Libre.
 *
 * La sonda contra retailers vivos vive en tests/probes/ y se ejecuta con
 * `npm run test:probes`. No forma parte de `npm run ci:verify`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchParsedOfferMetadataDetailed } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { extractLiverpoolDomPrices } from '@/lib/offers/productExtraction/liverpoolExtract';
import { extractLiverpoolProductId } from '@/lib/offers/urlResolution/liverpoolResolver';

const AMAZON_URL = 'https://www.amazon.com.mx/dp/B09V3KXJPB';
const LIVERPOOL_URL =
  'https://www.liverpool.com.mx/tienda/pdp/airpods-3-pro-inalambricos/1186100481';
const ML_URL = 'https://articulo.mercadolibre.com.mx/MLM-3536548700-audifonos-_JM';
const LIVERPOOL_HOME = 'https://www.liverpool.com.mx/tienda/home';

const LV_IMAGE_A = 'https://sscdn.liverpool.com.mx/xl/a.jpg';
const LV_IMAGE_B = 'https://sscdn.liverpool.com.mx/xl/b.jpg';
const AMZ_IMAGE = 'https://m.media-amazon.com/images/I/71TESTIMG1.jpg';
const ML_IMAGE = 'https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123-O.jpg';

/** Mismo JSON-LD Product que tests/offers/liverpoolExtract.test.ts (ListPrice / SalePrice). */
function liverpoolJsonLdProductHtml(): string {
  return `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'Audífonos Sony',
    image: [LV_IMAGE_A, LV_IMAGE_B],
    offers: {
      '@type': 'Offer',
      priceCurrency: 'MXN',
      priceSpecification: [
        {
          '@type': 'UnitPriceSpecification',
          priceType: 'https://schema.org/ListPrice',
          price: 2499,
        },
        {
          '@type': 'UnitPriceSpecification',
          priceType: 'https://schema.org/SalePrice',
          price: 1799,
        },
      ],
    },
  })}</script>`;
}

/** Mismo bloque SSR data-testid que tests/offers/liverpoolExtract.test.ts. */
function liverpoolDomPriceHtml(): string {
  return `
    <title>Audífonos Over-Ear Jbl LIVE 780NC inalámbricos | Liverpool</title>
    <div data-testid="1199845185-configurator-price">
      <span data-testid="discounted"><span>$<!-- -->2,969</span><span class="invisible">.</span>10</span>
      <span data-testid="original"><span class="line-through">$<!-- -->3,299</span><span class="invisible">.</span>00</span>
    </div>
    <p>Y/o hasta 13 meses sin intereses de $253.77</p>
  `;
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

function stubHtml(body: string, status = 200) {
  const fetchMock = vi.fn(async () => htmlResponse(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('post-recon — identidad MX sin red', () => {
  it('Amazon MX es PDP por ASIN', () => {
    expect(resolveIngestionIdentity(AMAZON_URL)).toEqual(
      expect.objectContaining({ key: 'amz:B09V3KXJPB', strategy: 'amazon_asin' }),
    );
  });

  it('Mercado Libre es ítem de producto', () => {
    expect(resolveIngestionIdentity(ML_URL)).toEqual(
      expect.objectContaining({ key: 'ml:MLM3536548700', strategy: 'ml_item' }),
    );
  });

  it('Liverpool PDP conserva SKU y el home no inventa producto', () => {
    expect(extractLiverpoolProductId(LIVERPOOL_URL)).toBe('1186100481');
    expect(resolveIngestionIdentity(LIVERPOOL_URL)).toEqual(
      expect.objectContaining({ key: 'liv:1186100481', strategy: 'liverpool_sku' }),
    );
    expect(extractLiverpoolProductId(LIVERPOOL_HOME)).toBeNull();
    const homeId = resolveIngestionIdentity(LIVERPOOL_HOME);
    expect(homeId.key).toBeNull();
    expect(homeId.strategy).toBe('none');
  });
});

describe('post-recon — Liverpool con fixture del extractor', () => {
  it('JSON-LD @type Product clasifica producto; WebSite no', () => {
    const products = parseJsonLdProducts(liverpoolJsonLdProductHtml(), LIVERPOOL_URL);
    expect(products).toHaveLength(1);
    expect(products[0]?.title).toBe('Audífonos Sony');
    expect(products[0]?.price).toBe(1799);
    expect(products[0]?.originalPrice).toBe(2499);

    const website = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'WebSite',
      name: 'Liverpool',
    })}</script>`;
    expect(parseJsonLdProducts(website, LIVERPOOL_HOME)).toEqual([]);
  });

  it('extrae tienda, título, precio, imagen e identidad desde el PDP fixture', async () => {
    const html = liverpoolJsonLdProductHtml();
    const fetchMock = stubHtml(html);

    const attempt = await fetchParsedOfferMetadataDetailed(LIVERPOOL_URL);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(LIVERPOOL_URL);
    expect(attempt.diagnostic).toBe('ok');
    expect(attempt.meta).not.toBeNull();
    const meta = attempt.meta!;
    expect(meta.store).toBe('Liverpool');
    expect(meta.title).toBe('Audífonos Sony');
    expect(meta.discountPrice).toBe(1799);
    expect(meta.originalPrice).toBe(2499);
    expect(meta.imageUrl).toBe(LV_IMAGE_A);
    expect(resolveIngestionIdentity(meta.canonicalUrl)).toEqual(
      expect.objectContaining({ key: 'liv:1186100481', strategy: 'liverpool_sku' }),
    );
  });

  it('lee el precio SSR data-testid y no el de meses sin intereses', async () => {
    const html = liverpoolDomPriceHtml();
    const dom = extractLiverpoolDomPrices(html);
    expect(dom.discount).toBe(2969.1);
    expect(dom.original).toBe(3299);

    stubHtml(html);
    const attempt = await fetchParsedOfferMetadataDetailed(LIVERPOOL_URL);
    expect(attempt.diagnostic).toBe('ok');
    expect(attempt.meta).not.toBeNull();
    const meta = attempt.meta!;
    expect(meta.discountPrice).toBe(dom.discount);
    expect(meta.originalPrice).toBe(dom.original);
    expect(meta.title).toMatch(/780NC/i);
    expect(meta.store).toBe('Liverpool');
    expect(meta.discountPrice).not.toBe(253.77);
  });
});

describe('post-recon — diagnósticos sin inventar precio', () => {
  it('HTML sin título ni precio devuelve missing_title', async () => {
    stubHtml('<html><body>acceso restringido</body></html>');
    const attempt = await fetchParsedOfferMetadataDetailed(LIVERPOOL_URL);
    expect(attempt.meta).toBeNull();
    expect(attempt.diagnostic).toBe('missing_title');
    expect(resolveIngestionIdentity(LIVERPOOL_URL).key).toBe('liv:1186100481');
  });

  it('título sin precio de oferta devuelve missing_discount_price', async () => {
    stubHtml('<title>Audífonos Over-Ear Jbl LIVE 780NC inalámbricos | Liverpool</title>');
    const attempt = await fetchParsedOfferMetadataDetailed(LIVERPOOL_URL);
    expect(attempt.meta).toBeNull();
    expect(attempt.diagnostic).toBe('missing_discount_price');
  });

  it('precio de oferta sin original devuelve missing_original_price y conserva el precio', async () => {
    const html = `
      <title>Audífonos Over-Ear Jbl LIVE 780NC inalámbricos | Liverpool</title>
      <span data-testid="discounted"><span>$<!-- -->2,969</span><span class="invisible">.</span>10</span>
    `;
    stubHtml(html);
    const attempt = await fetchParsedOfferMetadataDetailed(LIVERPOOL_URL);
    expect(attempt.diagnostic).toBe('missing_original_price');
    expect(attempt.meta).not.toBeNull();
    expect(attempt.meta?.discountPrice).toBe(2969.1);
    expect(attempt.meta?.originalPrice).toBeNull();
  });

  it('HTTP no exitoso devuelve http_error', async () => {
    stubHtml('<html>captcha</html>', 403);
    const attempt = await fetchParsedOfferMetadataDetailed(LIVERPOOL_URL);
    expect(attempt.meta).toBeNull();
    expect(attempt.diagnostic).toBe('http_error');
    expect(attempt.httpStatus).toBe(403);
  });

  it('fallo de red devuelve network_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const attempt = await fetchParsedOfferMetadataDetailed(LIVERPOOL_URL);
    expect(attempt.meta).toBeNull();
    expect(attempt.diagnostic).toBe('network_error');
  });

  it('abort de timeout devuelve timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      }),
    );
    const attempt = await fetchParsedOfferMetadataDetailed(LIVERPOOL_URL);
    expect(attempt.meta).toBeNull();
    expect(attempt.diagnostic).toBe('timeout');
  });
});

describe('post-recon — Amazon y Mercado Libre con fixture', () => {
  it('Amazon MX extrae título, tienda, precio e imagen del HTML controlado', async () => {
    stubHtml(`
      <meta property="og:title" content="AirPods Pro fixture" />
      <meta property="og:image" content="${AMZ_IMAGE}" />
      <meta property="og:price:amount" content="4999.00" />
      <meta property="product:original_price:amount" content="6999" />
    `);
    const attempt = await fetchParsedOfferMetadataDetailed(AMAZON_URL);
    expect(attempt.diagnostic).toBe('ok');
    expect(attempt.meta).not.toBeNull();
    const meta = attempt.meta!;
    expect(meta.store.toLowerCase()).toContain('amazon');
    expect(meta.title).toBe('AirPods Pro fixture');
    expect(meta.discountPrice).toBe(4999);
    expect(meta.originalPrice).toBe(6999);
    expect(meta.imageUrl).toBe(AMZ_IMAGE);
    expect(resolveIngestionIdentity(meta.canonicalUrl).key).toBe('amz:B09V3KXJPB');
  });

  it('Mercado Libre extrae título, tienda, precio e identidad del HTML controlado', async () => {
    stubHtml(`
      <meta property="og:title" content="Audífonos Bluetooth fixture" />
      <meta property="og:image" content="${ML_IMAGE}" />
      <meta property="og:price:amount" content="899.00" />
      <meta property="product:original_price:amount" content="1299" />
    `);
    const attempt = await fetchParsedOfferMetadataDetailed(ML_URL);
    expect(attempt.diagnostic).toBe('ok');
    expect(attempt.meta).not.toBeNull();
    const meta = attempt.meta!;
    expect(meta.store.toLowerCase()).toMatch(/mercado/);
    expect(meta.title).toBe('Audífonos Bluetooth fixture');
    expect(meta.discountPrice).toBe(899);
    expect(meta.imageUrl).toBe(ML_IMAGE);
    expect(resolveIngestionIdentity(meta.canonicalUrl).key).toBe('ml:MLM3536548700');
  });
});
