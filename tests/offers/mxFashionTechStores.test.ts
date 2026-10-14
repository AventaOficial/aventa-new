import { describe, expect, it } from 'vitest';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import { isAllowedMxCommerceHost } from '@/lib/offers/commerceHostAllowlist';
import { mexicanRetailerCurrency } from '@/lib/offers/sourceCurrency';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { offerUrlIsPublicDestination } from '@/lib/offers/publicCatalogGate';
import { normalizeCandidateUrl } from '@/lib/mcp/candidates';
import { supportedStoreDomains } from '@/lib/mcp/rules';
import { isAllowedOfferParseHost } from '@/lib/server/fetchUrlSafety';

/** Tienda → host, ficha real, nombre visible, y si el host cotiza siempre en MXN. */
const STORES: ReadonlyArray<{ domain: string; url: string; store: string; mxn: boolean }> = [
  { domain: 'asics.com.mx', url: 'https://www.asics.com.mx/gel-kayano-32/p', store: 'ASICS', mxn: true },
  { domain: 'newbalancemexico.com', url: 'https://www.newbalancemexico.com/mrcel7rz/MRCEL7RZ.html', store: 'New Balance', mxn: true },
  { domain: 'underarmour.com.mx', url: 'https://www.underarmour.com.mx/es-mx/p/tops/the_bouncy_tee/198635826970.html', store: 'Under Armour', mxn: true },
  { domain: 'converse.com.mx', url: 'https://converse.com.mx/tenis-de-bota-rojos-chuck-70-para-hombre-de-lona-a19211c.html', store: 'Converse', mxn: true },
  { domain: 'crocs.com.mx', url: 'https://crocs.com.mx/products/braindead-x-crocs-echo2', store: 'Crocs', mxn: true },
  { domain: 'hoka.mx', url: 'https://hoka.mx/products/hokaxhaven', store: 'HOKA', mxn: true },
  { domain: 'lululemon.mx', url: 'https://www.lululemon.mx/es-mx/p/pantalon-align/prod1234.html', store: 'lululemon', mxn: false },
  { domain: 'mx.puma.com', url: 'https://mx.puma.com/mx/es/pd/tenis-suede-classic/374915.html', store: 'PUMA', mxn: true },
  { domain: 'vans.com.mx', url: 'https://www.vans.com.mx/tenis-old-skool-negro/p', store: 'Vans', mxn: true },
  { domain: 'skechers.com.mx', url: 'https://www.skechers.com.mx/tenis-go-walk-7/p', store: 'Skechers', mxn: true },
  { domain: 'marti.mx', url: 'https://www.marti.mx/tenis-puma-casual-1127979628/p', store: 'Martí', mxn: true },
  { domain: 'flexi.com.mx', url: 'https://www.flexi.com.mx/zapato-casual-hombre-12345/p', store: 'Flexi', mxn: true },
  { domain: 'cuadra.com.mx', url: 'https://cuadra.com.mx/products/bota-vaquera-piel', store: 'Cuadra', mxn: true },
  { domain: 'mx.tommy.com', url: 'https://mx.tommy.com/polo-slim-fit-mw0mw17770/p', store: 'Tommy Hilfiger', mxn: true },
  { domain: 'calvinklein.mx', url: 'https://www.calvinklein.mx/bota-chelsea-combat-calvin-klein-hombre-negro-ym0ym01374-0gj/p', store: 'Calvin Klein', mxn: true },
  { domain: 'levi.com.mx', url: 'https://www.levi.com.mx/jeans-501-original-00501-0114/p', store: "Levi's", mxn: true },
  { domain: 'guess.mx', url: 'https://www.guess.mx/bolsa-satchel-logo/p', store: 'GUESS', mxn: true },
  { domain: 'hm.com', url: 'https://www2.hm.com/es_mx/productpage.1234567001.html', store: 'H&M', mxn: false },
  { domain: 'zara.com', url: 'https://www.zara.com/mx/es/chamarra-regular-fit-piel-p04416246.html', store: 'Zara', mxn: false },
  { domain: 'bershka.com', url: 'https://www.bershka.com/mx/jeans-wide-leg-c0p123456789.html', store: 'Bershka', mxn: false },
  { domain: 'pullandbear.com', url: 'https://www.pullandbear.com/mx/sudadera-basica-l12345678', store: 'Pull&Bear', mxn: false },
  { domain: 'sephora.com.mx', url: 'https://www.sephora.com.mx/products-9090528758.html', store: 'Sephora', mxn: true },
  { domain: 'ulta.com.mx', url: 'https://www.ulta.com.mx/labial-matte-ruby-woo/p', store: 'Ulta Beauty', mxn: true },
  { domain: 'sallymexico.com', url: 'https://www.sallymexico.com/alaciadora-optima-1-1-4-grey/p', store: 'Sally Beauty', mxn: true },
  { domain: 'fragancias.com.mx', url: 'https://www.fragancias.com.mx/perfume-sauvage-dior-100ml', store: 'Fragancias.com.mx', mxn: true },
  { domain: 'samsung.com', url: 'https://www.samsung.com/mx/smartphones/galaxy-a56/buy/', store: 'Samsung', mxn: false },
  { domain: 'store.sony.com.mx', url: 'https://store.sony.com.mx/wh-1000xm6/p', store: 'Sony Store', mxn: true },
];

describe('tiendas oficiales MX de moda, belleza, deporte y tecnología', () => {
  it.each(STORES)('$domain: permitida para parse, MCP y catálogo público', ({ domain, url }) => {
    const host = new URL(url).hostname;
    expect(isAllowedMxCommerceHost(domain)).toBe(true);
    expect(isAllowedOfferParseHost(host)).toBe(true);
    expect(supportedStoreDomains()).toContain(domain);
    expect(normalizeCandidateUrl(url)).toEqual({ ok: true, url });
    expect(resolveIngestionIdentity(url)).toEqual(expect.objectContaining({ strategy: 'url_fingerprint' }));
    expect(offerUrlIsPublicDestination(url)).toBe(true);
  });

  it.each(STORES)('$domain: nombre de tienda y moneda', ({ url, store, mxn }) => {
    expect(inferStoreFromHostname(new URL(url).hostname)).toBe(store);
    expect(mexicanRetailerCurrency(url)).toBe(mxn ? 'MXN' : null);
  });

  it.each([
    'zara.com.evil.com',
    'evilzara.com',
    'zara-com.mx',
    'hm.com.attacker.test',
    'xhm.com',
    'samsung.com.mx.evil.com',
    'fakesamsung.com',
    'sephora.com.mx.evil.com',
    'notmarti.mx',
    'marti.mx.evil.com',
    'tommy.com',
    'us.tommy.com',
    'evilmx.tommy.com.attacker.test',
    'puma.com',
    'us.puma.com',
    'sony.com.mx',
    'www.sony.com.mx',
    'store.sony.com.mx.evil.com',
    'on.com',
    'newbalancemx.com.mx',
    'lululemon.mx.evil.com',
    'hoka.mx.evil.com',
  ])('rechaza el host falso o fuera de la tienda MX %s', (host) => {
    expect(isAllowedOfferParseHost(host)).toBe(false);
    expect(normalizeCandidateUrl(`https://${host}/producto-123/p`)).toEqual({ ok: false, code: 'UNSUPPORTED_HOST' });
  });

  it('un host permitido escondido en la ruta no cuenta', () => {
    expect(normalizeCandidateUrl('https://evil.example/www.zara.com/mx/es/x-p1.html')).toEqual({
      ok: false,
      code: 'UNSUPPORTED_HOST',
    });
  });
});
