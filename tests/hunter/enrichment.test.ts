import { beforeEach, describe, expect, it } from 'vitest';
import {
  enrichParsedOfferMetadata,
  isValidOfferImage,
  resetHunterEnrichmentMetrics,
  getHunterEnrichmentMetrics,
} from '@/lib/hunter/enrichment';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { MercadoLibrePublicOffer } from '@/lib/offers/mlPublicOffer';
import { mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';
import { selectOfferImages } from '@/lib/offers/selectOfferImages';
import { decideAutonomous } from '@/lib/autonomous';
import type { AutonomousDecisionInput } from '@/lib/autonomous';
import type { DealVerifierResult } from '@/lib/verifier/types';

const ML_URL = 'https://www.mercadolibre.com.mx/laptop/MLM1234567';
const AMZ_URL = 'https://www.amazon.com.mx/dp/B08N5WRWNW';
const API_A = 'https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123456789_022026-O.jpg';
const API_B = 'https://http2.mlstatic.com/D_NQ_NP_2X_BBB222-MLA123456789_022026-O.jpg';
const SAME_RESOURCE_HTML = 'https://http2.mlstatic.com/D_NQ_NP_2X_AAA111-MLA123456789_022026-F.jpg';
const SIMILAR_HTML = 'https://http2.mlstatic.com/D_NQ_NP_2X_ZZZ999-MLA000000000_022026-O.jpg';
const OG_ML = 'https://http2.mlstatic.com/D_NQ_NP_2X_META88-MLA555555555_022026-O.jpg';
const AMZ_IMG = 'https://m.media-amazon.com/images/I/71ABCDEFGH._AC_SL1500_.jpg';

function baseMeta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: ML_URL,
    title: 'Laptop gaming RTX sólida para oficina',
    store: 'Mercado Libre',
    imageUrl: API_A,
    discountPrice: 12000,
    originalPrice: 24000,
    discountPercent: 50,
    ...over,
  };
}

function mlOffer(over: Partial<MercadoLibrePublicOffer> = {}): MercadoLibrePublicOffer {
  return {
    title: 'Laptop API',
    price: 11000,
    originalPrice: 22000,
    pictures: [],
    categoryId: 'MLM1648',
    pathNames: [],
    source: 'ml_api',
    ...over,
  };
}

describe('isValidOfferImage', () => {
  it('9. placeholder → rechazado', () => {
    expect(isValidOfferImage('/placeholder.png')).toBe(false);
    expect(isValidOfferImage('https://placehold.co/400')).toBe(false);
  });

  it('10. banner/logo → rechazado', () => {
    expect(isValidOfferImage('https://http2.mlstatic.com/banner/hero.jpg')).toBe(false);
    expect(isValidOfferImage('https://m.media-amazon.com/images/logo.png')).toBe(false);
    expect(isValidOfferImage('https://cdn.example.com/favicon.ico')).toBe(false);
  });

  it('acepta foto de producto https', () => {
    expect(isValidOfferImage(API_A)).toBe(true);
    expect(isValidOfferImage(AMZ_IMG)).toBe(true);
  });
});

