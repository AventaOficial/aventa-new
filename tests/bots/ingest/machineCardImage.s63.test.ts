/**
 * S6.3 — Card image extraction / image wiring.
 * Does not change S6.1 gate policy or S6.2 price provenance.
 */

import { describe, expect, it } from 'vitest';
import type { ExternalWorkerCandidate } from '@/lib/bots/ingest/externalWorker';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import { preserveMachinePriceProvenance } from '@/lib/bots/ingest/machinePriceProvenance';
import { normalizeOfferImageUrl } from '@/lib/offerPath';
import {
  normalizeMlWorkerListing,
  normalizedListingToRawObservation,
} from '@/lib/supplyIntelligence';
import {
  collectRawUrlsFromImgAttrs,
  firstUrlFromSrcset,
  normalizeAbsoluteImageUrl,
  pickBestCardImageUrl,
  scoreCardImageCandidate,
} from '../../../workers/mercadolibre-worker/src/cardImage.mjs';

function baseConfig(over: Partial<BotIngestConfig> = {}): BotIngestConfig {
  return {
    profile: 'standard',
    enabled: true,
    botUserId: 'x',
    botUserIdTech: null,
    botUserIdStaples: null,
    botAuthorDualMode: false,
    botUserIdsForQuota: ['x'],
    morningSustainedEnabled: false,
    morningHourStart: 5,
    morningHourEndExclusive: 11,
    morningMaxPerRunMin: 2,
    morningMaxPerRunMax: 5,
    timezone: 'America/Mexico_City',
    normalMaxPerRunMin: 1,
    normalMaxPerRunMax: 3,
    boostMaxOffers: 20,
    boostLocalHourStart: 7,
    boostLocalMinuteEnd: 30,
    dailyMaxOffers: 120,
    candidatePoolMax: 40,
    maxPerRun: 5,
    minDiscountPercent: 20,
    category: null,
    urlsFromEnv: [],
    discoverMlEnabled: true,
    mlQueries: [],
    mlCategoryIds: [],
    mlUseDefaultQueries: true,
    mlSearchLimitPerRequest: 50,
    mlMaxCollect: 80,
    mlSortTrending: 'sold_quantity_desc',
    techCategoryIds: ['MLM1648'],
    techCategoryIdSet: new Set(['MLM1648']),
    amazonAsins: [],
    amazonDpBase: 'https://www.amazon.com.mx/dp/',
    amazonSource: 'scrape',
    amazonPaapiEnabled: false,
    amazonPaapiAccessKey: null,
    amazonPaapiSecretKey: null,
    amazonPaapiPartnerTag: null,
    amazonPaapiHost: 'webservices.amazon.com.mx',
    amazonPaapiRegion: 'us-east-1',
    minSoldQuantityMl: 50,
    minRatingAverage: 4,
    minRatingReviewsCount: 5,
    mlFetchReviews: false,
    mlReviewFetchMax: 0,
    keepaEnabled: false,
    keepaApiKey: null,
    keepaDomainId: 11,
    autoApproveEnabled: true,
    legacyAutoApproveWriteEnabled: false,
    autoApproveMinScore: 78,
    autoApproveWorkerMinScore: 55,
    autoApproveWorkerMinDiscountPercent: 28,
    autoApproveRequireImage: true,
    workerMaxPerRun: 10,
    rejectBelowScore: 40,
    forcePendingMinScore: null,
    scoreWeights: {
      discount: 0.28,
      popularity: 0.22,
      rating: 0.2,
      category: 0.15,
      priceAppeal: 0.15,
    },
    titleBlocklistGenericRe: null,
    titleMinLength: 12,
    delayMsMin: 100,
    delayMsMax: 200,
    externalWorkerEnabled: true,
    ...over,
  } as BotIngestConfig;
}

const CDN = 'https://http2.mlstatic.com/D_NQ_NP_2X_PRODUCT123-MLM-O.webp';
const CDN_ALT = 'https://http2.mlstatic.com/D_NQ_NP_2X_ALT456-MLM-O.webp';

