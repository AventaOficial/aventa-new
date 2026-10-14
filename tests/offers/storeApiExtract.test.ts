import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { costcoProductApiUrl, extractCostcoProductFromApi } from '@/lib/offers/productExtraction/costcoExtract';
import { chedrauiProductApiUrl, extractChedrauiProductFromApi } from '@/lib/offers/productExtraction/chedrauiExtract';
import { extractOfferFromUrl } from '@/lib/offers/offerExtraction/extractOfferFromUrl';
import { prepareMachineCandidateOffer, machineOfferReadyForModeration } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';
import { evaluateMachineCandidateAdmission } from '@/lib/offers/ingestion/machineCandidatePolicy';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'stores', name), 'utf8')) as unknown;

const COSTCO = 'https://www.costco.com.mx/Grocery/Grocery/Leches-y-Bebidas/Santa-Clara-Leche-Deslactosada-6-pzas-de-1-l/p/668242';
const CHEDRAUI = 'https://www.chedraui.com.mx/shampoo-savile-biotina-700ml-3377849/p';
const SPA_SHELL = '<html><head><title>Costco</title></head><body><app-root></app-root></body></html>';

function routedFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const href = String(input);
    for (const [prefix, respond] of Object.entries(routes)) {
      if (href.startsWith(prefix)) return respond();
    }
    return new Response(SPA_SHELL, { status: 200, headers: { 'content-type': 'text/html' } });
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json;charset=UTF-8' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Costco MX: API de producto', () => {
  it('arma la URL del endpoint solo para una PDP', () => {
    expect(costcoProductApiUrl(COSTCO)).toBe('https://www.costco.com.mx/rest/v2/mexico/products/668242?lang=es_MX&curr=MXN');
    expect(costcoProductApiUrl('https://www.costco.com.mx/Mascotas/Alimentos-y-Premios')).toBeNull();
    expect(costcoProductApiUrl('https://evil.example/p/668242')).toBeNull();
  });

  it('lee título, precio, precio base y galería', () => {
    const r = extractCostcoProductFromApi(fixture('costco-product.json'), COSTCO);
    expect(r).toEqual({
      title: 'Santa Clara Leche Deslactosada 6 pzas de 1 l',
      image: 'https://www.costco.com.mx/medias/sys_master/products/hda/hc4/83423766380574.jpg',
      images: [
        'https://www.costco.com.mx/medias/sys_master/products/hda/hc4/83423766380574.jpg',
        'https://www.costco.com.mx/medias/sys_master/products/h55/hdb/83423766216734.jpg',
      ],
      store: 'Costco',
      suggestedDiscount: 189,
      suggestedOriginal: 259,
    });
  });

  it('rechaza una respuesta de otro producto', () => {
    const other = { ...(fixture('costco-product.json') as object), code: '999999' };
    expect(extractCostcoProductFromApi(other, COSTCO)).toBeNull();
  });

  it('sin precio visible no inventa precio', () => {
    const hidden = { ...(fixture('costco-product.json') as object), hidePriceValue: true };
    const r = extractCostcoProductFromApi(hidden, COSTCO);
    expect(r?.suggestedDiscount).toBeNull();
    expect(r?.suggestedOriginal).toBeNull();
  });

  it('precio base igual al actual no cuenta como precio de lista', () => {
    const base = fixture('costco-product.json') as Record<string, unknown>;
    const r = extractCostcoProductFromApi({ ...base, basePrice: base.price }, COSTCO);
    expect(r?.suggestedDiscount).toBe(189);
    expect(r?.suggestedOriginal).toBeNull();
  });
});

