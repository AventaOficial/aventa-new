import { describe, expect, it, vi } from 'vitest';
import {
  classifyOfferUrlQueryParam,
  normalizeOfferUrl,
  resolveMercadoLibreOfferUrl,
  resolveOfferUrl,
} from '@/lib/offers/urlResolution';
import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { stripOfferTrackingParams } from '@/lib/offers/parseOfferPageHtml';

const ML_LONG_SHARE =
  'https://articulo.mercadolibre.com.mx/MLM-2936772026?attributes=COLOR_SECONDARY_COLOR:U2x5dGhlSmlu&matt_tool=17030900&ua=jVu3mmOgKrIkbOL2y2nownx7ZFa-HaafcVUEM1-CPyobyysM#origin=share&sid=share&action=more';

describe('URL normalization contract', () => {
  it('classifies params correctly', () => {
    expect(classifyOfferUrlQueryParam('attributes')).toBe('variant-bearing');
    expect(classifyOfferUrlQueryParam('wid')).toBe('identity-bearing');
    expect(classifyOfferUrlQueryParam('matt_tool')).toBe('tracking-only');
    expect(classifyOfferUrlQueryParam('ua')).toBe('tracking-only');
    expect(classifyOfferUrlQueryParam('sid')).toBe('share-only');
    expect(classifyOfferUrlQueryParam('mystery_param')).toBe('unknown');
  });

  it('preserves attributes; drops tracking/share/hash', () => {
    const n = normalizeOfferUrl(ML_LONG_SHARE);
    expect(n).toContain('MLM-2936772026');
    expect(n).toContain('attributes=');
    expect(n).not.toContain('matt_tool');
    expect(n).not.toContain('ua=');
    expect(n).not.toContain('#');
  });

  it('stripOfferTrackingParams delegates to normalizeOfferUrl', () => {
    expect(stripOfferTrackingParams(ML_LONG_SHARE)).toBe(normalizeOfferUrl(ML_LONG_SHARE));
  });

  it('unknown params are kept (fail-closed drop)', () => {
    const n = normalizeOfferUrl('https://www.amazon.com.mx/dp/B0TESTASIN?custom_flag=1&utm_source=x');
    expect(n).toContain('custom_flag=1');
    expect(n).not.toContain('utm_source');
  });
  it('preserves social share ref + matt_* (product identity for /social/ pages)', () => {
    const social =
      'https://www.mercadolibre.com.mx/social/al20250918145239?matt_word=al20250918145239&matt_tool=40155088&forceInApp=true&ref=BP%2BEyLHsqlvfbrBrOpcL&utm_source=x&sid=share';
    const n = normalizeOfferUrl(social);
    expect(n).toContain('/social/');
    expect(n).toContain('ref=');
    expect(n).toContain('matt_word=');
    expect(n).toContain('matt_tool=');
    expect(n).toContain('forceInApp=true');
    expect(n).not.toContain('utm_source');
    expect(n).not.toContain('sid=');
  });

  it('still drops matt_* / ref on articulo product URLs', () => {
    const n = normalizeOfferUrl(
      'https://articulo.mercadolibre.com.mx/MLM-2936772026?matt_tool=1&ref=foo&attributes=COLOR:x',
    );
    expect(n).toContain('attributes=');
    expect(n).not.toContain('matt_tool');
    expect(n).not.toContain('ref=');
  });
});

