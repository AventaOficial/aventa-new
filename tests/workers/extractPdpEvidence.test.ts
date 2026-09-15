import { describe, expect, it } from 'vitest';
import {
  extractMercadoLibrePdpEvidence,
  parsePositiveLocalizedNumber,
  pdpEvidenceToEnrichmentFields,
} from '../../workers/mercadolibre-worker/src/extractPdpEvidence.mjs';
import {
  canonicalizeUrl,
  workerCandidateEligibleForIngest,
} from '../../workers/mercadolibre-worker/src/ml.mjs';

const ARTICULO = 'https://articulo.mercadolibre.com.mx/MLM-58085819';
const P_URL =
  'https://www.mercadolibre.com.mx/rabanne-invictus/p/MLM23367112?wid=MLM23367112';
const UP_URL = 'https://www.mercadolibre.com.mx/tennis-adidas/up/MLMU2857394841';

function fixtureStructured() {
  return `
    <html><head>
      <meta property="og:title" content="Crema facial 50ml" />
      <meta property="og:image" content="https://http2.mlstatic.com/D_NQ_NP_ABC-O.webp" />
      <meta property="product:price:amount" content="397.68" />
      <meta property="product:price:currency" content="MXN" />
      <meta property="product:original_price:amount" content="800" />
      <script type="application/ld+json">{"@type":"Product","name":"Crema facial 50ml","offers":{"@type":"Offer","price":"397.68","priceCurrency":"MXN"}}</script>
    </head><body><h1 class="ui-pdp-title">Crema facial 50ml</h1></body></html>
  `;
}

function fixtureDomOnly() {
  return `
    <html><head><meta property="og:title" content="Audífonos BT" /></head>
    <body>
      <h1 class="ui-pdp-title">Audífonos BT</h1>
      <div class="ui-pdp-price__second-line">
        <span class="andes-money-amount__fraction">899</span>
        <span class="andes-money-amount__cents">50</span>
      </div>
    </body></html>
  `;
}

function fixtureDomWithOriginal() {
  return `
    <html><head><meta property="og:title" content="Laptop gamer" />
    <meta property="og:image" content="https://http2.mlstatic.com/D_NQ_NP_XYZ-O.webp" /></head>
    <body>
      <h1>Laptop gamer</h1>
      <span class="andes-money-amount andes-money-amount--previous">
        <span class="andes-money-amount__fraction">1.599</span>
      </span>
      <div class="ui-pdp-price__second-line">
        <span class="andes-money-amount__fraction">1.299</span>
      </div>
      {"price":1299,"currency_id":"MXN","original_price":1599}
    </body></html>
  `;
}

function fixtureNoPrice() {
  return `
    <html><head><meta property="og:title" content="Producto sin precio" /></head>
    <body><h1>Producto sin precio</h1><p>Sin stock</p></body></html>
  `;
}

function fixtureBlocked() {
  return `
    <html><head><title>Mercado Libre</title>
    <link href="https://http2.mlstatic.com/frontend-assets/suspicious-traffic-frontend/x.css" />
    </head>
    <body><div class="account-verification-main">¡Hola! Para continuar, ingresa a tu cuenta</div>
    <script>window._n={ctx:{r:{flags:{isBot:true}}}};</script>
    </body></html>
  `;
}

function fixtureUsdCurrency() {
  return `
    <html><head>
      <meta property="product:price:amount" content="19.99" />
      <meta property="product:price:currency" content="USD" />
      <meta property="og:title" content="Item USD" />
    </head><body><h1>Item USD</h1></body></html>
  `;
}

function fixtureStructureChanged() {
  // Sin andes-money; solo embedded MXN (estructura "nueva" / SPA).
  return `
    <html><head><meta property="og:title" content="Parlante portátil" />
    <meta property="og:image" content="https://http2.mlstatic.com/D_NQ_NP_PAR-O.webp" /></head>
    <body>
      <script>window.__PRELOADED_STATE__={"components":[{"price":449.9,"currency_id":"MXN","original_price":699}]}</script>
    </body></html>
  `;
}

