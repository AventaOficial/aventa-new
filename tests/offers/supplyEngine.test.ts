import { describe, expect, it } from 'vitest';
import { buildOfferBatchDrafts, classifyEnrichmentFailure } from '@/lib/offers/batchPaste';
import { enrichRetailOfferFromHtml } from '@/lib/offers/enrichRetailOfferFromHtml';
import {
  buildLotRowFromDiscoveryAndParse,
  canonicalAvailability,
  mergeDiscoveryWithEnrichment,
  processOfferUrl,
  recalculatedDiscount,
  resolveIngestionIdentity,
} from '@/lib/offers/ingestion';
import { parseCouponPaste } from '@/lib/intelligence/coupon/parse';

const HUNTER = `Producto: Samsung Galaxy S26 Ultra
Precio: $21,699
Precio anterior: $37,999
Descuento: 80%
Precio con cupón: $19,999
Imagen: https://m.media-amazon.com/images/I/hunter.jpg
Seller: Momotech
Stock: Disponible
URL: https://www.amazon.com.mx/dp/B0G4B54DR1?utm_source=hunter
`;

describe('supply engine — hunter paste', () => {
  it('1-3. Producto, precio actual y anterior', () => {
    const [row] = buildOfferBatchDrafts(HUNTER);
    expect(row?.title).toMatch(/Samsung Galaxy S26 Ultra/);
    expect(row?.price).toBe('21699');
    expect(row?.originalPrice).toBe('37999');
  });

  it('título y precio sin encabezado de producto', () => {
    const [row] = buildOfferBatchDrafts(`Título: Audífonos
Precio: MX$1,299.00 MXN
URL: https://www.amazon.com.mx/dp/B0TESTAS01`);
    expect(row?.title).toBe('Audífonos');
    expect(row?.price).toBe('1299');
  });

  it('4-6. URL suelta no hereda el título del bloque anterior', () => {
    const text = `${HUNTER}
https://www.amazon.com.mx/dp/B0OTHER001
`;
    const drafts = buildOfferBatchDrafts(text);
    expect(drafts).toHaveLength(2);
    expect(drafts[1]?.title).toBe('');
    expect(drafts[1]?.price).toBe('');
    expect(drafts[1]?.image).toBe('');
  });

  it('7. conserva imageUrl del Hunter y no usa el precio con cupón', () => {
    const [row] = buildOfferBatchDrafts(HUNTER);
    expect(row?.image).toContain('hunter.jpg');
    expect(row?.price).toBe('21699');
    expect(row?.seller).toBe('Momotech');
    expect(row?.availability).toBe('Disponible');
  });
});

