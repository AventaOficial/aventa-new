import { describe, expect, it } from 'vitest';
import {
  AVENTA_MERCADOLIBRE_AFFILIATE_TOOL,
  featuredMercadoLibreIdsFromSocialHtml,
  originalMercadoLibreProductIds,
  verifyMeliLaPaste,
} from '@/lib/affiliate/verifyMeliLaPaste';
import type { SafeFetchResult } from '@/lib/server/fetchUrlSafety';

const MELI_LA = 'https://meli.la/2vWwBNv';
const SOCIAL_FINAL =
  'https://www.mercadolibre.com.mx/social/capitanjeshua?matt_word=aventa&matt_tool=97583635&forceInApp=true&ref=BCVFeRHK91yKL4Eq';
const OTHER_ACCOUNT_FINAL =
  'https://www.mercadolibre.com.mx/social/otro?matt_word=otro&matt_tool=12345678&forceInApp=true&ref=zz';
const CATALOG_ORIGINAL = 'https://www.mercadolibre.com.mx/producto-x/p/MLM57589015';
const ITEM_ORIGINAL = 'https://articulo.mercadolibre.com.mx/MLM-2577352885-producto-x';
const NO_FEATURED_HTML =
  '<script>{"polycards":[{"metadata":{"id":"MLM2577352885","product_id":"MLM57589015"}},{"metadata":{"id":"MLM6342663866"}}]}</script>';

function featuredHtml(itemId: string, productId: string, recommendations: string[]) {
  const recs = recommendations.map((id) => `{"metadata":{"id":"${id}"}}`).join(',');
  return `{"id":"card-featured","type":"recommendations","polycards":[{"metadata":{"id":"${itemId}","product_id":"${productId}"}}]}{"id":"affiliate-profile-recommendations","polycards":[${recs}]}`;
}

const SAME_PRODUCT_HTML = featuredHtml('MLM2577352885', 'MLM57589015', ['MLM6342663866']);

function page(finalUrl: string, html: string, status = 200) {
  return async (): Promise<SafeFetchResult> => ({
    ok: true,
    finalUrl,
    response: new Response(html, { status }),
  });
}

describe('originalMercadoLibreProductIds', () => {
  it('extrae id de catálogo y de artículo', () => {
    expect(originalMercadoLibreProductIds(CATALOG_ORIGINAL)).toContain('MLM57589015');
    expect(originalMercadoLibreProductIds(ITEM_ORIGINAL)).toContain('MLM2577352885');
  });
});

describe('featuredMercadoLibreIdsFromSocialHtml', () => {
  it('lee solo la tarjeta destacada', () => {
    expect(featuredMercadoLibreIdsFromSocialHtml(SAME_PRODUCT_HTML)).toEqual([
      'MLM2577352885',
      'MLM57589015',
    ]);
  });

  it('null si la página no trae card-featured', () => {
    expect(featuredMercadoLibreIdsFromSocialHtml(NO_FEATURED_HTML)).toBeNull();
  });
});

