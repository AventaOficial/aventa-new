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