describe('supply engine — PDP merge', () => {
  it('8-11. PDP gana imagen, precio, seller y disponibilidad; conserva evidencia', () => {
    const merged = mergeDiscoveryWithEnrichment(
      {
        rawUrl: 'https://www.amazon.com.mx/dp/B0G4B54DR1',
        title: 'Samsung corto',
        price: 6192,
        originalPrice: 37999,
        image: 'https://m.media-amazon.com/images/I/hunter.jpg',
        seller: 'Momotech',
        availability: 'Disponible',
        source: 'hunter',
      },
      {
        title: 'Samsung Galaxy S26 Ultra 512GB',
        price: 6499,
        originalPrice: 37999,
        image: 'https://m.media-amazon.com/images/I/pdp.jpg',
        seller: 'Amazon México',
        availability: 'https://schema.org/InStock',
        brand: 'Samsung',
        source: 'json_ld',
      },
    );
    expect(merged.price.value).toBe(6499);
    expect(merged.price.discoveryValue).toBe(6192);
    expect(merged.price.enrichmentValue).toBe(6499);
    expect(merged.conflicts).toContain('price');
    expect(merged.conflictNote).toContain('Hunter 6192');
    expect(merged.conflictNote).toContain('PDP 6499');
    expect(merged.conflictNote).toContain('Usado 6499');
    expect(merged.image.value).toContain('pdp.jpg');
    expect(merged.seller.value).toBe('Amazon México');
    expect(merged.availability.value).toBe('in_stock');
    expect(merged.availability.conflict).toBe(false);
    expect(merged.brand.value).toBe('Samsung');
    expect(merged.discount).toBe(recalculatedDiscount(6499, 37999));
    expect(merged.discount).not.toBe(80);
  });

  it('imagen basura de PDP no reemplaza la del Hunter', () => {
    const merged = mergeDiscoveryWithEnrichment(
      {
        rawUrl: 'https://www.amazon.com.mx/dp/B0G4B54DR1',
        image: 'https://m.media-amazon.com/images/I/real.jpg',
        source: 'hunter',
      },
      { image: 'https://www.amazon.com.mx/favicon.ico', source: 'json_ld' },
    );
    expect(merged.image.value).toContain('real.jpg');
    expect(merged.image.conflict).toBe(false);
  });

  it('solo quedan N no se vuelve stock global', () => {
    expect(canonicalAvailability('Solo quedan 2')).toBe('unknown');
    expect(canonicalAvailability('https://schema.org/OutOfStock')).toBe('out_of_stock');
    expect(canonicalAvailability(null)).toBeNull();
  });

  it('seller ausente no bloquea ready_for_review', () => {
    const built = buildLotRowFromDiscoveryAndParse({
      discovery: {
        rawUrl: 'https://www.amazon.com.mx/dp/B00TESTASIN',
        title: 'Item',
        store: 'Amazon',
        price: 100,
        source: 'hunter',
      },
      parseData: {
        title: 'Item',
        image: 'https://m.media-amazon.com/images/I/a.jpg',
        store: 'Amazon',
        suggested_discount_price: 100,
        extraction_status: 'success',
      },
      pdpAttempted: true,
    });
    expect(built.quality.readiness).toBe('ready_for_review');
    expect(built.summary.warnings).toContain('seller unavailable');
    expect(built.summary.checks).toEqual(expect.arrayContaining(['title', 'image', 'price', 'url']));
  });

  it('JSON-LD entrega seller, marca y disponibilidad', () => {
    const page = 'https://www.amazon.com.mx/dp/B0G4B54DR1';
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Samsung Galaxy S26 Ultra',
      url: page,
      brand: { '@type': 'Brand', name: 'Samsung' },
      image: 'https://m.media-amazon.com/images/I/pdp.jpg',
      aggregateRating: { ratingValue: 4.6, reviewCount: 120 },
      offers: {
        '@type': 'Offer',
        price: 21699,
        priceCurrency: 'MXN',
        availability: 'https://schema.org/InStock',
        seller: { '@type': 'Organization', name: 'Amazon México' },
      },
    })}</script>`;
    const facts = enrichRetailOfferFromHtml(html, page);
    expect(facts.seller).toBe('Amazon México');
    expect(facts.brand).toBe('Samsung');
    expect(facts.availability).toBe('in_stock');
    expect(facts.rating).toBe(4.6);
    expect(facts.reviewCount).toBe(120);
    expect(facts.suggestedDiscount).toBe(21699);
  });
});

describe('supply engine — retry, URL, identity, cupón', () => {
  it('12-14. 429 y 5xx se reintentan; 4xx no', () => {
    expect(classifyEnrichmentFailure(429).retryable).toBe(true);
    expect(classifyEnrichmentFailure(503).retryable).toBe(true);
    expect(classifyEnrichmentFailure(404).retryable).toBe(false);
    expect(classifyEnrichmentFailure(400).retryable).toBe(false);
  });

  it('15, 23-25. URL malformada es incierta; tracking se quita; click_id no se duplica ni mete cupón', () => {
    expect(processOfferUrl('http://[').urlUncertain).toBe(true);
    const url = processOfferUrl(
      'https://www.amazon.com.mx/dp/B00TESTASIN?utm_source=hunter&click_id=keep',
      'Amazon',
      { clickId: 'abc' },
    );
    expect(url.rawUrl).toContain('utm_source');
    expect(url.canonicalUrl).not.toContain('utm_source');
    expect(url.affiliateUrl).toContain('click_id=abc');
    expect(url.affiliateUrl.match(/click_id=/g)?.length).toBe(1);
    expect(url.affiliateUrl.toLowerCase()).not.toContain('coupon');
  });

  it('16-18. mismo ASIN o item ML con otro precio no cambia la identidad', () => {
    const a = resolveIngestionIdentity('https://www.amazon.com.mx/dp/B0G4B54DR1?utm_source=a');
    const b = resolveIngestionIdentity('https://www.amazon.com.mx/dp/B0G4B54DR1?utm_source=b');
    expect(a.key).toBe('amz:B0G4B54DR1');
    expect(b.key).toBe(a.key);
    const ml = resolveIngestionIdentity('https://www.mercadolibre.com.mx/p/MLM1234567890');
    const ml2 = resolveIngestionIdentity('https://articulo.mercadolibre.com.mx/MLM-1234567890-x');
    expect(ml.key).toBe(ml2.key);
    expect(ml.key).toMatch(/^ml:/);
  });

  it('21-22. un cupón mencionado no se verifica ni altera el precio', () => {
    const text = `${HUNTER}
Cupón: AHORRA
Código: AHORRA
Tienda: Amazon
Descuento: 10%
`;
    const [offer] = buildOfferBatchDrafts(text);
    expect(offer?.price).toBe('21699');
    const coupons = parseCouponPaste(text);
    expect(coupons.drafts.some((draft) => draft.code === 'AHORRA' && draft.ok)).toBe(true);
    const offerOnly = parseCouponPaste(`Producto: JBL\nPrecio actual: $2,969\nPrecio con cupón: —\nURL: https://www.liverpool.com.mx/tienda/pdp/x/1`);
    expect(offerOnly.drafts).toHaveLength(0);
    expect(offerOnly.failures).toHaveLength(0);
    expect(coupons.drafts.every((draft) => draft.confidence <= 0.25)).toBe(true);
  });
});