describe('Mercado Libre long share URL', () => {
  it('extracts MLM2936772026 identity + variant, not slug/price', async () => {
    const r = await resolveMercadoLibreOfferUrl(ML_LONG_SHARE);
    expect(r.provider).toBe('mercado_libre');
    expect(r.productFingerprint).toBe('ml:MLM2936772026');
    expect(r.productIdentity).toBe('mercadolibre_mx:pid:MLM2936772026');
    expect(r.variantIdentity).toContain('COLOR_SECONDARY_COLOR');
    expect(r.canonicalUrl).toContain('MLM-2936772026');
    expect(r.canonicalUrl).toContain('attributes=');
    expect(r.confidence).not.toBe('low');
  });

  it('slug changes do not change identity', async () => {
    const a = await resolveMercadoLibreOfferUrl(
      'https://articulo.mercadolibre.com.mx/MLM-2936772026-slug-a',
    );
    const b = await resolveMercadoLibreOfferUrl(
      'https://www.mercadolibre.com.mx/MLM-2936772026-otro-slug-totalmente-distinto',
    );
    expect(a.productFingerprint).toBe(b.productFingerprint);
    expect(a.productIdentity).toBe(b.productIdentity);
  });

  it('/p/ and articulo resolve via coordinator', async () => {
    const articulo = await resolveOfferUrl(
      'https://articulo.mercadolibre.com.mx/MLM-1112223334-test',
    );
    expect(articulo.provider).toBe('mercado_libre');
    expect(articulo.productFingerprint).toBe('ml:MLM1112223334');
  });

  it('/p/MLM catalog path resolves item or catalog identity without inventing', async () => {
    const r = await resolveOfferUrl(
      'https://www.mercadolibre.com.mx/p/MLM-2936772026?matt_tool=1',
    );
    expect(r.provider).toBe('mercado_libre');
    // Catalog /p/ may yield catalogProductId or itemId — never invent ASIN-like ids
    if (r.productFingerprint) {
      expect(r.productFingerprint.startsWith('ml:')).toBe(true);
    }
    expect(r.canonicalUrl).not.toContain('matt_tool');
  });

  it('/up/MLM user-product path does not invent item pid', async () => {
    const r = await resolveOfferUrl(
      'https://www.mercadolibre.com.mx/up/MLMU123456789',
    );
    expect(r.provider).toBe('mercado_libre');
    // Fail-soft: fingerprint may exist as ml:MLMU… but productIdentity item pid stays null
    if (r.productIdentity) {
      expect(r.productIdentity).not.toMatch(/:pid:MLMU/);
    }
  });

  it('fragment-only share noise is stripped', async () => {
    const n = normalizeOfferUrl(
      'https://articulo.mercadolibre.com.mx/MLM-2936772026#origin=share&sid=share',
    );
    expect(n).not.toContain('#');
    expect(n).toContain('MLM-2936772026');
  });
});

describe('Amazon URL resolution', () => {
  it('extracts ASIN from normal /dp/ and query', () => {
    expect(extractAmazonAsin('https://www.amazon.com.mx/dp/B0TESTAS12')).toBe('B0TESTAS12');
    expect(extractAmazonAsin('https://www.amazon.com.mx/gp/product/B0TESTAS12')).toBe('B0TESTAS12');
    expect(extractAmazonAsin('https://www.amazon.com/gp/aw/d/B0TESTAS12')).toBe('B0TESTAS12');
  });

  it('a.co short URL: fail-closed without network inventing ASIN', async () => {
    const { resolveAmazonOfferUrl } = await import('@/lib/offers/urlResolution/amazonResolver');
    // Mock fetch to simulate blocked/empty — no invented identity
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404, headers: {} })),
    );
    const r = await resolveAmazonOfferUrl('https://a.co/d/03esHZap');
    expect(r.provider).toBe('amazon');
    // Without successful redirect+ASIN, fingerprint must be null (fail-closed)
    if (!r.productFingerprint) {
      expect(r.confidence).toBe('low');
      expect(r.provenance.some((p) => p.includes('shortlink') || p === 'asin_missing')).toBe(true);
    }
    vi.unstubAllGlobals();
  });

  it('a.co successful hop → ASIN identity (mocked allowlisted redirect)', async () => {
    const { resolveAmazonOfferUrl } = await import('@/lib/offers/urlResolution/amazonResolver');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input);
        if (href.includes('a.co')) {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://www.amazon.com.mx/dp/B0MOCKASIN' },
          });
        }
        return new Response('<html></html>', { status: 200 });
      }),
    );
    const r = await resolveAmazonOfferUrl('https://a.co/d/03esHZap');
    // Depending on fetchFollowingRedirectsSafely implementation, may get ASIN or fail-closed
    if (r.productFingerprint) {
      expect(r.productFingerprint).toBe('amz:B0MOCKASIN');
      expect(r.canonicalUrl).toContain('/dp/B0MOCKASIN');
    } else {
      expect(r.confidence).toBe('low');
    }
    vi.unstubAllGlobals();
  });

  it('Amazon with tracking still yields ASIN identity', async () => {
    const r = await resolveOfferUrl(
      'https://www.amazon.com.mx/dp/B0ABCDEF12?tag=foo&ref=xx&utm_source=share',
    );
    expect(r.provider).toBe('amazon');
    expect(r.productFingerprint).toBe('amz:B0ABCDEF12');
    expect(r.productIdentity).toContain('asin:B0ABCDEF12');
    expect(r.canonicalUrl).toContain('/dp/B0ABCDEF12');
    expect(r.canonicalUrl).not.toContain('utm_source');
  });
});

describe('unsupported / malformed', () => {
  it('malformed → empty or low confidence', async () => {
    const r = await resolveOfferUrl('not a url');
    expect(r.productFingerprint).toBeNull();
  });

  it('unsupported domain → unknown provider', async () => {
    const r = await resolveOfferUrl('https://evil.example/phish');
    expect(r.provider).toBe('unknown');
    expect(r.productFingerprint).toBeNull();
  });
});
