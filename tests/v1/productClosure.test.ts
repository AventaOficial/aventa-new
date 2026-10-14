import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isResolvedProductOfferUrl } from '@/lib/affiliate/assessOfferAffiliateLink';
import { validateAffiliatePaste } from '@/lib/affiliate/validateAffiliatePaste';
import { evaluateAffiliateReadiness } from '@/lib/moderation/affiliateReadinessContract';
import { classifyOfferPageKind } from '@/lib/offers/retailerProductUrl';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { DEFAULT_FEED_POLICY } from '@/lib/sponsored/placements';
import { mexicanRetailerCurrency, resolveOfferSourceCurrency } from '@/lib/offers/sourceCurrency';
import { presentOfferPrice } from '@/lib/formatPrice';

const AMAZON_MX = 'https://www.amazon.com.mx/dp/B0TESTASI1';
const AMAZON_US = 'https://www.amazon.com/dp/B0TESTASI1';
const ML_MX = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-audifonos';
const SORIANA = 'https://www.soriana.com/cereal-kelloggs-zucaritas-600-g/11669769.html';
const COSTCO = 'https://www.costco.com.mx/Mascotas/Alimentos-y-Premios/Canine-Club-Alimento-para-Perro-227-kg/p/20691';

describe('moneda de retailers mexicanos', () => {
  it('Amazon México, Mercado Libre México, Soriana y Costco México son MXN', () => {
    expect(mexicanRetailerCurrency(AMAZON_MX)).toBe('MXN');
    expect(mexicanRetailerCurrency(ML_MX)).toBe('MXN');
    expect(mexicanRetailerCurrency(SORIANA)).toBe('MXN');
    expect(mexicanRetailerCurrency(COSTCO)).toBe('MXN');
    expect(presentOfferPrice(799, 'MXN')).toMatch(/799/);
    expect(presentOfferPrice(799, 'MXN')).toContain('MXN');
  });

  it('no convierte un dólar ni un acortador en MXN', () => {
    expect(mexicanRetailerCurrency(AMAZON_US)).toBeNull();
    expect(mexicanRetailerCurrency('https://www.costco.com/p/123456')).toBeNull();
    expect(mexicanRetailerCurrency('https://www.mercadolibre.com.ar/p/MLA123')).toBeNull();
    expect(mexicanRetailerCurrency('https://meli.la/abc')).toBeNull();
    expect(mexicanRetailerCurrency('https://link.amazon/B0TESTASI1')).toBeNull();
    expect(resolveOfferSourceCurrency(null, AMAZON_US)).toBeNull();
    expect(presentOfferPrice(799, null)).toBe('Precio sin moneda confirmada');
  });

  it('una moneda ya guardada no se pisa con el host', () => {
    expect(resolveOfferSourceCurrency('USD', AMAZON_MX)).toBe('USD');
  });

  it('Mis ofertas usa la moneda de la oferta', () => {
    const preview = readFileSync(join(process.cwd(), 'app/me/dashboard/HunterOffersPreview.tsx'), 'utf8');
    const mine = readFileSync(join(process.cwd(), 'app/me/ofertas/page.tsx'), 'utf8');
    expect(preview).toContain('presentOfferPrice(price, offer.sourceCurrency)');
    expect(mine).toContain('resolveOfferSourceCurrency');
    const me = readFileSync(join(process.cwd(), 'app/me/page.tsx'), 'utf8');
    expect(me).toContain('sourceCurrency: offer.sourceCurrency');
  });
});

describe('URL de producto Soriana y Costco', () => {
  it('acepta el PDP real y rechaza home o categoría', () => {
    expect(isResolvedProductOfferUrl(SORIANA)).toBe(true);
    expect(isResolvedProductOfferUrl(COSTCO)).toBe(true);
    expect(isResolvedProductOfferUrl(AMAZON_MX)).toBe(true);
    expect(isResolvedProductOfferUrl(ML_MX)).toBe(true);
    expect(isResolvedProductOfferUrl('https://www.soriana.com/')).toBe(false);
    expect(isResolvedProductOfferUrl('https://www.soriana.com/despensa')).toBe(false);
    expect(isResolvedProductOfferUrl('https://www.costco.com.mx/')).toBe(false);
    expect(isResolvedProductOfferUrl('https://www.costco.com.mx/Mascotas/Alimentos-y-Premios')).toBe(false);
    expect(isResolvedProductOfferUrl('https://www.amazon.com.mx/s?k=audifonos')).toBe(false);
  });
});

