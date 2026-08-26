import { describe, it, expect } from 'vitest';
import {
  extractMercadoLibreStructuredPrices,
  extractOfferImages,
  extractSuggestedPrices,
  parsePositiveLocalizedNumber,
  stripOfferTrackingParams,
} from '../../lib/offers/parseOfferPageHtml';

describe('parseOfferPageHtml', () => {
  it('lee data-old-hires y varias imágenes I/ de Amazon', () => {
    const html = `
      <img data-old-hires="https://m.media-amazon.com/images/I/71AAA._AC_SL1500_.jpg" />
      <div id="altImages">
        <img src="https://m.media-amazon.com/images/I/71BBB._AC_SL1500_.jpg" />
        <img src="https://m.media-amazon.com/images/I/71CCC._AC_US40_.jpg" />
      </div>
    `;
    const imgs = extractOfferImages(html, 'https://www.amazon.com.mx/dp/X');
    expect(imgs.some((u) => u.includes('71AAA'))).toBe(true);
    expect(imgs.some((u) => u.includes('71BBB'))).toBe(true);
    expect(imgs.some((u) => u.includes('_AC_US40_'))).toBe(false);
  });

  it('extrae precio JSON-LD Offer', () => {
    const html = `<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":"397.68","priceCurrency":"MXN"}}</script>`;
    const p = extractSuggestedPrices(html);
    expect(p.discount).toBeCloseTo(397.68);
  });

  it('lee precio actual y tachado de Mercado Libre', () => {
    const html = `
      <span class="andes-money-amount__fraction">397</span>
      <span class="andes-money-amount andes-money-amount--previous">
        <span class="andes-money-amount__fraction">800</span>
      </span>
      {"price":397,"currency_id":"MXN","original_price":800}
    `;
    const p = extractSuggestedPrices(html);
    expect(p.discount).toBe(397);
    expect(p.original).toBe(800);
  });

  it('no toma el 749 de envío gratis si hay precio de ficha Amazon', () => {
    const html = `
      <span id="productTitle">Audífonos</span>
      <div id="corePriceDisplay_desktop_feature_div">
        <span class="a-price"><span class="a-offscreen">$1,299.00</span>
        <span class="a-price-whole">1,299</span><span class="a-price-fraction">00</span></span>
      </div>
      {"price":749,"currency":"MXN"}
      <p>Envío GRATIS en pedidos mayores a $749</p>
    `;
    const p = extractSuggestedPrices(html);
    expect(p.discount).toBe(1299);
  });

  it('en página Amazon sin corePrice no inventa precio desde umbral 749', () => {
    const html = `
      <span id="productTitle">Algo</span>
      <img src="https://m.media-amazon.com/images/I/71X.jpg" />
      <p>Envío GRATIS en pedidos mayores a $749</p>
      {"price":749}
    `;
    const p = extractSuggestedPrices(html);
    expect(p.discount).toBeNull();
    expect(p.original).toBeNull();
  });

  it('parsea locale MX / US / EU', () => {
    expect(parsePositiveLocalizedNumber('1.299')).toBe(1299);
    expect(parsePositiveLocalizedNumber('1.29')).toBeCloseTo(1.29);
    expect(parsePositiveLocalizedNumber('1,299.00')).toBe(1299);
    expect(parsePositiveLocalizedNumber('$1,299 MXN')).toBe(1299);
    expect(parsePositiveLocalizedNumber('1.299,00')).toBe(1299);
  });

  it('ML fraction con miles MX', () => {
    const html = `
      <span class="andes-money-amount__fraction">1.299</span>
      <span class="andes-money-amount andes-money-amount--previous">
        <span class="andes-money-amount__fraction">1.599</span>
      </span>
    `;
    const p = extractSuggestedPrices(html);
    expect(p.discount).toBe(1299);
    expect(p.original).toBe(1599);
  });

  it('nunca iguala original al precio actual', () => {
    const html = `{"price":500,"currency_id":"MXN","original_price":500}
      <span class="andes-money-amount__fraction">500</span>`;
    const p = extractSuggestedPrices(html);
    expect(p.discount).toBe(500);
    expect(p.original).toBeNull();
  });

  it('extractMercadoLibreStructuredPrices ignora andes-money-amount DOM', () => {
    const html = `
      <meta property="product:price:amount" content="397" />
      <meta property="product:original_price:amount" content="800" />
      <span class="andes-money-amount__fraction">999</span>
    `;
    const p = extractMercadoLibreStructuredPrices(html);
    expect(p.discount).toBe(397);
    expect(p.original).toBe(800);
  });

  it('strip tracking conserva wid / item_id / pdp_filters', () => {
    const raw =
      'https://www.mercadolibre.com.mx/x/p/MLM1?wid=MLM2&utm_source=a&matt_tool=1&tag=aventa&pdp_filters=item_id:MLM3';
    const cleaned = stripOfferTrackingParams(raw);
    const u = new URL(cleaned);
    expect(u.searchParams.get('wid')).toBe('MLM2');
    expect(u.searchParams.get('pdp_filters')).toBe('item_id:MLM3');
    expect(u.searchParams.get('utm_source')).toBeNull();
    expect(u.searchParams.get('matt_tool')).toBeNull();
    expect(u.searchParams.get('tag')).toBeNull();
  });
});
