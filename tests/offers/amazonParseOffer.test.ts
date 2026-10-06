import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  pastedOfferUrlStillCurrent,
  uploadLinkGateUnlocksAfterParse,
} from '@/lib/offerUrl';
import { extractOfferFromUrl } from '@/lib/offers/offerExtraction/extractOfferFromUrl';

const ASIN_URL = 'https://www.amazon.com.mx/dp/B0TESTABCD';
const IMAGE = 'https://m.media-amazon.com/images/I/71TESTIMG1.jpg';

function htmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Amazon MX metadata', () => {
  it('reads og:title and og:image from a product URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        htmlResponse(
          `<html><head><meta property="og:title" content="Kindle Paperwhite"/><meta property="og:image" content="${IMAGE}"/></head></html>`,
        ),
      ),
    );
    const outcome = await extractOfferFromUrl(ASIN_URL);
    expect(outcome.body.title).toBe('Kindle Paperwhite');
    expect(outcome.body.image).toBe(IMAGE);
    expect(outcome.body.store).toBe('Amazon');
    expect(outcome.body.reason).toBeNull();
  });

  it('keeps the product when the URL has query parameters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        htmlResponse(
          `<html><meta property="og:title" content="Audífonos"/><meta property="og:image" content="${IMAGE}"/></html>`,
        ),
      ),
    );
    const outcome = await extractOfferFromUrl(`${ASIN_URL}?psc=1&tag=demo-20&ref_=share`);
    expect(outcome.body.title).toBe('Audífonos');
    expect(outcome.body.image).toBe(IMAGE);
    expect(outcome.body.store).toBe('Amazon');
  });

  it('uses #productTitle when og:title is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        htmlResponse(
          `<html><span id="productTitle">Omega 3</span><meta property="og:image" content="${IMAGE}"/></html>`,
        ),
      ),
    );
    const outcome = await extractOfferFromUrl(ASIN_URL);
    expect(outcome.body.title).toBe('Omega 3');
    expect(outcome.body.image).toBe(IMAGE);
  });

  it('uses #landingImage when og:image is missing and makes the URL absolute', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        htmlResponse(
          `<html><meta property="og:title" content="Omega 3"/><img id="landingImage" src="//m.media-amazon.com/images/I/71TESTIMG1.jpg"/></html>`,
        ),
      ),
    );
    const outcome = await extractOfferFromUrl(ASIN_URL);
    expect(outcome.body.title).toBe('Omega 3');
    expect(outcome.body.image).toBe(IMAGE);
  });

  it('returns only the fields it could recover', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse('<html><span id="productTitle">Solo título</span></html>')),
    );
    const outcome = await extractOfferFromUrl(ASIN_URL);
    expect(outcome.body.title).toBe('Solo título');
    expect(outcome.body.image).toBeNull();
    expect(outcome.body.store).toBe('Amazon');
    expect(outcome.body.extraction_status).toBe('partial');
  });

  it('reads the canonical /dp/ page when the mobile hop is a bot wall', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input);
        if (href.includes('/gp/aw/d/')) {
          return htmlResponse('<html><title>Amazon.com.mx</title><form id="opfcaptcha"></form></html>');
        }
        return htmlResponse(
          `<html><span id="productTitle">Desde /dp/</span><img id="landingImage" src="${IMAGE}"/></html>`,
        );
      }),
    );
    const outcome = await extractOfferFromUrl(ASIN_URL);
    expect(outcome.body.title).toBe('Desde /dp/');
    expect(outcome.body.image).toBe(IMAGE);
    expect(outcome.body.reason).toBeNull();
  });

  it('returns null product fields on timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }),
    );
    const outcome = await extractOfferFromUrl(ASIN_URL);
    expect(outcome.body.title).toBeNull();
    expect(outcome.body.image).toBeNull();
    expect(outcome.body.suggested_discount_price).toBeNull();
    expect(outcome.httpStatus).toBe(200);
  });

  it('returns null product fields when the fetch is 4xx or 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('no', 503)));
    const outcome = await extractOfferFromUrl(ASIN_URL);
    expect(outcome.body.title).toBeNull();
    expect(outcome.body.image).toBeNull();
    expect(outcome.httpStatus).toBe(200);
  });

  it('returns null product fields for HTML without product metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse(`<html><body>${'x'.repeat(20_000)}</body></html>`)),
    );
    const outcome = await extractOfferFromUrl(ASIN_URL);
    expect(outcome.body.title).toBeNull();
    expect(outcome.body.image).toBeNull();
    expect(outcome.body.suggested_discount_price).toBeNull();
  });

  it('returns null fields for an unsupported domain', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const outcome = await extractOfferFromUrl('https://example.com/producto');
    expect(outcome.body.title).toBeNull();
    expect(outcome.body.image).toBeNull();
    expect(outcome.body.store).toBeNull();
    expect(outcome.body.reason).toBe('invalid_url');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null fields for an invalid URL', async () => {
    const outcome = await extractOfferFromUrl('esto no es una url');
    expect(outcome.body.title).toBeNull();
    expect(outcome.body.image).toBeNull();
    expect(outcome.body.store).toBeNull();
    expect(outcome.body.reason).toBe('invalid_url');
    expect(outcome.body.suggested_discount_price).toBeNull();
  });
});

describe('Mercado Libre sigue leyéndose', () => {
  it('keeps og:title from a Mercado Libre product page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        htmlResponse(
          '<html><meta property="og:title" content="Audífonos ML"/><meta property="og:image" content="https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123-O.jpg"/></html>',
        ),
      ),
    );
    const outcome = await extractOfferFromUrl(
      'https://www.mercadolibre.com.mx/audifonos/p/MLM18625838',
    );
    expect(outcome.body.store).toBe('Mercado Libre');
    expect(outcome.body.title).toContain('Audífonos');
  });
});

describe('formulario: respuesta vieja y continuación manual', () => {
  it('ignores a response after the user changes the URL', () => {
    const requested = 'https://www.amazon.com.mx/dp/B0TESTABCD';
    expect(pastedOfferUrlStillCurrent(requested, requested)).toBe(true);
    expect(
      pastedOfferUrlStillCurrent(`https://www.amazon.com.mx/dp/\nB0TESTABCD`, requested),
    ).toBe(true);
    expect(pastedOfferUrlStillCurrent('www.amazon.com.mx/dp/B0TESTABCD', requested)).toBe(true);
    expect(pastedOfferUrlStillCurrent('https://www.amazon.com.mx/dp/B0OTRO9999', requested)).toBe(
      false,
    );
  });

  it('lets the user continue when the parser fails', () => {
    expect(uploadLinkGateUnlocksAfterParse('extract_failed')).toBe(true);
    expect(uploadLinkGateUnlocksAfterParse('ok')).toBe(true);
    expect(uploadLinkGateUnlocksAfterParse(null)).toBe(false);
    const src = readFileSync(join(process.cwd(), 'app/components/ActionBar.tsx'), 'utf8');
    expect(src).toContain('pastedOfferUrlStillCurrent');
    expect(src).toContain('uploadLinkGateUnlocksAfterParse');
    expect(src).toContain('imagesUserEditedRef');
    expect(src).toContain('disabled={urlParseLoading}');
    expect(src).toContain('setUploadLinkGatePassed(true)');
  });
});
