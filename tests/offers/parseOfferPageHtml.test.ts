import { describe, it, expect } from 'vitest';
import { extractOfferImages, extractSuggestedPrices, parsePositiveLocalizedNumber } from '../../lib/offers/parseOfferPageHtml';

describe('parseOfferPageHtml', () => {
  it('lee varios og:image y hiRes de Amazon', () => {
    const html = `
      <meta property="og:image" content="https://m.media-amazon.com/images/I/cover.jpg" />
      <script>{"hiRes":"https://m.media-amazon.com/images/I/a.jpg","large":"https://m.media-amazon.com/images/I/b.jpg"}</script>
      <script>{"hiRes":"https://m.media-amazon.com/images/I/c.jpg"}</script>
    `;
    const imgs = extractOfferImages(html, 'https://www.amazon.com.mx/dp/X');
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    expect(imgs[0]).toContain('cover.jpg');
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

  it('parsea montos MX con coma', () => {
    expect(parsePositiveLocalizedNumber('$1,299.50')).toBe(1299.5);
    expect(parsePositiveLocalizedNumber('12.999,50')).toBe(12999.5);
  });
});
