import { describe, expect, it } from 'vitest';
import { extractCoppelProduct } from '@/lib/offers/productExtraction/coppelExtract';
import { offerExtractionUserMessage } from '@/lib/offers/productExtraction/classifyExtraction';

describe('extractCoppelProduct', () => {
  const page = 'https://www.coppel.com/taladro-12345';

  it('0 imágenes útiles → gallery vacía', () => {
    const r = extractCoppelProduct('<html><body>sin meta</body></html>', page);
    expect(r.images).toEqual([]);
    expect(r.image).toBeNull();
    expect(r.store).toBe('Coppel');
  });

  it('N imágenes desde JSON-LD Product.image[]', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Licuadora Coppel',
      image: [
        'https://cdn.coppel.com/img/a.jpg',
        'https://cdn.coppel.com/img/b.jpg',
        'https://cdn.coppel.com/img/c.jpg',
      ],
      offers: { '@type': 'Offer', price: 899, priceCurrency: 'MXN' },
    })}</script>`;
    const r = extractCoppelProduct(html, page);
    expect(r.title).toBe('Licuadora Coppel');
    expect(r.images.length).toBeGreaterThanOrEqual(3);
    expect(r.suggestedDiscount).toBe(899);
  });

  it('tip coppel ficha', () => {
    const msg = offerExtractionUserMessage({
      status: 'failed',
      errorCode: 'extract_failed',
      url: 'https://www.coppel.com/x',
    });
    expect(msg).toMatch(/coppel/i);
  });
});
