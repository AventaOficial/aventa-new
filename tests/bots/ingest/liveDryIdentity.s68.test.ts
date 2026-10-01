/**
 * S6.8 — Live ↔ dry identity reconciliation.
 * Single authority: resolveMercadoLibreListingExternalId.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  toParsedMeta,
  type ExternalWorkerCandidate,
} from '@/lib/bots/ingest/externalWorker';
import { evaluateMachineLiveInsertEligibility } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import {
  buildMlWorkerSourceEventId,
  normalizeMlWorkerListing,
} from '@/lib/supplyIntelligence/adapters/mlWorkerListingAdapter';
import {
  hasMercadoLibreListingIdentity,
  resolveMercadoLibreListingExternalId,
} from '@/lib/offers/resolveMercadoLibreItem';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { resolveIdentityFromUrl } from '@/lib/dealIntelligence/identity';

const UP_MLMU =
  'https://www.mercadolibre.com.mx/espejo-luz-led-de-pared-tocador-bano-touch-cambio-3-luces/up/MLMU3097285590';
const PDP_MLM =
  'https://www.mercadolibre.com.mx/llave-de-impacto-inalambrica-luckssy-de-21v-y-520nm-con-motor-sin-escobillas-y-juego-de-herramientas-de-2-baterias/p/MLM48434598?wid=MLM48434598';
const ARTICULO_MLM = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo';

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

function candidate(url: string, over: Partial<ExternalWorkerCandidate> = {}): ExternalWorkerCandidate {
  return {
    url,
    canonicalUrl: url,
    title: 'Producto de prueba Mercado Libre con titulo suficiente',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_Q_NP_2X_x.jpg',
    discountPrice: 999,
    originalPrice: 1999,
    discountPercent: 50,
    cardDiscountSource: 'card_strikethrough',
    signals: {
      listingTypeId: 'worker_card',
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      imageProvenance: 'listing_card',
    },
    ...over,
  };
}

function idempotencyKeyFor(sourceEventId: string, url: string): string {
  // Mirrors RawObservation builder: hash of sourceEventId + url (stable check via build)
  return createHash('sha256').update(`${sourceEventId}|${url}`).digest('hex').slice(0, 32);
}

describe('S6.8 live ↔ dry identity reconciliation', () => {
  it('1. /up/MLMU… canonical id matches fingerprint convention', () => {
    const ext = resolveMercadoLibreListingExternalId(UP_MLMU);
    expect(ext).toBe('MLMU3097285590');
    expect(offerUrlFingerprint(UP_MLMU)).toBe('ml:MLMU3097285590');
    expect(strongProductFingerprintForUrl(UP_MLMU)).toBe('ml:MLMU3097285590');
    expect(hasMercadoLibreListingIdentity(UP_MLMU)).toBe(true);
  });

  it('2. dry normalize and live toParsedMeta share identity', () => {
    const c = candidate(UP_MLMU);
    const dry = normalizeMlWorkerListing(c);
    const live = toParsedMeta(c);
    expect(dry.ok).toBe(true);
    expect(live).not.toBeNull();
    if (!dry.ok || !live) return;
    expect(dry.value.externalListingId).toBe('MLMU3097285590');
    expect(resolveMercadoLibreListingExternalId(live.canonicalUrl)).toBe(
      dry.value.externalListingId,
    );
    expect(strongProductFingerprintForUrl(live.canonicalUrl)).toBe(
      strongProductFingerprintForUrl(dry.value.meta.canonicalUrl),
    );
  });

  it('3. fingerprint stable across dry/live meta', () => {
    const c = candidate(UP_MLMU);
    const dry = normalizeMlWorkerListing(c);
    const live = toParsedMeta(c);
    expect(dry.ok && live).toBeTruthy();
    if (!dry.ok || !live) return;
    const fpDry = strongProductFingerprintForUrl(dry.value.meta.canonicalUrl);
    const fpLive = strongProductFingerprintForUrl(live.canonicalUrl);
    expect(fpDry).toBe('ml:MLMU3097285590');
    expect(fpLive).toBe(fpDry);
  });

  it('4. sourceEventId stable', () => {
    const a = buildMlWorkerSourceEventId({ url: UP_MLMU });
    const b = buildMlWorkerSourceEventId({ url: UP_MLMU, canonicalUrl: UP_MLMU });
    expect(a).toBe('ml_worker:ml:MLMU3097285590');
    expect(b).toBe(a);
  });

  it('5. idempotency / observation identity stable for same URL', () => {
    const c = candidate(UP_MLMU);
    const n1 = normalizeMlWorkerListing(c);
    const n2 = normalizeMlWorkerListing(c);
    expect(n1.ok && n2.ok).toBe(true);
    if (!n1.ok || !n2.ok) return;
    expect(n1.value.sourceEventId).toBe(n2.value.sourceEventId);
    expect(n1.value.externalListingId).toBe(n2.value.externalListingId);
    const id = resolveIdentityFromUrl({ url: UP_MLMU, merchant: 'mercadolibre' });
    expect(id.identityStatus).toBe('exact');
    expect(id.productFingerprint).toBe('ml:MLMU3097285590');
    void idempotencyKeyFor;
  });

  it('6. malformed identity fails closed', () => {
    expect(resolveMercadoLibreListingExternalId('https://www.mercadolibre.com.mx/')).toBeNull();
    expect(hasMercadoLibreListingIdentity('not-a-url')).toBe(false);
    expect(toParsedMeta(candidate('https://www.mercadolibre.com.mx/ofertas'))).toBeNull();
  });

  it('7. host not allowlisted fails closed (dry)', () => {
    const dry = normalizeMlWorkerListing(
      candidate('https://evil.example.com/up/MLMU3097285590'),
    );
    expect(dry.ok).toBe(false);
    if (dry.ok) return;
    expect(dry.reason).toBe('host_not_allowlisted');
  });

  it('8. login/verification/gz blocked', () => {
    expect(toParsedMeta(candidate('https://www.mercadolibre.com.mx/gz/login'))).toBeNull();
    expect(
      toParsedMeta(
        candidate('https://www.mercadolibre.com.mx/account-verification?id=1'),
      ),
    ).toBeNull();
    const dryGz = normalizeMlWorkerListing(
      candidate('https://www.mercadolibre.com.mx/gz/home'),
    );
    expect(dryGz.ok).toBe(false);
  });

  it('9. no SKU-specific workaround: MLM /p/ and /up/MLMU share authority', () => {
    expect(resolveMercadoLibreListingExternalId(PDP_MLM)).toBe('MLM48434598');
    expect(resolveMercadoLibreListingExternalId(ARTICULO_MLM)).toBe('MLM1234567890');
    expect(resolveMercadoLibreListingExternalId(UP_MLMU)).toBe('MLMU3097285590');
    // Same helper — no branch per SKU
    for (const url of [PDP_MLM, ARTICULO_MLM, UP_MLMU]) {
      const c = candidate(url);
      expect(normalizeMlWorkerListing(c).ok).toBe(true);
      expect(toParsedMeta(c)).not.toBeNull();
    }
  });

  it('dry gate ≡ live eligibility for /up/MLMU candidate', () => {
    const c = candidate(UP_MLMU);
    const dry = normalizeMlWorkerListing(c);
    const liveMeta = toParsedMeta(c);
    expect(dry.ok && liveMeta).toBeTruthy();
    if (!dry.ok || !liveMeta) return;
    const config = baseConfig();
    const gate = evaluateMachineCandidateGate({
      url: dry.value.meta.canonicalUrl,
      meta: dry.value.meta,
      config,
      verifierDecision: 'pending',
    });
    const live = evaluateMachineLiveInsertEligibility({
      url: liveMeta.canonicalUrl,
      meta: liveMeta,
      config,
      verifierDecision: 'pending',
    });
    expect(live.qualityDecision).toBe(gate.qualityDecision);
    expect(live.wouldInsert).toBe(gate.wouldInsert);
    expect(live.eligible).toBe(gate.wouldInsert);
    // High-signal policy: listing_card without history is not auto-mint.
    // Dry and live must still agree (identity), regardless of admit/suppress.
    expect(['VERIFIED_OPPORTUNITY', 'SUPPRESSED', 'DUPLICATE', 'INVALID']).toContain(
      gate.qualityDecision,
    );
  });
});
