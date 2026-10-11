import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enrichmentFromParseResponse } from '@/lib/offers/ingestion/fromParseResponse';
import {
  acceptedRating,
  acceptedReviewCount,
  verifiedCommercialFactsFromHtml,
} from '@/lib/offers/offerExtraction/verifiedCommercialFacts';

function product(id: string, extra: string): string {
  return `<script type="application/ld+json">{
    "@type": "Product",
    "sku": "${id}",
    "brand": { "name": "Sony" },
    "category": "Audio",
    "aggregateRating": { "ratingValue": "4.6", "reviewCount": "128", "bestRating": "5" },
    "offers": { "seller": { "name": "Amazon México" }, "availability": "https://schema.org/InStock" }
  }</script>${extra}`;
}

describe('hechos comerciales verificados', () => {
  it('devuelve vendedor, marca, valoración y reseñas del producto resuelto', () => {
    const facts = verifiedCommercialFactsFromHtml(product('B0TESTASIN', ''), 'B0TESTASIN');
    expect(facts).toMatchObject({
      seller: 'Amazon México',
      brand: 'Sony',
      rating: 4.6,
      reviewCount: 128,
      category: 'Audio',
    });
  });

  it('no toma los datos de otro producto de la misma página', () => {
    const html = product('OTROSKU', '') + product('B0TESTASIN', '');
    const other = verifiedCommercialFactsFromHtml(html.replace('B0TESTASIN', 'B0OTRO999'), 'B0TESTASIN');
    expect(other).toMatchObject({ seller: null, brand: null, rating: null, reviewCount: null });
    const wanted = verifiedCommercialFactsFromHtml(html, 'b0testasin');
    expect(wanted.seller).toBe('Amazon México');
  });

  it('anula un campo cuando dos bloques del mismo id no coinciden', () => {
    const html = `${product('B0TESTASIN', '')}<script type="application/ld+json">{
      "@type": "Product",
      "sku": "B0TESTASIN",
      "brand": { "name": "Otra" },
      "offers": { "seller": { "name": "Amazon México" } },
      "aggregateRating": { "ratingValue": 4.6, "reviewCount": 128 }
    }</script>`;
    const facts = verifiedCommercialFactsFromHtml(html, 'B0TESTASIN');
    expect(facts.brand).toBeNull();
    expect(facts.seller).toBe('Amazon México');
    expect(facts.rating).toBe(4.6);
  });

  it('rechaza valoración, reseñas y nombres que no son datos válidos', () => {
    expect(acceptedRating('excelente')).toBeNull();
    expect(acceptedRating(9)).toBeNull();
    expect(acceptedRating(9, 10)).toBe(9);
    expect(acceptedRating(0)).toBeNull();
    expect(acceptedRating(-1)).toBeNull();
    expect(acceptedReviewCount('doce')).toBeNull();
    expect(acceptedReviewCount(0)).toBeNull();
    expect(acceptedReviewCount(12.5)).toBeNull();
    expect(acceptedReviewCount('1,234')).toBe(1234);
    const html = `<script type="application/ld+json">{
      "@type": "Product",
      "sku": "B0TESTASIN",
      "brand": " ",
      "aggregateRating": { "ratingValue": "excelente", "reviewCount": -3 },
      "offers": { "seller": "" }
    }</script>`;
    expect(verifiedCommercialFactsFromHtml(html, 'B0TESTASIN')).toMatchObject({
      seller: null,
      brand: null,
      rating: null,
      reviewCount: null,
    });
  });

  it('sin identificador o sin ficha no inventa campos', () => {
    expect(verifiedCommercialFactsFromHtml(product('B0TESTASIN', ''), '  ')).toMatchObject({
      seller: null,
      brand: null,
      rating: null,
    });
    expect(verifiedCommercialFactsFromHtml('<html></html>', 'B0TESTASIN').seller).toBeNull();
  });
});

describe('contrato que consume el lote de moderación', () => {
  it('conserva los campos presentes y deja en null los ausentes o inválidos', () => {
    const present = enrichmentFromParseResponse({
      seller: 'Amazon México',
      brand: 'Sony',
      rating: 4.6,
      review_count: 128,
      title: 'Audífonos',
    });
    expect(present.seller).toBe('Amazon México');
    expect(present.brand).toBe('Sony');
    expect(present.rating).toBe(4.6);
    expect(present.reviewCount).toBe(128);

    const absent = enrichmentFromParseResponse({ title: 'Audífonos' });
    expect(absent.seller).toBeNull();
    expect(absent.brand).toBeNull();
    expect(absent.rating).toBeNull();
    expect(absent.reviewCount).toBeNull();

    const invalid = enrichmentFromParseResponse({
      seller: 12,
      brand: 4,
      rating: '4.6',
      review_count: '128',
    });
    expect(invalid.seller).toBeNull();
    expect(invalid.brand).toBeNull();
    expect(invalid.rating).toBeNull();
    expect(invalid.reviewCount).toBeNull();
  });

  it('la ruta pública reenvía los hechos del extractor y no vuelve a extraer', () => {
    const source = readFileSync('app/api/parse-offer-url/route.ts', 'utf8');
    expect(source).toContain('outcome.core.reputation.rating');
    expect(source).toContain('outcome.core.reputation.reviewCount');
    expect(source).toContain('outcome.core.merchant.seller');
    expect(source).toContain('outcome.core.product.brand');
    expect(source).not.toContain('rating: null');
    expect(source).not.toContain('parseAmazon');
    expect(source).not.toContain('pdpVerifiedFacts');
  });
});
