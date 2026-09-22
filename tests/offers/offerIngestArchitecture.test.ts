import { describe, expect, it, vi } from 'vitest';
import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { isAmazonExpandableHost, isOfferAmazonHost } from '@/lib/offers/commerceHostAllowlist';
import { resolveAmazonOfferUrl, resolveOfferUrl } from '@/lib/offers/urlResolution';
import { classifyOfferExtraction, offerExtractionUserMessage } from '@/lib/offers/productExtraction/classifyExtraction';
import { mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';
import { extractMercadoLibreProductScopedImages } from '@/lib/offers/parseOfferPageHtml';
import { resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';

describe('Amazon expandable hosts (link.amazon / a.co)', () => {
  it('allows link.amazon on commerce allowlist', () => {
    expect(isOfferAmazonHost('link.amazon')).toBe(true);
    expect(isAmazonExpandableHost('link.amazon')).toBe(true);
    expect(isAmazonExpandableHost('a.co')).toBe(true);
    expect(isAmazonExpandableHost('www.amazon.com.mx')).toBe(false);
  });

  it('extracts ASIN from link.amazon/{ASIN} path', () => {
    expect(extractAmazonAsin('https://link.amazon/B0BHTTDBC2')).toBe('B0BHTTDBC2');
    expect(extractAmazonAsin('https://link.amazon/B0anQq29BX')).toBe('B0ANQQ29BX');
  });

  it('extracts ASIN from long amazon URL with tracking', () => {
    const url =
      'https://www.amazon.com.mx/Omega-Salmon/dp/B0BHTTDBC2?pd_rd_w=MjV6b&ref_=pd_hp_d_r&th=1';
    expect(extractAmazonAsin(url)).toBe('B0BHTTDBC2');
  });

  it('link.amazon with ASIN in path synthesizes /dp/ canonical without inventing ASIN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404, headers: {} })),
    );
    const r = await resolveAmazonOfferUrl('https://link.amazon/B0BHTTDBC2');
    expect(r.provider).toBe('amazon');
    expect(r.productFingerprint).toBe('amz:B0BHTTDBC2');
    expect(r.canonicalUrl).toContain('/dp/B0BHTTDBC2');
    expect(r.canonicalUrl).not.toContain('link.amazon');
    vi.unstubAllGlobals();
  });

  it('link.amazon without resolvable ASIN stays fail-closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404, headers: {} })),
    );
    // 9-char token is not a valid ASIN
    const r = await resolveAmazonOfferUrl('https://link.amazon/B0anQq29B');
    expect(r.provider).toBe('amazon');
    expect(r.productFingerprint).toBeNull();
    expect(r.confidence).toBe('low');
    vi.unstubAllGlobals();
  });

  it('link.amazon redirect hop yields ASIN (mocked)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input);
        if (href.includes('link.amazon')) {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://www.amazon.com.mx/dp/B0REDIRECT1' },
          });
        }
        return new Response('<html></html>', { status: 200 });
      }),
    );
    const r = await resolveAmazonOfferUrl('https://link.amazon/B0anQq29B');
    if (r.productFingerprint) {
      expect(r.productFingerprint).toBe('amz:B0REDIRECT1');
      expect(r.canonicalUrl).toContain('/dp/B0REDIRECT1');
    } else {
      expect(r.confidence).toBe('low');
    }
    vi.unstubAllGlobals();
  });

  it('a.co and long URL still resolve via coordinator', async () => {
    const long = await resolveOfferUrl(
      'https://www.amazon.com.mx/dp/B0ABCDEF12?tag=foo&utm_source=share',
    );
    expect(long.productFingerprint).toBe('amz:B0ABCDEF12');
  });
});

describe('Mercado Libre share / pdp_filters identity', () => {
  it('resolves item from pdp_filters product URL', () => {
    const url =
      'https://www.mercadolibre.com.mx/p/MLM18625838?pdp_filters=item_id:MLM5022001780&matt_tool=17030900#origin=share&sid=share&wid=MLM5022001780&action=copy';
    const r = resolveMercadoLibreItem(url);
    expect(r?.itemId).toBe('MLM5022001780');
  });
});

