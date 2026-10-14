import { describe, expect, it } from 'vitest';
import { extractLiverpoolProduct } from '@/lib/offers/productExtraction/liverpoolExtract';
import { offerExtractionUserMessage } from '@/lib/offers/productExtraction/classifyExtraction';

describe('extractLiverpoolProduct', () => {
  const page = 'https://www.liverpool.com.mx/tienda/pdp/audifonos/110123456';

  it('JSON-LD con ListPrice/SalePrice e image array', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Audífonos Sony',
      image: [
        'https://sscdn.liverpool.com.mx/xl/a.jpg',
        'https://sscdn.liverpool.com.mx/xl/b.jpg',
      ],
      offers: {
        '@type': 'Offer',
        priceCurrency: 'MXN',
        priceSpecification: [
          {
            '@type': 'UnitPriceSpecification',
            priceType: 'https://schema.org/ListPrice',
            price: 2499,
          },
          {
            '@type': 'UnitPriceSpecification',
            priceType: 'https://schema.org/SalePrice',
            price: 1799,
          },
        ],
      },
    })}</script>`;
    const r = extractLiverpoolProduct(html, page);
    expect(r.store).toBe('Liverpool');
    expect(r.title).toBe('Audífonos Sony');
    expect(r.suggestedDiscount).toBe(1799);
    expect(r.suggestedOriginal).toBe(2499);
    expect(r.images.length).toBeGreaterThanOrEqual(2);
  });

  it('lee el precio SSR de data-testid discounted sin usar meses sin intereses', () => {
    const html = `
      <title>Audífonos Over-Ear Jbl LIVE 780NC inalámbricos | Liverpool</title>
      <div data-testid="1199845185-configurator-price">
        <span data-testid="discounted"><span>$<!-- -->2,969</span><span class="invisible">.</span>10</span>
        <span data-testid="original"><span class="line-through">$<!-- -->3,299</span><span class="invisible">.</span>00</span>
      </div>
      <p>Y/o hasta 13 meses sin intereses de $253.77</p>
    `;
    const r = extractLiverpoolProduct(
      html,
      'https://www.liverpool.com.mx/tienda/pdp/audifonos-over-ear-jbl-live-780nc-inalambrica-con-cancelacion-de-ruido/1199845185',
    );
    expect(r.suggestedDiscount).toBe(2969.1);
    expect(r.suggestedOriginal).toBe(3299);
    expect(r.title).toBe('Audífonos Over-Ear Jbl LIVE 780NC inalámbricos');
  });

  it('og:title e imagen del CDN sp*.liverpool sin JSON-LD', () => {
    const html = `
      <meta property="og:title" content="Tenis Superstar para hombre | Liverpool"/>
      <meta property="og:image" content="https://sp237.liverpool.com.mx/i/1166231295.jpg"/>
      <span data-testid="discounted"><span>$<!-- -->1,586</span></span>
      <span data-testid="original"><span class="line-through">$<!-- -->2,299</span></span>
    `;
    const r = extractLiverpoolProduct(html, 'https://www.liverpool.com.mx/tienda/pdp/tenis-superstar-para-hombre/1166231231');
    expect(r.title).toBe('Tenis Superstar para hombre');
    expect(r.image).toBe('https://sp237.liverpool.com.mx/i/1166231295.jpg');
    expect(r.suggestedDiscount).toBe(1586);
    expect(r.suggestedOriginal).toBe(2299);
  });

  it('CDN sscdn embebido aporta fotos', () => {
    const html = `
      https://sscdn.liverpool.com.mx/xl/foto1.jpg
      https://sscdn.liverpool.com.mx/xl/foto2.webp
      <meta property="og:title" content="Producto LV" />
    `;
    const r = extractLiverpoolProduct(html, page);
    expect(r.title).toBe('Producto LV');
    expect(r.images.length).toBeGreaterThanOrEqual(2);
  });
});

describe('UX tips Walmart / Liverpool', () => {
  it('tip walmart ip', () => {
    const msg = offerExtractionUserMessage({
      status: 'failed',
      reason: 'extract_failed',
      url: 'https://www.walmart.com.mx/ip/x/1',
    });
    expect(msg).toMatch(/ip\//i);
  });

  it('tip liverpool pdp', () => {
    const msg = offerExtractionUserMessage({
      status: 'failed',
      reason: 'extract_failed',
      url: 'https://www.liverpool.com.mx/tienda/pdp/x/1',
    });
    expect(msg).toMatch(/liverpool|pdp/i);
  });
});
