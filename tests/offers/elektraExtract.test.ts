import { describe, expect, it } from 'vitest';
import { extractElektraProduct } from '@/lib/offers/productExtraction/elektraExtract';
import { offerExtractionUserMessage } from '@/lib/offers/productExtraction/classifyExtraction';

describe('extractElektraProduct', () => {
  const page = 'https://www.elektra.mx/lavadora-12345';

  it('0 imágenes útiles → gallery vacía', () => {
    const r = extractElektraProduct('<html><body>sin meta</body></html>', page);
    expect(r.images).toEqual([]);
    expect(r.image).toBeNull();
    expect(r.store).toBe('Elektra');
  });

  it('N imágenes desde JSON-LD Product.image[]', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'TV Elektra',
      image: [
        'https://cdn.elektra.mx/img/a.jpg',
        'https://cdn.elektra.mx/img/b.jpg',
      ],
      offers: { '@type': 'Offer', price: 12999, priceCurrency: 'MXN' },
    })}</script>`;
    const r = extractElektraProduct(html, page);
    expect(r.title).toBe('TV Elektra');
    expect(r.images.length).toBeGreaterThanOrEqual(2);
    expect(r.suggestedDiscount).toBe(12999);
  });

  it('tip elektra ficha', () => {
    const msg = offerExtractionUserMessage({
      status: 'failed',
      errorCode: 'extract_failed',
      url: 'https://www.elektra.mx/x',
    });
    expect(msg).toMatch(/elektra/i);
  });
});