describe('ML product-scoped image merge', () => {
  const ITEM_A = 'https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123-O.jpg';
  const ITEM_B = 'https://http2.mlstatic.com/D_NQ_NP_2X_BBB222-MLA123-O.jpg';
  const ITEM_C = 'https://http2.mlstatic.com/D_NQ_NP_2X_CCC333-MLA123-O.jpg';
  const RELATED = 'https://http2.mlstatic.com/D_NQ_NP_2X_REL999-MLA999-O.jpg';

  it('API 1 + product-scoped gallery → múltiples fotos sin relacionados', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [ITEM_A],
      htmlImages: [RELATED],
      productScopedHtmlImages: [ITEM_A, ITEM_B, ITEM_C],
      mlSource: 'ml_api',
    });
    expect(merged.length).toBeGreaterThanOrEqual(2);
    expect(merged).toContain(ITEM_A);
    expect(merged).toContain(ITEM_B);
    expect(merged).not.toContain(RELATED);
  });

  it('extracts Product JSON-LD gallery', () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"Product","image":[
        "https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123-O.jpg",
        "https://http2.mlstatic.com/D_NQ_NP_2X_BBB222-MLA123-O.jpg"
      ]}
      </script>`;
    const imgs = extractMercadoLibreProductScopedImages(html, 'https://www.mercadolibre.com.mx/');
    expect(imgs.length).toBe(2);
  });
});

describe('classifyOfferExtraction', () => {
  it('success when title + images', () => {
    const r = classifyOfferExtraction({
      title: 'Producto',
      imageCount: 3,
      hasPrice: true,
      hasCategory: true,
      productIdentity: true,
    });
    expect(r.status).toBe('success');
  });

  it('partial when title + price but no images', () => {
    const r = classifyOfferExtraction({
      title: 'Producto',
      imageCount: 0,
      hasPrice: true,
      hasCategory: false,
      productIdentity: true,
    });
    expect(r.status).toBe('partial');
    expect(r.missing).toContain('imágenes');
  });

  it('partial (not failed) when only images — semántica previa', () => {
    const r = classifyOfferExtraction({
      title: null,
      imageCount: 3,
      hasPrice: false,
      hasCategory: false,
      productIdentity: false,
    });
    expect(r.status).toBe('partial');
  });

  it('failed when nothing useful', () => {
    const r = classifyOfferExtraction({
      title: null,
      imageCount: 0,
      hasPrice: false,
      hasCategory: false,
      productIdentity: false,
    });
    expect(r.status).toBe('failed');
  });
});

describe('offerExtractionUserMessage', () => {
  it('invalid_url explica por qué y tip de tienda', () => {
    const msg = offerExtractionUserMessage({
      status: 'failed',
      reason: 'invalid_url',
      url: 'https://bit.ly/xyz',
    });
    expect(msg).toMatch(/no podemos usar|no reconocida|inválida/i);
    expect(msg).toMatch(/cómo mejorarlo/i);
  });

  it('link.amazon sugiere URL larga /dp/', () => {
    const msg = offerExtractionUserMessage({
      status: 'failed',
      reason: 'extract_failed',
      url: 'https://link.amazon/B0BHTTDBC2',
    });
    expect(msg).toMatch(/amazon\.com\.mx|\/dp\//i);
  });

  it('partial sin imágenes dice qué falta y cómo subir/pegar', () => {
    const msg = offerExtractionUserMessage({
      status: 'partial',
      bits: ['título', 'precio'],
      missing: ['imágenes'],
      url: 'https://www.mercadolibre.com.mx/p/MLM1',
    });
    expect(msg).toMatch(/faltan|falta/i);
    expect(msg).toMatch(/imágenes/i);
    expect(msg).toMatch(/sube|pega|url/i);
  });

  it('success es breve y positivo', () => {
    const msg = offerExtractionUserMessage({
      status: 'success',
      bits: ['título', '3 fotos', 'precio'],
      missing: [],
    });
    expect(msg).toMatch(/^Listo:/);
  });
});