describe('Chedraui: catálogo VTEX', () => {
  it('arma la URL del endpoint solo para una PDP', () => {
    expect(chedrauiProductApiUrl(CHEDRAUI)).toBe(
      'https://www.chedraui.com.mx/api/catalog_system/pub/products/search/shampoo-savile-biotina-700ml-3377849/p',
    );
    expect(chedrauiProductApiUrl('https://www.chedraui.com.mx/promociones/jabones')).toBeNull();
    expect(chedrauiProductApiUrl('https://www.chedraui.com.mx/a%2F..%2Fx/p')).toBeNull();
  });

  it('lee título, precio, precio de lista y fotos del SKU', () => {
    const r = extractChedrauiProductFromApi(fixture('chedraui-product.json'), CHEDRAUI);
    expect(r?.title).toBe('Shampoo Savilé Biotina 700ml');
    expect(r?.suggestedDiscount).toBe(40);
    expect(r?.suggestedOriginal).toBe(60);
    expect(r?.images).toHaveLength(2);
    expect(r?.image).toMatch(/^https:\/\/chedrauimx\.vteximg\.com\.br\//);
  });

  it('rechaza un producto con otro linkText', () => {
    const list = fixture('chedraui-product.json') as Array<Record<string, unknown>>;
    expect(extractChedrauiProductFromApi([{ ...list[0], linkText: 'otro-producto-1/p' }], CHEDRAUI)).toBeNull();
  });

  it('un SKU agotado no deja precio', () => {
    const list = fixture('chedraui-product.json') as Array<Record<string, unknown>>;
    const product = JSON.parse(JSON.stringify(list[0])) as {
      items: Array<{ sellers: Array<{ commertialOffer: Record<string, unknown> }> }>;
    };
    product.items[0]!.sellers[0]!.commertialOffer = { Price: 0, ListPrice: 0, IsAvailable: false };
    const r = extractChedrauiProductFromApi([product], CHEDRAUI);
    expect(r?.suggestedDiscount).toBeNull();
    expect(r?.title).toBe('Shampoo Savilé Biotina 700ml');
  });
});

describe('extractor único con API de tienda', () => {
  it('Costco: la SPA vacía se completa con el endpoint de producto', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({ 'https://www.costco.com.mx/rest/v2/mexico/products/668242': () => json(fixture('costco-product.json')) }),
    );
    const outcome = await extractOfferFromUrl(COSTCO);
    expect(outcome.body.title).toBe('Santa Clara Leche Deslactosada 6 pzas de 1 l');
    expect(outcome.body.suggested_discount_price).toBe(189);
    expect(outcome.body.suggested_original_price).toBe(259);
    expect(outcome.body.image).toBe('https://www.costco.com.mx/medias/sys_master/products/hda/hc4/83423766380574.jpg');
    expect(outcome.adapter.priceSource).toBe('retail_api');
    expect(outcome.adapter.originalPriceSource).toBe('retail_api');
  });

  it('Chedraui: candidato MCP queda listo y pasa la política con precio de la página', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({ 'https://www.chedraui.com.mx/api/catalog_system/': () => json(fixture('chedraui-product.json')) }),
    );
    const prepared = await prepareMachineCandidateOffer(CHEDRAUI);
    expect(prepared.imageFailure).toBeNull();
    expect(machineOfferReadyForModeration(prepared)).toBe(true);
    const admission = evaluateMachineCandidateAdmission({
      url: CHEDRAUI,
      prepared,
      botDeclared: { price: 35, originalPrice: 99 },
      isLowQualityTitle: () => false,
    });
    expect(admission).toMatchObject({ outcome: 'admit', price: 40, originalPrice: 60, priceSource: 'retail_api' });
  });

  it('si el endpoint falla no inventa datos', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({ 'https://www.costco.com.mx/rest/': () => new Response('denied', { status: 403 }) }),
    );
    const prepared = await prepareMachineCandidateOffer(COSTCO);
    expect(prepared.title).toBeNull();
    expect(prepared.price).toBeNull();
    expect(prepared.imageUrl).toBeNull();
    expect(machineOfferReadyForModeration(prepared)).toBe(false);
  });

  it('una respuesta que no es JSON se ignora', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        'https://www.costco.com.mx/rest/': () => new Response(JSON.stringify(fixture('costco-product.json')), { status: 200, headers: { 'content-type': 'text/html' } }),
      }),
    );
    const outcome = await extractOfferFromUrl(COSTCO);
    expect(outcome.body.suggested_discount_price).toBeNull();
  });
});