describe('verifyMeliLaPaste', () => {
  it('la cuenta esperada es la de Aventa', () => {
    expect(AVENTA_MERCADOLIBRE_AFFILIATE_TOOL).toBe('97583635');
  });

  it('verifica catálogo y cuenta de Aventa desde la redirección', async () => {
    const r = await verifyMeliLaPaste(CATALOG_ORIGINAL, MELI_LA, {
      fetchPage: page(SOCIAL_FINAL, SAME_PRODUCT_HTML),
    });
    expect(r).toEqual({
      status: 'verified',
      reason: null,
      accountVerified: true,
      productVerified: true,
      affiliateWord: 'aventa',
      affiliateTool: '97583635',
      destinationUrl: SOCIAL_FINAL,
    });
  });

  it('verifica artículo en la tarjeta destacada', async () => {
    const r = await verifyMeliLaPaste(ITEM_ORIGINAL, MELI_LA, {
      fetchPage: page(SOCIAL_FINAL, SAME_PRODUCT_HTML),
    });
    expect(r.status).toBe('verified');
  });

  it('rechaza un meli.la de otra cuenta de afiliado aunque sea el mismo producto', async () => {
    const r = await verifyMeliLaPaste(CATALOG_ORIGINAL, MELI_LA, {
      fetchPage: page(OTHER_ACCOUNT_FINAL, SAME_PRODUCT_HTML),
    });
    expect(r).toMatchObject({
      status: 'rejected',
      accountVerified: false,
      affiliateTool: '12345678',
      destinationUrl: OTHER_ACCOUNT_FINAL,
    });
    expect(r.reason).toContain('otra cuenta');
  });

  it('rechaza si la tarjeta destacada es otro producto', async () => {
    const r = await verifyMeliLaPaste(
      'https://articulo.mercadolibre.com.mx/MLM-9999999999-otro',
      MELI_LA,
      { fetchPage: page(SOCIAL_FINAL, SAME_PRODUCT_HTML) }
    );
    expect(r).toMatchObject({
      status: 'rejected',
      reason: 'El meli.la muestra otro producto',
      accountVerified: true,
      productVerified: false,
    });
  });

  it('rechaza si la redirección no trae afiliado', async () => {
    const r = await verifyMeliLaPaste(CATALOG_ORIGINAL, MELI_LA, {
      fetchPage: page('https://www.mercadolibre.com.mx/social/alguien?ref=abc', SAME_PRODUCT_HTML),
    });
    expect(r).toMatchObject({ status: 'rejected', reason: 'Este meli.la no es un enlace de afiliado' });
  });

  it('compara directo si el destino ya trae el id del producto', async () => {
    const other = await verifyMeliLaPaste(CATALOG_ORIGINAL, MELI_LA, {
      fetchPage: page(
        'https://articulo.mercadolibre.com.mx/MLM-1111111111-otro?matt_word=aventa&matt_tool=97583635',
        ''
      ),
    });
    expect(other.status).toBe('rejected');

    const same = await verifyMeliLaPaste(ITEM_ORIGINAL, MELI_LA, {
      fetchPage: page(
        'https://articulo.mercadolibre.com.mx/MLM-2577352885-producto-x?matt_word=aventa&matt_tool=97583635',
        ''
      ),
    });
    expect(same.status).toBe('verified');
  });

  it('pide revisión manual si no se puede abrir el enlace, sin declarar cuenta ni producto', async () => {
    const r = await verifyMeliLaPaste(CATALOG_ORIGINAL, MELI_LA, {
      fetchPage: async () => ({ ok: false, reason: 'timeout' }),
    });
    expect(r).toMatchObject({
      status: 'needs_manual_review',
      accountVerified: false,
      productVerified: false,
      destinationUrl: null,
    });
  });

  it('pide revisión manual si Mercado Libre bloquea la página, pero confirma la cuenta', async () => {
    const r = await verifyMeliLaPaste(CATALOG_ORIGINAL, MELI_LA, {
      fetchPage: page(SOCIAL_FINAL, 'blocked', 403),
    });
    expect(r).toMatchObject({
      status: 'needs_manual_review',
      accountVerified: true,
      productVerified: false,
      affiliateWord: 'aventa',
    });
  });

  it('pide revisión manual si la página no muestra producto (captcha)', async () => {
    const r = await verifyMeliLaPaste(CATALOG_ORIGINAL, MELI_LA, {
      fetchPage: page(SOCIAL_FINAL, '<html>captcha</html>'),
    });
    expect(r.status).toBe('needs_manual_review');
  });

  it('sin tarjeta destacada no verifica aunque el id aparezca en recomendaciones', async () => {
    const r = await verifyMeliLaPaste(ITEM_ORIGINAL, MELI_LA, {
      fetchPage: page(SOCIAL_FINAL, NO_FEATURED_HTML),
    });
    expect(r).toMatchObject({ status: 'needs_manual_review', productVerified: false });
  });

  it('usa la tarjeta destacada y no se confunde con recomendaciones', async () => {
    const html = featuredHtml('MLM1111111111', 'MLM11111111', ['MLM2577352885']);
    const r = await verifyMeliLaPaste(ITEM_ORIGINAL, MELI_LA, {
      fetchPage: page(SOCIAL_FINAL, html),
    });
    expect(r).toMatchObject({ status: 'rejected', reason: 'El meli.la muestra otro producto' });
  });

  it('compara contra el meli.la que subió el usuario', async () => {
    const userMeliLa = 'https://meli.la/usuario1';
    const userFinal =
      'https://www.mercadolibre.com.mx/social/usuario?matt_word=usuario&matt_tool=111&ref=zzz';
    const pages: Record<string, () => Promise<SafeFetchResult>> = {
      [userMeliLa]: page(userFinal, featuredHtml('MLM2577352885', 'MLM57589015', [])),
      [MELI_LA]: page(SOCIAL_FINAL, featuredHtml('MLM2577352885', 'MLM57589015', [])),
    };
    const same = await verifyMeliLaPaste(userMeliLa, MELI_LA, {
      fetchPage: (url) => pages[url](),
    });
    expect(same).toMatchObject({ status: 'verified', affiliateWord: 'aventa', affiliateTool: '97583635' });

    pages[userMeliLa] = page(userFinal, featuredHtml('MLM9999999999', 'MLM99999999', []));
    const other = await verifyMeliLaPaste(userMeliLa, MELI_LA, {
      fetchPage: (url) => pages[url](),
    });
    expect(other.status).toBe('rejected');
  });

  it('pide revisión manual si no se puede leer el meli.la del usuario', async () => {
    const userMeliLa = 'https://meli.la/usuario1';
    const r = await verifyMeliLaPaste(userMeliLa, MELI_LA, {
      fetchPage: (url) =>
        url === MELI_LA
          ? page(SOCIAL_FINAL, SAME_PRODUCT_HTML)()
          : Promise.resolve({ ok: false, reason: 'timeout' }),
    });
    expect(r).toMatchObject({
      status: 'needs_manual_review',
      accountVerified: true,
      affiliateWord: 'aventa',
    });
  });

  it('rechaza si el destino no es Mercado Libre', async () => {
    const r = await verifyMeliLaPaste(CATALOG_ORIGINAL, MELI_LA, {
      fetchPage: page('https://example.com/x?matt_tool=97583635', ''),
    });
    expect(r).toMatchObject({ status: 'rejected', destinationUrl: 'https://example.com/x?matt_tool=97583635' });
  });
});
