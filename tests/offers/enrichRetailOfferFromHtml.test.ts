import { describe, expect, it } from 'vitest';
import { enrichRetailOfferFromHtml } from '@/lib/offers/enrichRetailOfferFromHtml';
import { parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';

describe('enrichRetailOfferFromHtml', () => {
  it('Home Depot: Product Offer → título, imagen y precio', () => {
    const page = 'https://www.homedepot.com.mx/p/taladro-bosch-20v-297545';
    const html = `<html><head>
      <meta property="og:title" content="OG fallback" />
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Taladro Bosch 20V',
        url: page,
        sku: '297545',
        image: 'https://www.homedepot.com.mx/medias/taladro.jpg',
        offers: { '@type': 'Offer', price: 799, priceCurrency: 'MXN' },
      })}</script>
    </head></html>`;
    const e = enrichRetailOfferFromHtml(html, page);
    expect(e.usedJsonLd).toBe(true);
    expect(e.title).toBe('Taladro Bosch 20V');
    expect(e.image).toContain('taladro.jpg');
    expect(e.store).toBe('Home Depot');
    expect(e.suggestedDiscount).toBe(799);
    expect(e.suggestedOriginal).toBeNull();
  });

  it('Liverpool: UnitPriceSpecification ListPrice + SalePrice', () => {
    const page = 'https://www.liverpool.com.mx/tienda/pdp/audifonos/123';
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Audífonos Sony',
      image: 'https://sscdn.liverpool.com.mx/xl/audifonos.jpg',
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
    const products = parseJsonLdProducts(html, page);
    expect(products[0]?.price).toBe(1799);
    expect(products[0]?.originalPrice).toBe(2499);

    const e = enrichRetailOfferFromHtml(html, page);
    expect(e.store).toBe('Liverpool');
    expect(e.title).toBe('Audífonos Sony');
    expect(e.suggestedDiscount).toBe(1799);
    expect(e.suggestedOriginal).toBe(2499);
  });

  it('Coppel: Offer.price + priceSpecification.listPrice', () => {
    const page = 'https://www.coppel.com/smartphone-xyz-123';
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Smartphone XYZ',
      image: ['https://cdn.coppel.com/img/phone.jpg'],
      offers: {
        '@type': 'Offer',
        price: 4999,
        priceCurrency: 'MXN',
        priceSpecification: {
          '@type': 'PriceSpecification',
          listPrice: 5999,
        },
      },
    })}</script>`;
    const e = enrichRetailOfferFromHtml(html, page);
    expect(e.store).toBe('Coppel');
    expect(e.title).toBe('Smartphone XYZ');
    expect(e.suggestedDiscount).toBe(4999);
    expect(e.suggestedOriginal).toBe(5999);
    expect(e.image).toContain('phone.jpg');
  });

  describe('Soriana: precio de lista tachado (SFCC)', () => {
    const page = 'https://www.soriana.com/leche-uht-lala-deslactosada-1-litro-6-piezas/11400966.html';
    const jsonLd = (price: string) =>
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Leche UHT Lala Deslactosada 1 Litro 6 Piezas',
        image: 'https://www.soriana.com/img/leche.jpg',
        offers: { '@type': 'Offer', priceCurrency: 'MXN', price },
      })}</script>`;
    const strike = (value: string) =>
      `<div class="list d-flex align-items-center inline-max-content-disabled align-self-start size-price-content align-self-lg-center"> <span class="value " content="${value}"> <span class="strike-through cart-price price-plp price-not-found price-pdp text-truncate "> $${value} </span> </span> </div>`;

    it('toma el tachado de la ficha como precio de lista', () => {
      const html = `${jsonLd('163.00')}${strike('224.50')}${strike('224.50')}`;
      const e = enrichRetailOfferFromHtml(html, page);
      expect(e.suggestedDiscount).toBe(163);
      expect(e.suggestedOriginal).toBe(224.5);
    });

    it('varios tachados distintos: no adivina cuál es el del producto', () => {
      const html = `${jsonLd('163.00')}${strike('224.50')}${strike('199.00')}`;
      expect(enrichRetailOfferFromHtml(html, page).suggestedOriginal).toBeNull();
    });

    it('tachado que no supera el precio actual se ignora y no intercambia precios', () => {
      const html = `${jsonLd('163.00')}${strike('150.00')}`;
      const e = enrichRetailOfferFromHtml(html, page);
      expect(e.suggestedDiscount).toBe(163);
      expect(e.suggestedOriginal).toBeNull();
    });

    it('sin tachado no hay precio de lista', () => {
      expect(enrichRetailOfferFromHtml(jsonLd('163.00'), page).suggestedOriginal).toBeNull();
    });

    it('el mismo marcado en otra tienda no se interpreta', () => {
      const html = `${jsonLd('163.00')}${strike('224.50')}`;
      const e = enrichRetailOfferFromHtml(html, 'https://www.chedraui.com.mx/leche-lala-6-pack/p');
      expect(e.suggestedOriginal).toBeNull();
    });
  });

  it('sin JSON-LD cae a og tags + hostname', () => {
    const page = 'https://www.liverpool.com.mx/tienda/x';
    const html = `<meta property="og:title" content="Solo OG" />
      <meta property="og:image" content="https://sscdn.liverpool.com.mx/og.jpg" />`;
    const e = enrichRetailOfferFromHtml(html, page);
    expect(e.usedJsonLd).toBe(false);
    expect(e.title).toBe('Solo OG');
    expect(e.store).toBe('Liverpool');
    expect(e.image).toContain('og.jpg');
  });
});