describe('Hunter Enrichment Engine', () => {
  beforeEach(() => {
    resetHunterEnrichmentMetrics();
  });

  it('1. candidato ya completo → no necesita enriquecimiento adicional', async () => {
    let mlCalls = 0;
    let htmlCalls = 0;
    const r = await enrichParsedOfferMetadata(baseMeta(), {
      source: 'ml_api_legacy',
      deps: {
        fetchMlOffer: async () => {
          mlCalls += 1;
          return mlOffer({ pictures: [API_B] });
        },
        fetchHtml: async () => {
          htmlCalls += 1;
          return null;
        },
      },
    });
    expect(r.skippedNetwork).toBe(true);
    expect(r.changed).toBe(false);
    expect(r.meta.imageUrl).toBe(API_A);
    expect(mlCalls).toBe(0);
    expect(htmlCalls).toBe(0);
  });

  it('2. candidato sin imagen → obtiene imagen confiable', async () => {
    const r = await enrichParsedOfferMetadata(baseMeta({ imageUrl: '' }), {
      source: 'ml_worker',
      skipHtml: true,
      deps: {
        fetchMlOffer: async () => mlOffer({ pictures: [API_A, API_B] }),
        fetchHtml: async () => {
          throw new Error('html no debía llamarse');
        },
      },
    });
    expect(r.imageStatus).toBe('valid');
    expect(r.meta.imageUrl).toBe(API_A);
    expect(r.changed).toBe(true);
  });

  it('3. candidato con imagen incorrecta → no la acepta', async () => {
    const r = await enrichParsedOfferMetadata(
      baseMeta({ imageUrl: 'https://http2.mlstatic.com/banner/promo.jpg' }),
      {
        source: 'ml_worker',
        skipHtml: true,
        deps: {
          fetchMlOffer: async () => mlOffer({ pictures: ['https://cdn.example.com/logo.png'] }),
        },
      }
    );
    expect(isValidOfferImage(r.meta.imageUrl)).toBe(false);
    expect(r.meta.imageUrl).toBe('');
    expect(r.imageStatus).toBe('missing');
  });

  it('4. ML >=2 imágenes API → no mezcla HTML', async () => {
    let htmlCalls = 0;
    const r = await enrichParsedOfferMetadata(baseMeta({ imageUrl: '' }), {
      source: 'ml_api_legacy',
      deps: {
        fetchMlOffer: async () => mlOffer({ pictures: [API_A, API_B] }),
        fetchHtml: async () => {
          htmlCalls += 1;
          return `<meta property="og:image" content="${SIMILAR_HTML}" />`;
        },
      },
    });
    expect(htmlCalls).toBe(0);
    expect(r.meta.imageUrl).toBe(API_A);
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [API_A, API_B],
      htmlImages: [SIMILAR_HTML],
      trustedHtmlImages: [OG_ML],
    });
    expect(merged).toEqual([API_A, API_B]);
  });

  it('5. ML 1 imagen → no mezcla similares', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [API_A],
      htmlImages: [SIMILAR_HTML, SAME_RESOURCE_HTML],
      trustedHtmlImages: [OG_ML],
    });
    expect(merged[0]).toBe(API_A);
    expect(merged.every((u) => u.includes('AAA111'))).toBe(true);
    expect(merged).not.toContain(SIMILAR_HTML);
    expect(merged).not.toContain(OG_ML);
  });

  it('6. ML 0 imágenes → metadata confiable', async () => {
    const html = `<meta property="og:image" content="${OG_ML}" />`;
    const r = await enrichParsedOfferMetadata(baseMeta({ imageUrl: '' }), {
      source: 'env_urls',
      html,
      deps: {
        fetchMlOffer: async () => mlOffer({ pictures: [] }),
        fetchHtml: async () => {
          throw new Error('no re-fetch');
        },
      },
    });
    expect(r.meta.imageUrl).toBe(OG_ML);
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [],
      htmlImages: [SIMILAR_HTML],
      trustedHtmlImages: [OG_ML],
    });
    expect(merged).toEqual([OG_ML]);
  });

  it('7. Amazon con imagen', async () => {
    const html = `<meta property="og:image" content="${AMZ_IMG}" />`;
    const r = await enrichParsedOfferMetadata(
      baseMeta({
        canonicalUrl: AMZ_URL,
        store: 'Amazon',
        imageUrl: '',
      }),
      {
        source: 'amazon_asin',
        html,
        deps: {
          fetchMlOffer: async () => {
            throw new Error('ML no debía llamarse');
          },
        },
      }
    );
    expect(r.meta.imageUrl).toBe(AMZ_IMG);
  });

  it('8. URL sin imagen → missing, no imagen inventada', async () => {
    const r = await enrichParsedOfferMetadata(baseMeta({ imageUrl: '' }), {
      source: 'env_urls',
      skipHtml: true,
      deps: {
        fetchMlOffer: async () => null,
      },
    });
    expect(r.imageStatus).toBe('missing');
    expect(r.meta.imageUrl).toBe('');
    expect(r.meta.imageUrl).not.toMatch(/placeholder/i);
  });

  it('11. duplicados de imagen → deduplicados', () => {
    const picked = selectOfferImages([
      AMZ_IMG,
      `${AMZ_IMG}?width=500`,
      'https://m.media-amazon.com/images/I/71ABCDEFGH._AC_US40_.jpg',
    ]);
    expect(picked).toHaveLength(1);
  });

  it('12. source ya enriquecido → no hacer request innecesario', async () => {
    let mlCalls = 0;
    const cache = new Map<string, ParsedOfferMetadata>();
    const incomplete = baseMeta({ imageUrl: '' });
    const opts = {
      source: 'ml_api',
      skipHtml: true,
      cache,
      deps: {
        fetchMlOffer: async () => {
          mlCalls += 1;
          return mlOffer({ pictures: [API_A] });
        },
      },
    };
    const first = await enrichParsedOfferMetadata(incomplete, opts);
    const second = await enrichParsedOfferMetadata(incomplete, opts);
    expect(mlCalls).toBe(1);
    expect(first.meta.imageUrl).toBe(API_A);
    expect(second.meta).toEqual(first.meta);
    expect(second.skippedNetwork).toBe(true);
    expect(getHunterEnrichmentMetrics().bySource.ml_api_legacy?.candidatesFound).toBe(2);
  });

  it('13. enrichment error → candidato seguro → HUMAN_REVIEW', async () => {
    const incomplete = baseMeta({ imageUrl: '' });
    const r = await enrichParsedOfferMetadata(incomplete, {
      source: 'ml_worker',
      skipHtml: true,
      deps: {
        fetchMlOffer: async () => {
          throw new Error('api down');
        },
      },
    });
    expect(r.meta.imageUrl).toBe('');
    expect(getHunterEnrichmentMetrics().enrichmentFailed).toBe(1);

    const verifier = {
      decision: 'auto_approve',
      score: 85,
      confidence: 0.91,
      reasons: [],
      checks: {
        price: { status: 'pass', detail: 'ok' },
        discount: { status: 'pass', detail: 'ok' },
        duplicate: { status: 'pass', detail: 'ok' },
        seller: { status: 'pass', detail: 'ok' },
        availability: { status: 'unknown', detail: 'n/a' },
        quality: { status: 'warn', detail: 'Imagen ausente o placeholder' },
        risk: { status: 'pass', detail: 'ok' },
      },
      breakdown: {
        discount: 50,
        popularity: 50,
        rating: 50,
        category: 50,
        priceAppeal: 50,
        historical: 50,
        total: 85,
      },
      ingestDecision: 'auto_approve',
      duplicateOfferId: null,
    } satisfies DealVerifierResult;

    const decision = decideAutonomous({
      verifier,
      thresholds: { autoApproveMinScore: 78, requireImage: true, autoApproveEnabled: true },
      monetization: { status: 'ready', label: 'Lista', detail: 'ok' },
      requiresAffiliateValidation: false,
      source: 'ml_worker',
      sourceHealth: 'healthy',
      existingModerationStatus: null,
      title: incomplete.title,
      imageUrl: r.meta.imageUrl,
      store: 'Amazon',
      price: 12000,
      discountPercent: 50,
      effectiveDiscountPercent: 50,
      suspectedArtificialListPrice: false,
      shadowDuplicate: { status: 'pass', detail: 'ok', matchId: null },
    } satisfies AutonomousDecisionInput);
    expect(decision.decision).toBe('HUMAN_REVIEW');
  });

  it('14. misma entrada → mismo resultado', async () => {
    const input = baseMeta({ imageUrl: '' });
    const deps = {
      fetchMlOffer: async () => mlOffer({ pictures: [API_A, API_B] }),
    };
    const a = await enrichParsedOfferMetadata(input, { source: 'ml_api_legacy', skipHtml: true, deps });
    resetHunterEnrichmentMetrics();
    const b = await enrichParsedOfferMetadata(input, { source: 'ml_api_legacy', skipHtml: true, deps });
    expect(a.meta).toEqual(b.meta);
    expect(a.imageStatus).toBe(b.imageStatus);
  });
});