describe('extractMercadoLibrePdpEvidence', () => {
  it('1. PDP con precio estructurado (meta + JSON-LD)', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureStructured(), { url: ARTICULO });
    expect(ev.ok).toBe(true);
    expect(ev.price?.value).toBeCloseTo(397.68);
    expect(ev.price?.source).toMatch(/meta|json_ld/);
    expect(ev.originalPrice?.value).toBe(800);
    expect(ev.title).toContain('Crema');
  });

  it('2. PDP con precio visible en DOM', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureDomOnly(), { url: P_URL });
    expect(ev.ok).toBe(true);
    expect(ev.price?.value).toBeCloseTo(899.5);
    expect(ev.evidence).toContain('dom_current');
  });

  it('3. PDP con precio + original price', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureDomWithOriginal(), { url: P_URL });
    expect(ev.ok).toBe(true);
    expect(ev.price?.value).toBe(1299);
    expect(ev.originalPrice?.value).toBe(1599);
    expect(ev.incomplete).toBe(false);
  });

  it('4. PDP con precio sin original price (no inventa)', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureDomOnly(), { url: ARTICULO });
    expect(ev.ok).toBe(true);
    expect(ev.price?.value).toBeGreaterThan(0);
    expect(ev.originalPrice).toBeNull();
    expect(ev.incomplete).toBe(true);
    const fields = pdpEvidenceToEnrichmentFields(ev);
    expect(fields.originalPrice).toBeNull();
  });

  it('5. PDP sin precio → incomplete', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureNoPrice(), { url: ARTICULO });
    expect(ev.ok).toBe(false);
    expect(ev.reason).toBe('sin_discount_price');
    expect(ev.price).toBeNull();
  });

  it('6. PDP con cambio de estructura (embedded MXN)', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureStructureChanged(), { url: P_URL });
    expect(ev.ok).toBe(true);
    expect(ev.price?.value).toBeCloseTo(449.9);
    expect(ev.originalPrice?.value).toBe(699);
  });

  it('7. /p/ URL integrity', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureDomWithOriginal(), { url: P_URL });
    expect(ev.canonicalUrl).toBe(P_URL);
    expect(canonicalizeUrl(P_URL)).toContain('/p/');
    expect(canonicalizeUrl(P_URL)).toContain('wid=');
  });

  it('8. /up/ URL integrity', () => {
    const html = fixtureDomOnly().replace('Audífonos BT', 'Tenis Adidas');
    const ev = extractMercadoLibrePdpEvidence(html, { url: UP_URL });
    expect(ev.canonicalUrl).toBe(UP_URL);
    expect(ev.ok).toBe(true);
  });

  it('9. articulo.mercadolibre.com.mx', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureStructured(), { url: ARTICULO });
    expect(ev.canonicalUrl).toBe(ARTICULO);
    expect(ev.productId).toMatch(/MLM58085819/i);
  });

  it('10. Precio inválido', () => {
    const html = `<meta property="product:price:amount" content="0" /><h1>X</h1>`;
    const ev = extractMercadoLibrePdpEvidence(html, { url: ARTICULO });
    expect(ev.ok).toBe(false);
    expect(ev.price).toBeNull();
  });

  it('11. Moneda inesperada', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureUsdCurrency(), { url: ARTICULO });
    expect(ev.ok).toBe(false);
    expect(ev.reason).toBe('unexpected_currency');
    expect(ev.currency).toBe('USD');
  });

  it('12. No inventar original price cuando falta', () => {
    const fields = pdpEvidenceToEnrichmentFields(
      extractMercadoLibrePdpEvidence(fixtureDomOnly(), { url: ARTICULO }),
    );
    expect(fields.discountPrice).toBeGreaterThan(0);
    expect(fields.originalPrice).toBeNull();
  });

  it('13. No romper canonical URL', () => {
    const url = `${ARTICULO}?matt_tool=1&wid=MLM58085819`;
    const ev = extractMercadoLibrePdpEvidence(fixtureStructured(), { url });
    expect(ev.canonicalUrl).toBe(url);
  });

  it('14. Sticky → evidence rich (precio+original+title+image)', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureDomWithOriginal(), { url: ARTICULO });
    expect(ev.ok).toBe(true);
    expect(ev.incomplete).toBe(false);
    expect(ev.title).toBeTruthy();
    expect(ev.imageUrl).toContain('mlstatic');
    expect(ev.price!.value).toBeLessThan(ev.originalPrice!.value);
  });

  it('15. Sticky → existing DQE gate (pdp_original)', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureDomWithOriginal(), { url: ARTICULO });
    const fields = pdpEvidenceToEnrichmentFields(ev);
    const candidate = {
      discountPrice: fields.discountPrice,
      originalPrice: fields.originalPrice,
      evidenceSource: 'pdp',
      cardDiscountSource: 'pdp',
      originalFromBadgeOnly: false,
      signals: { cardDiscountSource: 'pdp' },
    };
    expect(workerCandidateEligibleForIngest(candidate)).toEqual({
      ok: true,
      reason: 'pdp_original',
    });
  });

  it('16. Fresh regression: card_strikethrough sigue elegible sin inventar', () => {
    const candidate = {
      discountPrice: 1000,
      originalPrice: 1500,
      evidenceSource: 'card_strikethrough',
      cardDiscountSource: 'card_strikethrough',
      originalFromBadgeOnly: false,
      signals: { cardDiscountSource: 'card_strikethrough' },
    };
    expect(workerCandidateEligibleForIngest(candidate).ok).toBe(true);
  });

  it('blocked account-verification → pdp_blocked (no sin_discount_price falso)', () => {
    const ev = extractMercadoLibrePdpEvidence(fixtureBlocked(), {
      url: 'https://www.mercadolibre.com.mx/gz/account-verification?go=x',
    });
    expect(ev.blocked).toBe(true);
    expect(ev.reason).toBe('pdp_blocked');
    expect(ev.ok).toBe(false);
  });

  it('parsePositiveLocalizedNumber MX miles', () => {
    expect(parsePositiveLocalizedNumber('1.299')).toBe(1299);
    expect(parsePositiveLocalizedNumber('1.29')).toBeCloseTo(1.29);
  });
});