describe('S6.3 card image extraction helpers', () => {
  it('1. img[src] válido', () => {
    const urls = collectRawUrlsFromImgAttrs({ src: CDN });
    expect(pickBestCardImageUrl(urls)).toBe(CDN);
  });

  it('2. img[data-src] válido', () => {
    const urls = collectRawUrlsFromImgAttrs({
      src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'data-src': CDN,
    });
    expect(pickBestCardImageUrl(urls)).toBe(CDN);
  });

  it('3. data-srcset válido', () => {
    const urls = collectRawUrlsFromImgAttrs({
      'data-srcset': `${CDN} 1x, ${CDN_ALT} 2x`,
    });
    expect(pickBestCardImageUrl(urls)).toContain('ALT456');
  });

  it('4. srcset válido', () => {
    expect(
      firstUrlFromSrcset(
        'https://http2.mlstatic.com/D_NQ_NP_ABC-O.webp 1x, https://http2.mlstatic.com/D_NQ_NP_2X_ABC-O.webp 2x',
      ),
    ).toContain('2X_ABC');
  });

  it('5. picture/source srcset (vía attrs map)', () => {
    const fromSource = firstUrlFromSrcset(`${CDN} 340w, ${CDN_ALT} 680w`);
    expect(pickBestCardImageUrl([fromSource])).toContain('mlstatic.com');
  });

  it('6. lazy-loaded image (data-lazy-src)', () => {
    const urls = collectRawUrlsFromImgAttrs({
      src: '',
      'data-lazy-src': CDN,
    });
    expect(pickBestCardImageUrl(urls)).toBe(CDN);
  });

  it('7. invalid URL', () => {
    expect(pickBestCardImageUrl(['not-a-url', 'ftp://evil.example/x.jpg'])).toBeNull();
  });

  it('8. unsafe schemes rejected', () => {
    expect(normalizeAbsoluteImageUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeAbsoluteImageUrl('data:image/png;base64,aaa')).toBeNull();
    expect(normalizeAbsoluteImageUrl('blob:https://www.mercadolibre.com.mx/x')).toBeNull();
    expect(scoreCardImageCandidate('javascript:void(0)')).toBeLessThan(1);
  });

  it('9. placeholder rejected', () => {
    expect(
      pickBestCardImageUrl(['https://http2.mlstatic.com/placeholder-lazy.gif']),
    ).toBeNull();
  });

  it('10. seller avatar/logo rejected', () => {
    expect(
      pickBestCardImageUrl([
        'https://http2.mlstatic.com/seller-avatar-123.jpg',
        'https://http2.mlstatic.com/meli-logo.png',
      ]),
    ).toBeNull();
  });

  it('11. multiple images → best product CDN', () => {
    const best = pickBestCardImageUrl([
      'https://cdn.example.com/other.jpg',
      CDN,
      'https://http2.mlstatic.com/shipping-icon.png',
    ]);
    expect(best).toBe(CDN);
  });

  it('12. first invalid + second valid', () => {
    const best = pickBestCardImageUrl([
      'data:image/gif;base64,xxx',
      'https://http2.mlstatic.com/placeholder.png',
      CDN_ALT,
    ]);
    expect(best).toBe(CDN_ALT);
  });

  it('13. no image', () => {
    expect(pickBestCardImageUrl([])).toBeNull();
    expect(pickBestCardImageUrl([null, '', undefined] as unknown as string[])).toBeNull();
  });

  it('14. existing absolute CDN URL', () => {
    expect(normalizeAbsoluteImageUrl(CDN)).toBe(CDN);
    expect(normalizeOfferImageUrl(CDN)).toBe(CDN);
  });

  it('15. URL normalization (protocol-relative + path)', () => {
    expect(normalizeAbsoluteImageUrl('//http2.mlstatic.com/D_NQ_NP_X.webp')).toBe(
      'https://http2.mlstatic.com/D_NQ_NP_X.webp',
    );
    expect(normalizeAbsoluteImageUrl('/D_NQ_NP_X.webp')).toBe(
      'https://http2.mlstatic.com/D_NQ_NP_X.webp',
    );
  });
});