describe('URL de producto Liverpool en moderación', () => {
  const LIVERPOOL = 'https://www.liverpool.com.mx/tienda/pdp/smartwatch-fit-5-con-gps/1199500218';
  const LIVERPOOL_MCP = 'https://www.liverpool.com.mx/tienda/pdp/x/1061490571';
  const LIVERPOOL_SKU =
    'https://www.liverpool.com.mx/tienda/pdp/eau-de-toilette-ros-para-mujer/1061490571?skuId=1061490571';

  it('reconoce el PDP real, con slug genérico o con skuId', () => {
    expect(isResolvedProductOfferUrl(LIVERPOOL)).toBe(true);
    expect(isResolvedProductOfferUrl(LIVERPOOL_MCP)).toBe(true);
    expect(isResolvedProductOfferUrl(LIVERPOOL_SKU)).toBe(true);
    expect(classifyOfferPageKind(LIVERPOOL)).toBe('PRODUCT');
  });

  it('rechaza home, categoría y hosts falsos', () => {
    expect(isResolvedProductOfferUrl('https://www.liverpool.com.mx/')).toBe(false);
    expect(isResolvedProductOfferUrl('https://www.liverpool.com.mx/tienda/celulares/cat5150024')).toBe(false);
    expect(isResolvedProductOfferUrl('https://liverpool.com.mx.evil.com/tienda/pdp/x/1061490571')).toBe(false);
    expect(isResolvedProductOfferUrl('https://www.liverpool.com.mx/tienda/pdp/x/abc')).toBe(false);
  });

  it('el moderador puede confirmar el enlace del mismo producto y no el de otro', () => {
    expect(validateAffiliatePaste(LIVERPOOL_MCP, LIVERPOOL_SKU)).toMatchObject({ valid: true, productMatched: true });
    expect(validateAffiliatePaste(LIVERPOOL, LIVERPOOL)).toMatchObject({ valid: true });
    expect(validateAffiliatePaste(LIVERPOOL, LIVERPOOL_MCP).valid).toBe(false);
  });

  it('Liverpool sin programa afiliado queda lista para aprobar con su PDP', () => {
    expect(
      evaluateAffiliateReadiness({ offerUrl: LIVERPOOL_SKU, originalOfferUrl: LIVERPOOL_MCP, linkModOk: false }).ready,
    ).toBe(true);
  });
});

describe('navegación y publicidad de V1', () => {
  const actionBar = readFileSync(join(process.cwd(), 'app/components/ActionBar.tsx'), 'utf8');
  const mobile = actionBar.slice(actionBar.indexOf('aventa-public-tabbar'), actionBar.indexOf('aventa-desktop-sidebar'));
  const desktop = actionBar.slice(actionBar.indexOf('aventa-desktop-sidebar'));
  const meNav = readFileSync(join(process.cwd(), 'app/me/dashboard/MeSectionPage.tsx'), 'utf8');
  const submissions = readFileSync(join(process.cwd(), 'lib/mcp/submissions.ts'), 'utf8');
  const ownerRole = readFileSync(join(process.cwd(), 'lib/team/authz/platformRole.ts'), 'utf8');

  it('el tab móvil abre Plaza y deja Favoritos dentro de /me', () => {
    expect(mobile).toContain('href="/plaza"');
    expect(mobile).toContain('Plaza');
    expect(mobile).not.toContain('Favoritos');
    expect(mobile).not.toContain('/me/favorites');
    expect(desktop).toContain('href="/me/favorites"');
    expect(meNav).toContain("href: '/me/favorites'");
    expect(meNav).toContain("href: '/me/ofertas'");
    expect(meNav).not.toContain("href: '/settings'");
    expect(meNav).not.toContain('Configuración');
  });

  it('la publicidad se inserta cada 3 ofertas desde la política del feed', () => {
    expect(DEFAULT_FEED_POLICY).toMatchObject({ firstAfter: 3, every: 3 });
  });

  it('el owner entra por user_roles y no recibe payout', () => {
    expect(ownerRole).toContain("role', 'owner'");
    expect(ownerRole).toContain('user_roles');
    expect(ownerRole).not.toContain('payout_intents');
  });

  it('un envío de Hunter crea la oferta pending y conserva el lote como registro', () => {
    expect(submissions).toContain('enqueueHunterOffer');
    expect(submissions).not.toContain('No toca `offers`');
  });
});

describe('dinero congelado', () => {
  it('MONEY_PATH_FROZEN=true bloquea el camino', () => {
    const previous = process.env.MONEY_PATH_FROZEN;
    process.env.MONEY_PATH_FROZEN = 'true';
    expect(isMoneyPathFrozen()).toBe(true);
    process.env.MONEY_PATH_FROZEN = previous;
  });
});
