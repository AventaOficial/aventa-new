/**
 * Post-reconciliation hardening — identity, dry-run metrics, Offer Standard vs DQE,
 * homepage rejection, Liverpool SKU idempotency.
 */
import { describe, expect, it } from 'vitest';
import {
  extractLiverpoolSkuForFingerprint,
  offerUrlFingerprint,
  offerUrlsAreSameProduct,
} from '@/lib/offers/offerUrlFingerprint';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import {
  isStrongProductFingerprint,
  strongProductFingerprintForUrl,
} from '@/lib/offers/findDuplicateOffer';
import { buildCycleFunnelSummary } from '@/lib/bots/ingest/cycleFunnelSummary';
import { buildSupplyOpsRunSummary } from '@/lib/bots/ingest/supplyOpsRunSummary';
import { prioritizeAcquisitionPool } from '@/lib/hunter/offerStandard';
import { evaluateDealQualityFromParsedMeta } from '@/lib/hunter/dealQuality';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { IngestItem } from '@/lib/bots/ingest/types';

const LIV_A =
  'https://www.liverpool.com.mx/tienda/pdp/iphone-18-pro-6-3-pulgadas-super-retina-xdr/1209379836';
const LIV_B =
  'https://www.liverpool.com.mx/tienda/pdp/otro-slug/1209379836?utm_source=x&tag=aff';
const LIV_HOME = 'https://www.liverpool.com.mx/tienda/home';
const AMZ = 'https://www.amazon.com.mx/dp/B0D1XD1ZV3?tag=aff-20&utm_source=x';
const ML = 'https://articulo.mercadolibre.com.mx/MLM-3536548700-audifonos-_JM?matt_tool=1';

describe('post-recon — strong identity / idempotency keys', () => {
  it('Amazon ASIN is stable across affiliate noise', () => {
    const id = resolveIngestionIdentity(AMZ);
    expect(id.strategy).toBe('amazon_asin');
    expect(id.key).toBe('amz:B0D1XD1ZV3');
    expect(id.productFingerprint).toBe('amz:B0D1XD1ZV3');
    expect(isStrongProductFingerprint(id.productFingerprint)).toBe(true);
  });

  it('Mercado Libre item id is stable', () => {
    const id = resolveIngestionIdentity(ML);
    expect(id.strategy).toBe('ml_item');
    expect(id.key).toBe('ml:MLM3536548700');
    expect(isStrongProductFingerprint(id.productFingerprint)).toBe(true);
  });

  it('Liverpool PDP SKU is strong identity across slug/utm variants', () => {
    expect(extractLiverpoolSkuForFingerprint(LIV_A)).toBe('1209379836');
    expect(extractLiverpoolSkuForFingerprint(LIV_B)).toBe('1209379836');
    expect(offerUrlFingerprint(LIV_A)).toBe('liv:1209379836');
    expect(offerUrlsAreSameProduct(LIV_A, LIV_B)).toBe(true);

    const a = resolveIngestionIdentity(LIV_A);
    const b = resolveIngestionIdentity(LIV_B);
    expect(a.strategy).toBe('liverpool_sku');
    expect(a.key).toBe('liv:1209379836');
    expect(a.key).toBe(b.key);
    expect(strongProductFingerprintForUrl(LIV_A)).toBe('liv:1209379836');
    expect(isStrongProductFingerprint('liv:1209379836')).toBe(true);
  });

  it('Liverpool homepage / non-PDP never invents product identity', () => {
    expect(extractLiverpoolSkuForFingerprint(LIV_HOME)).toBeNull();
    expect(offerUrlFingerprint(LIV_HOME)).toBeNull();
    const id = resolveIngestionIdentity(LIV_HOME);
    expect(id.strategy).toBe('none');
    expect(id.key).toBeNull();
    expect(id.productFingerprint).toBeNull();
  });
});

describe('post-recon — dry-run funnel does not count writes', () => {
  it('would_insert_observation separate from offers_sent_to_moderation', () => {
    const now = new Date().toISOString();
    const ops = buildSupplyOpsRunSummary({
      runId: 't',
      startedAt: now,
      finishedAt: now,
      profile: 'standard',
      dryRun: true,
      machinePendingWritesEnabled: false,
      discovered: 10,
      identityValid: 8,
      identityInvalid: 2,
      qualityVerified: 5,
      suppressed: 0,
      duplicates: 1,
      liveEligible: 4,
      budgetRejected: 0,
      writeAttempts: 0,
      writeSuccess: 0,
      writeDuplicate: 0,
      writeFailed: 0,
      writesDisabled: 0,
      dryRunSimulated: 3,
    });
    const funnel = buildCycleFunnelSummary(ops);
    expect(funnel.would_insert_observation).toBe(3);
    expect(funnel.offers_sent_to_moderation).toBe(0);
    expect(funnel.write_attempts).toBe(0);
    expect(funnel.dry_run).toBe(true);
  });
});

describe('post-recon — Offer Standard complements DQE (does not replace)', () => {
  function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
    return {
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-9999999999-x',
      title: 'Audífonos Bluetooth Noise Cancelling Premium MX Test',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_x.jpg',
      discountPrice: 700,
      originalPrice: 1400,
      discountPercent: 50,
      signals: {
        soldQuantity: 200,
        ratingAverage: 4.6,
        ratingCount: 80,
        historyReady: true,
        samples90d: 5,
        habitual30d: 1400,
        savingsVsHabitualPct: 50,
        effectiveDiscountPercent: 50,
        suspectedArtificialListPrice: false,
        originalPriceProvenance: 'source_explicit',
      },
      ...over,
    };
  }

  it('DQE still rejects artificial list price even if pool ranked it', () => {
    const good = meta();
    const artificial = meta({
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1111111111-artificial',
      discountPrice: 3300,
      originalPrice: 10000,
      discountPercent: 67,
      signals: {
        ...good.signals,
        suspectedArtificialListPrice: true,
        historyReady: false,
        samples90d: 1,
        effectiveDiscountPercent: 0,
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
      },
    });

    const dqeGood = evaluateDealQualityFromParsedMeta(good, { source: 'ml_worker' });
    const dqeBad = evaluateDealQualityFromParsedMeta(artificial, { source: 'ml_worker' });
    // Artificial weak listing must not pass as VERIFIED — Offer Standard must not override this.
    expect(['REJECT', 'NO_VERIFIED_DEAL', 'POTENTIAL_DEAL'].includes(dqeBad.decision)).toBe(true);
    expect(dqeBad.decision).not.toBe('VERIFIED_DEAL');
    expect(dqeGood.decision).not.toBe('REJECT');

    const items: IngestItem[] = [
      { url: artificial.canonicalUrl, source: 'ml_worker', precomputedMeta: artificial },
      { url: good.canonicalUrl, source: 'ml_worker', precomputedMeta: good },
    ];
    const ranked = prioritizeAcquisitionPool(items);
    expect(ranked.length).toBe(2);
    // Re-assert after pool rank: DQE verdict unchanged by Offer Standard.
    const dqeBadAgain = evaluateDealQualityFromParsedMeta(artificial, { source: 'ml_worker' });
    expect(dqeBadAgain.decision).toBe(dqeBad.decision);
    expect(dqeBadAgain.decision).not.toBe('VERIFIED_DEAL');
  });
});
