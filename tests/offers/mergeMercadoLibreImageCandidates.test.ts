import { describe, expect, it } from 'vitest';
import { mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';

const ITEM_A = 'https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123-O.jpg';
const ITEM_A_VARIANT = 'https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123-I.jpg';
const ITEM_B = 'https://http2.mlstatic.com/D_NQ_NP_2X_BBB222-MLA123-O.jpg';
const RELATED_C = 'https://http2.mlstatic.com/D_NQ_NP_2X_CCC333-MLA999-O.jpg';
const RELATED_D = 'https://http2.mlstatic.com/D_NQ_NP_2X_DDD444-MLA888-O.jpg';
const OG = 'https://http2.mlstatic.com/D_NQ_NP_2X_OGCOVER-MLA111-O.jpg';

describe('mergeMercadoLibreImageCandidates', () => {
  it('CASO A: API >=2 → solo API, sin HTML de relacionados', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [ITEM_A, ITEM_B],
      htmlImages: [ITEM_A, RELATED_C, RELATED_D],
      trustedHtmlImages: [OG],
      mlSource: 'ml_api',
    });
    expect(merged).toEqual([ITEM_A, ITEM_B]);
    expect(merged).not.toContain(RELATED_C);
  });

  it('CASO B: API 1 foto → solo mismo recurso; no contaminar con similares', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [ITEM_A],
      htmlImages: [ITEM_A_VARIANT, RELATED_C, RELATED_D],
      trustedHtmlImages: [OG],
      mlSource: 'ml_api',
    });
    expect(merged[0]).toBe(ITEM_A);
    expect(merged.every((u) => u.includes('AAA111'))).toBe(true);
    expect(merged).not.toContain(RELATED_C);
    expect(merged).not.toContain(RELATED_D);
    expect(merged).not.toContain(OG);
  });

  it('CASO B2: API 1 + product-scoped → completa galería sin relacionados', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [ITEM_A],
      htmlImages: [RELATED_C],
      productScopedHtmlImages: [ITEM_A, ITEM_B],
      mlSource: 'ml_api',
    });
    expect(merged).toContain(ITEM_A);
    expect(merged).toContain(ITEM_B);
    expect(merged).not.toContain(RELATED_C);
  });

  it('CASO C: API 0 → solo trusted meta, nunca scrape CDN amplio', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [],
      htmlImages: [RELATED_C, RELATED_D],
      trustedHtmlImages: [OG],
      mlSource: null,
    });
    expect(merged).toEqual([OG]);
    expect(merged).not.toContain(RELATED_C);
  });

  it('CASO C-social: API 0 + allowHtmlCdnFallback → CDN HTML permitido (meli.la)', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [],
      htmlImages: [ITEM_A, ITEM_B],
      trustedHtmlImages: [OG],
      allowHtmlCdnFallback: true,
      mlSource: null,
    });
    expect(merged.length).toBeGreaterThanOrEqual(2);
    expect(merged).toContain(ITEM_A);
  });

  it('CASO C sin trusted → vacío (mejor vacío que contaminado)', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [],
      htmlImages: [RELATED_C],
      trustedHtmlImages: [],
    });
    expect(merged).toEqual([]);
  });

  it('CASO D/E: dedupe variantes del mismo recurso', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [ITEM_A, ITEM_A_VARIANT, ITEM_A],
      htmlImages: [],
      mlSource: 'ml_api',
    });
    expect(merged).toHaveLength(1);
  });

  it('CASO F: ignora URLs inválidas', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: ['not-a-url', ITEM_A, 'ftp://x'],
      htmlImages: ['javascript:alert(1)', RELATED_C],
      mlSource: 'ml_api',
    });
    expect(merged).toEqual([ITEM_A]);
  });
});
