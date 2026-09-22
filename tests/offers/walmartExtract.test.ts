import { describe, expect, it } from 'vitest';
import { extractWalmartProduct } from '@/lib/offers/productExtraction/walmartExtract';

describe('extractWalmartProduct', () => {
  const page = 'https://www.walmart.com.mx/ip/taladro/12345';

  it('0 imágenes útiles → gallery vacía', () => {
    const r = extractWalmartProduct('<html><body>sin meta</body></html>', page);
    expect(r.images).toEqual([]);
    expect(r.image).toBeNull();
    expect(r.store).toBe('Walmart');
  });

  it('1 imagen desde og', () => {
    const html = `<meta property="og:title" content="Producto W" />
      <meta property="og:image" content="https://i5.walmartimages.com.mx/asr/one.jpg" />`;
    const r = extractWalmartProduct(html, page);
    expect(r.title).toBe('Producto W');
    expect(r.images.length).toBe(1);
    expect(r.image).toContain('one.jpg');
  });

  it('N imágenes desde JSON-LD Product.image[]', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Licuadora',
      image: [
        'https://i5.walmartimages.com.mx/asr/a.jpg',
        'https://i5.walmartimages.com.mx/asr/b.jpg',
        'https://i5.walmartimages.com.mx/asr/c.jpg',
      ],
      offers: { '@type': 'Offer', price: 899, priceCurrency: 'MXN' },
    })}</script>`;
    const r = extractWalmartProduct(html, page);
    expect(r.title).toBe('Licuadora');
    expect(r.images.length).toBeGreaterThanOrEqual(3);
    expect(r.suggestedDiscount).toBe(899);
  });

  it('__NEXT_DATA__ allImages + wasPrice', () => {
    const next = {
      props: {
        pageProps: {
          initialData: {
            data: {
              product: {
                name: 'From Next',
                priceInfo: {
                  currentPrice: { price: 499 },
                  wasPrice: { price: 699 },
                },
                imageInfo: {
                  allImages: [
                    { url: 'https://i5.walmartimages.com.mx/asr/n1.jpg' },
                    { url: 'https://i5.walmartimages.com.mx/asr/n2.jpg' },
                  ],
                },
              },
            },
          },
        },
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script>`;
    const r = extractWalmartProduct(html, page);
    expect(r.images.length).toBeGreaterThanOrEqual(2);
    expect(r.suggestedDiscount).toBe(499);
    expect(r.suggestedOriginal).toBe(699);
  });

  it('ignora junk images', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'X',
      image: [
        'https://aventaofertas.com/logo.png',
        'https://i5.walmartimages.com.mx/asr/real.jpg',
      ],
      offers: { '@type': 'Offer', price: 100 },
    })}</script>`;
    const r = extractWalmartProduct(html, page);
    expect(r.images.every((u) => !u.includes('aventaofertas'))).toBe(true);
    expect(r.images.some((u) => u.includes('real.jpg'))).toBe(true);
  });
});