function abortError(message: string): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function reviewIfMissingImage(imageUrl: string, title: string) {
  return decideAutonomous({
    verifier: {
      decision: 'auto_approve',
      score: 85,
      confidence: 0.91,
      reasons: [],
      checks: {
        price: { status: 'pass', detail: 'ok' },
        discount: { status: 'pass', detail: 'ok' },
        duplicate: { status: 'pass', detail: 'ok' },
        seller: { status: 'pass', detail: 'ok' },
        availability: { status: 'unknown', detail: 'n/a' },
        quality: { status: 'warn', detail: 'Imagen ausente o placeholder' },
        risk: { status: 'pass', detail: 'ok' },
      },
      breakdown: {
        discount: 50,
        popularity: 50,
        rating: 50,
        category: 50,
        priceAppeal: 50,
        historical: 50,
        total: 85,
      },
      ingestDecision: 'auto_approve',
      duplicateOfferId: null,
    },
    thresholds: { autoApproveMinScore: 78, requireImage: true, autoApproveEnabled: true },
    monetization: { status: 'ready', label: 'Lista', detail: 'ok' },
    requiresAffiliateValidation: false,
    source: 'ml_worker',
    sourceHealth: 'healthy',
    existingModerationStatus: null,
    title,
    imageUrl,
    store: 'Amazon',
    price: 12000,
    discountPercent: 50,
    effectiveDiscountPercent: 50,
    suspectedArtificialListPrice: false,
    shadowDuplicate: { status: 'pass', detail: 'ok', matchId: null },
  } satisfies AutonomousDecisionInput);
}