describe('S6.3 image propagation + regressions', () => {
  const trustedCandidate = (): ExternalWorkerCandidate => ({
    url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-s63',
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-s63',
    title: 'Audífonos Bluetooth noise cancelling oferta S63',
    store: 'Mercado Libre',
    imageUrl: CDN,
    discountPrice: 698,
    originalPrice: 2492,
    discountPercent: 72,
    cardDiscountSource: 'card_strikethrough',
    signals: {
      listingTypeId: 'worker_card',
      cardDiscountSource: 'card_strikethrough',
      originalPriceProvenance: 'listing_card',
      imageProvenance: 'listing_card',
      // S6.1 price-truth: mint-eligible card requires historyReady.
      historyReady: true,
    },
  });

  it('16. S6.2 provenance unchanged when image present', () => {
    const n = normalizeMlWorkerListing(trustedCandidate());
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.value.meta.signals?.originalPriceProvenance).toBe('listing_card');
    expect(n.value.meta.signals?.cardDiscountSource).toBe('card_strikethrough');
    expect(n.value.meta.imageUrl).toBe(CDN);
    expect(n.value.meta.signals?.imageProvenance).toBe('listing_card');
  });

  it('17. price provenance unchanged by image wiring', () => {
    const preserved = preserveMachinePriceProvenance({
      salePrice: 698,
      originalPrice: 2492,
      signals: {
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
        imageProvenance: 'listing_card',
      },
      cardDiscountSource: 'card_strikethrough',
    });
    expect(preserved.signals.originalPriceProvenance).toBe('listing_card');
    expect(preserved.signals.imageProvenance).toBe('listing_card');
  });

  it('18. gate behavior unchanged (verified + no PARTIAL_NO_IMAGE when image present)', () => {
    const n = normalizeMlWorkerListing(trustedCandidate());
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.value.meta.signals?.historyReady).toBe(true);
    const gate = evaluateMachineCandidateGate({
      url: n.value.meta.canonicalUrl,
      meta: n.value.meta,
      config: baseConfig(),
      verifierDecision: 'pending',
    });
    expect(gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(gate.wouldInsert).toBe(true);
    expect(gate.reasonCodes).not.toContain('PARTIAL_NO_IMAGE');
    expect(gate.reasonCodes).toContain('VERIFIED_CARD_PRICE');
  });

  it('imageUrl null still gates as before (PARTIAL_NO_IMAGE warning, verified)', () => {
    const c = trustedCandidate();
    c.imageUrl = null;
    c.signals = { ...c.signals, imageProvenance: undefined };
    const n = normalizeMlWorkerListing(c);
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.value.meta.imageUrl).toBe('');
    expect(n.value.meta.signals?.historyReady).toBe(true);
    const gate = evaluateMachineCandidateGate({
      url: n.value.meta.canonicalUrl,
      meta: n.value.meta,
      config: baseConfig(),
      verifierDecision: 'pending',
    });
    expect(gate.wouldInsert).toBe(true);
    expect(gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(gate.reasonCodes).toContain('PARTIAL_NO_IMAGE');
  });

  it('RawObservation carries imagePresent + imageProvenance in summary', () => {
    const n = normalizeMlWorkerListing(trustedCandidate());
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    const obs = normalizedListingToRawObservation(n.value);
    expect(obs.payload.summary?.imagePresent).toBe(true);
    expect(obs.payload.summary?.imageProvenance).toBe('listing_card');
    // price provenance untouched
    expect(obs.payload.summary?.originalPriceProvenance).toBe('listing_card');
  });

  it('poly-card__content must not count as poly-card root token', () => {
    expect('poly-card__content'.split(/\s+/).includes('poly-card')).toBe(false);
    expect('poly-card poly-card--grid'.split(/\s+/).includes('poly-card')).toBe(true);
  });

  it('login/verification image paths rejected', () => {
    expect(
      normalizeAbsoluteImageUrl(
        'https://www.mercadolibre.com.mx/gz/account-verification/x.png',
      ),
    ).toBeNull();
  });
});