describe('FASE 4.3.1 reliability', () => {
  beforeEach(() => {
    resetHunterEnrichmentMetrics();
  });

  it('A) ML timeout → enrichmentFailed controlado, no rompe el ciclo', async () => {
    const cycle: Array<'ok' | 'failed'> = [];
    const first = await enrichParsedOfferMetadata(baseMeta({ imageUrl: '' }), {
      source: 'ml_api_legacy',
      skipHtml: true,
      deps: {
        fetchMlOffer: async () => {
          throw abortError('The operation was aborted due to timeout');
        },
      },
    });
    cycle.push(first.imageStatus === 'missing' ? 'ok' : 'failed');
    const second = await enrichParsedOfferMetadata(baseMeta(), {
      source: 'ml_api_legacy',
      deps: {
        fetchMlOffer: async () => {
          throw new Error('no debía llamarse');
        },
      },
    });
    cycle.push(second.skippedNetwork ? 'ok' : 'failed');
    expect(first.imageStatus).toBe('missing');
    expect(first.meta.imageUrl).toBe('');
    expect(getHunterEnrichmentMetrics().enrichmentFailed).toBe(1);
    expect(cycle).toEqual(['ok', 'ok']);
  });

  it('B) ML abort → mismo comportamiento seguro', async () => {
    const r = await enrichParsedOfferMetadata(baseMeta({ imageUrl: '' }), {
      source: 'ml_worker',
      skipHtml: true,
      deps: {
        fetchMlOffer: async () => {
          throw abortError('aborted');
        },
      },
    });
    expect(r.meta.title).toBe(baseMeta().title);
    expect(r.meta.imageUrl).toBe('');
    expect(getHunterEnrichmentMetrics().enrichmentFailed).toBe(1);
  });

  it('D) candidato con imagen → no request adicional', async () => {
    let htmlCalls = 0;
    const r = await enrichParsedOfferMetadata(baseMeta(), {
      source: 'amazon_paapi',
      sourceDetail: 'amazon:paapi',
      skipHtml: false,
      deps: {
        fetchMlOffer: async () => {
          throw new Error('ML no');
        },
        fetchHtml: async () => {
          htmlCalls += 1;
          return '<html></html>';
        },
      },
    });
    expect(r.skippedNetwork).toBe(true);
    expect(htmlCalls).toBe(0);
    expect(r.meta.imageUrl).toBe(API_A);
  });

  it('E) sin imagen + fallback HTML confiable → obtiene imagen', async () => {
    let htmlCalls = 0;
    const r = await enrichParsedOfferMetadata(
      baseMeta({ canonicalUrl: AMZ_URL, store: 'Amazon', imageUrl: '' }),
      {
        source: 'amazon_paapi',
        sourceDetail: 'amazon:paapi',
        skipHtml: false,
        deps: {
          fetchMlOffer: async () => {
            throw new Error('ML no');
          },
          fetchHtml: async () => {
            htmlCalls += 1;
            return `<meta property="og:image" content="${AMZ_IMG}" />`;
          },
        },
      }
    );
    expect(htmlCalls).toBe(1);
    expect(r.meta.imageUrl).toBe(AMZ_IMG);
    expect(r.imageStatus).toBe('valid');
  });

  it('F) fallback con similares → no acepta imágenes incorrectas', async () => {
    const r = await enrichParsedOfferMetadata(baseMeta({ imageUrl: '' }), {
      source: 'ml_worker',
      skipHtml: false,
      html: `<img src="${SIMILAR_HTML}" /><div class="ui-recommendations"><img src="${SIMILAR_HTML}" /></div>`,
      deps: {
        fetchMlOffer: async () => mlOffer({ pictures: [] }),
        fetchHtml: async () => {
          throw new Error('no re-fetch');
        },
      },
    });
    expect(r.meta.imageUrl).toBe('');
    expect(r.imageStatus).toBe('missing');
    expect(r.meta.imageUrl).not.toBe(SIMILAR_HTML);
  });

  it('G) timeout de enrichment → HUMAN_REVIEW', async () => {
    const r = await enrichParsedOfferMetadata(baseMeta({ imageUrl: '' }), {
      source: 'ml_worker',
      skipHtml: true,
      deps: {
        fetchMlOffer: async () => {
          throw abortError('ml_api_timeout');
        },
      },
    });
    expect(r.imageStatus).toBe('missing');
    expect(reviewIfMissingImage(r.meta.imageUrl, r.meta.title).decision).toBe('HUMAN_REVIEW');
  });

  it('H) misma entrada → resultado determinista', async () => {
    const input = baseMeta({ canonicalUrl: AMZ_URL, store: 'Amazon', imageUrl: '' });
    const deps = {
      fetchMlOffer: async () => {
        throw new Error('ML no');
      },
      fetchHtml: async () => `<meta property="og:image" content="${AMZ_IMG}" />`,
    };
    const a = await enrichParsedOfferMetadata(input, {
      source: 'amazon_asin',
      skipHtml: false,
      deps,
    });
    resetHunterEnrichmentMetrics();
    const b = await enrichParsedOfferMetadata(input, {
      source: 'amazon_asin',
      skipHtml: false,
      deps,
    });
    expect(a.meta).toEqual(b.meta);
    expect(a.imageStatus).toBe(b.imageStatus);
    expect(a.imageStatus).toBe('valid');
  });
});
