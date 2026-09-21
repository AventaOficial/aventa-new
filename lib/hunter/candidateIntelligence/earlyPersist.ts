/**

 * Early shadow observation for Discovery Experiment v2.

 * Writes events + candidate run-state BEFORE discount/topK/diversity.

 * Persists ALL sightings with identity/URL — including unknown/null discount.

 * MUST NOT import insertIngestedOffer or any mint path.

 */



import type { SupabaseClient } from '@supabase/supabase-js';

import {

  HUNTER_DISCOVERY_EXPERIMENT_ID,

  getDiscoveryExperimentVariant,

  isHunterDiscoveryExperimentEnabled,

  type DiscoveryExperimentVariant,

} from './discoveryExperiment';

import { resolveCanonicalDiscount } from '@/lib/bots/ingest/canonicalDiscount';

import { parseDiscoverySourceDetail } from './discoveryScheduler';

import { classifyDiscountEvidence, type DiscountClass } from './discountClass';

import {

  deriveFunnelDecision,

  simulateWithoutDiscountGate,

} from './discountAudit';

import { buildRotationPlan, type AxisBitmap, type RotationPlan } from './discoveryRotation';

import { persistDiscoveryEvents, type DiscoveryEventInput } from './persistDiscoveryEvents';

import { persistHunterCandidates } from './persist';

import {

  buildHunterCandidateRecord,

  candidateKeyForUrl,

  inferRetailer,

} from './buildCandidateRecord';

import { priceBandForSale } from './priceBand';

import type { HunterCandidateRecord } from './types';



export type EarlySighting = {

  canonicalUrl: string;

  source: string;

  title?: string | null;

  salePrice?: number | null;

  originalPrice?: number | null;

  discountPct?: number | null;

  productFingerprint?: string | null;

  productIdentifier?: string | null;

  imageUrl?: string | null;

  brand?: string | null;

  category?: string | null;

  originalPriceProvenance?: string | null;

  cardDiscountSource?: string | null;

  historicalPrice?: number | null;

  historicalPriceConfidence?: 'high' | 'medium' | 'low' | 'none' | null;

  rotPage?: number | null;

  rotSeedId?: string | null;

  rotCategoryId?: string | null;

  rotQuery?: string | null;

  rotBrand?: string | null;

  rawMetadata?: Record<string, unknown>;

};



export type EarlyObserveResult = {

  enabled: boolean;

  variant: DiscoveryExperimentVariant;

  rotation: RotationPlan;

  eventsWritten: number;

  candidatesWritten: number;

  error?: string;

};



/**

 * Persist every sighting as event + upsert DISCOVERED run-state.

 * Safe no-op when flag OFF. Never drops for discount_percentage 0/null.

 */

export async function earlyPersistDiscoverySightings(input: {

  supabase: SupabaseClient | null | undefined;

  runId: string;

  sightings: EarlySighting[];

  minDiscountPercent: number;

  rotation?: RotationPlan;

  allowInTests?: boolean;

}): Promise<EarlyObserveResult> {

  const enabled =

    isHunterDiscoveryExperimentEnabled() || Boolean(input.allowInTests);

  const variant = getDiscoveryExperimentVariant();

  const rotation =

    input.rotation ?? buildRotationPlan({ variant, nowMs: Date.now() });



  if (!enabled) {

    return {

      enabled: false,

      variant,

      rotation,

      eventsWritten: 0,

      candidatesWritten: 0,

    };

  }



  const now = new Date().toISOString();

  const axisBitmap: AxisBitmap = rotation.axisBitmap;



  const counts = new Map<string, number>();

  const firstSale = new Map<string, number | null>();

  const lastSale = new Map<string, number | null>();



  const events: DiscoveryEventInput[] = [];

  for (const s of input.sightings) {

    const url = s.canonicalUrl?.trim();

if (!url) continue;

const detailRaw =
      typeof s.rawMetadata?.sourceDetail === 'string' ? s.rawMetadata.sourceDetail : null;
const parsedDetail = parseDiscoverySourceDetail(detailRaw);
const rotQuery = s.rotQuery ?? parsedDetail.rotQuery;
const rotSeedId = s.rotSeedId ?? parsedDetail.rotSeedId;
const rotCategoryId = s.rotCategoryId ?? parsedDetail.rotCategoryId;
const rotPage =
      s.rotPage ?? parsedDetail.page ?? (axisBitmap.page ? rotation.pages[0] ?? null : null);

const key = candidateKeyForUrl(url);

    counts.set(key, (counts.get(key) ?? 0) + 1);

    const sale = s.salePrice ?? null;

    if (!firstSale.has(key)) firstSale.set(key, sale);

    lastSale.set(key, sale);



    const classified = classifyDiscountEvidence({

      salePrice: s.salePrice,

      originalPrice: s.originalPrice,

      discountPct: s.discountPct,

      minDiscountPercent: input.minDiscountPercent,

      originalPriceProvenance: s.originalPriceProvenance,

      cardDiscountSource: s.cardDiscountSource,

      historicalPrice: s.historicalPrice,

      historicalPriceConfidence: s.historicalPriceConfidence,

    });

    const discountClass: DiscountClass = classified.discountClass;



    events.push({

      runId: input.runId,

      experimentVariant: variant,

      observedAt: now,

      source: s.source,

      retailer: inferRetailer(url, s.source),

      canonicalUrl: url,

      candidateKey: key,

      productFingerprint: s.productFingerprint ?? null,

      productIdentifier: s.productIdentifier ?? null,

      title: s.title ?? null,

      salePrice: s.salePrice ?? null,

      originalPrice: s.originalPrice ?? null,

      discountPct: s.discountPct ?? null,

      discountClass,

      discountClassV1: classified.discountClassV1,

      discountConfidence: classified.discountConfidence,

      discountSource: classified.discountSource,

      historicalPriceConfidence: classified.historicalPriceConfidence,

      priceEvidence: classified.priceEvidence,

      rotPage,

      rotSeedId,

      rotCategoryId,

      rotQuery,

      rotBrand: s.rotBrand ?? s.brand ?? null,

      rotPriceBand: priceBandForSale(s.salePrice),

      axisBitmap,

      rawMetadata: {

        ...s.rawMetadata,

        brand: s.brand ?? null,

        category: s.category ?? null,

        imageUrl: s.imageUrl ?? null,

      },

    });

  }



  const ev = await persistDiscoveryEvents(input.supabase, events, {

    allowInTests: input.allowInTests,

    force: Boolean(input.allowInTests),

  });



  const byKey = new Map<string, EarlySighting>();

  for (const s of input.sightings) {

    const url = s.canonicalUrl?.trim();

    if (!url) continue;

    byKey.set(candidateKeyForUrl(url), s);

  }



  const records: HunterCandidateRecord[] = [...byKey.entries()].map(([key, s]) => {

    const url = s.canonicalUrl.trim();

    const detailRaw2 =
      typeof s.rawMetadata?.sourceDetail === 'string' ? s.rawMetadata.sourceDetail : null;
    const parsedDetail2 = parseDiscoverySourceDetail(detailRaw2);
    const rotQuery = s.rotQuery ?? parsedDetail2.rotQuery;
    const rotSeedId = s.rotSeedId ?? parsedDetail2.rotSeedId;
    const rotCategoryId = s.rotCategoryId ?? parsedDetail2.rotCategoryId;
    const rotPage = s.rotPage ?? parsedDetail2.page ?? null;

    const classified = classifyDiscountEvidence({

      salePrice: s.salePrice,

      originalPrice: s.originalPrice,

      discountPct: s.discountPct,

      minDiscountPercent: input.minDiscountPercent,

      originalPriceProvenance: s.originalPriceProvenance,

      cardDiscountSource: s.cardDiscountSource,

      historicalPrice: s.historicalPrice,

      historicalPriceConfidence: s.historicalPriceConfidence,

    });

    const first = firstSale.get(key) ?? null;

    const last = lastSale.get(key) ?? null;



    // Simulate productive discount-gate reason for what-if (observation only)

    let simulatedReason: string | null = null;

    if (s.salePrice == null || s.salePrice <= 0) {

      simulatedReason = 'sin precio actual parseable';

    } else if (s.originalPrice == null || s.originalPrice <= (s.salePrice ?? 0)) {

      simulatedReason = 'sin precio original verificable';

    } else {

      const truth = resolveCanonicalDiscount({

        salePrice: s.salePrice,

        originalPrice: s.originalPrice,

        suppliedDiscountPercentage: s.discountPct,

      });

      const pct = truth.discountPercentage;

      if (pct == null) {

        simulatedReason = 'descuento desconocido (sin evidencia calculable)';

      } else if (pct < input.minDiscountPercent) {

        simulatedReason = `descuento ${Math.round(pct)}% < mínimo ${input.minDiscountPercent}%`;

      }

    }



    const hypo = simulateWithoutDiscountGate({

      discountClass: classified.discountClass,

      currentDecision: simulatedReason ? 'REJECTED_DISCOUNT' : 'DISCOVERED',

      reason: simulatedReason,

      hasTitle: Boolean(s.title?.trim()),

      hasUrl: true,

    });



    const funnel = deriveFunnelDecision({

      decision: 'DISCOVERED',

      reasonCode: 'experiment_early_persist',

      discountClass: classified.discountClass,

    });



    const rec = buildHunterCandidateRecord({

      runId: input.runId,

      url,

      source: s.source,

      status: 'resolved',

      reason: 'experiment_early_persist',

      dispositionOverride: {

        decision: 'DISCOVERED',

        reasonCode: 'experiment_early_persist',

        reasonDetail: 'persisted_before_gates',

        stage: 'discovery',

      },

      evidence: {

        experiment: true,

        experimentId: HUNTER_DISCOVERY_EXPERIMENT_ID,

        persistedPreGate: true,

        priceEvidence: classified.priceEvidence,

        discountClassV1: classified.discountClassV1,

        hypothetical: hypo,

      },

      meta: {

        title: s.title ?? undefined,

        discountPrice: s.salePrice ?? undefined,

        originalPrice: s.originalPrice ?? undefined,

        discountPercent: s.discountPct ?? undefined,

        imageUrl: s.imageUrl ?? undefined,

        canonicalUrl: url,

      } as never,

    });



    return {

      ...rec,

      candidateKey: key,

      discoveredAt: now,

      experimentId: HUNTER_DISCOVERY_EXPERIMENT_ID,

      experimentVariant: variant,

      discountClass: classified.discountClass,

      discountClassV1: classified.discountClassV1,

      discountConfidence: classified.discountConfidence,

      discountSource: classified.discountSource,

      historicalPriceConfidence: classified.historicalPriceConfidence,

      priceEvidence: classified.priceEvidence as unknown as Record<string, unknown>,

      currentDecision: hypo.currentDecision,

      hypotheticalDecision: hypo.hypotheticalDecision,

      funnelStage: funnel.stage,

      funnelReason: funnel.reason,

      wouldTopkCut: false,

      wouldDiversityCut: false,

      persistedPreGate: true,

      discoveryCountInRun: counts.get(key) ?? 1,

      firstPriceSale: first,

      lastPriceSale: last,

      priceChangeInRun: first != null && last != null ? last - first : null,

      rotPage,

      rotSeedId,

      rotCategoryId,

      rotQuery,

      rotBrand: s.rotBrand ?? s.brand ?? null,

      rotPriceBand: priceBandForSale(s.salePrice),

      axisBitmap,

      brand: s.brand ?? rec.brand,

      category: s.category ?? rec.category,

      salePrice: s.salePrice ?? rec.salePrice,

      originalPrice: s.originalPrice ?? rec.originalPrice,

      discountPercentage:

        s.discountPct != null

          ? Math.round(s.discountPct)

          : classified.priceEvidence.computedPct != null

            ? Math.round(classified.priceEvidence.computedPct)

            : rec.discountPercentage,

      title: s.title ?? rec.title,

      imageUrl: s.imageUrl ?? rec.imageUrl,

      productFingerprint: s.productFingerprint ?? rec.productFingerprint,

      productIdentifier: s.productIdentifier ?? rec.productIdentifier,

    };

  });



  const wrote = await persistHunterCandidates(input.supabase, records, {

    allowInTests: input.allowInTests,

  });



  return {

    enabled: true,

    variant,

    rotation,

    eventsWritten: ev.written,

    candidatesWritten: wrote.written,

    error: ev.error ?? wrote.error,

  };

}



/** Annotate simulated topK/diversity cuts onto records (does not delete). */

export function applyWouldCutAnnotations(

  records: HunterCandidateRecord[],

  cuts: { topKUrls?: ReadonlySet<string>; diversityUrls?: ReadonlySet<string> },

): HunterCandidateRecord[] {

  const top = cuts.topKUrls ?? new Set<string>();

  const div = cuts.diversityUrls ?? new Set<string>();

  return records.map((r) => {

    const u = r.canonicalUrl.trim().toLowerCase();

    const wouldTopkCut = top.has(u) || top.has(r.canonicalUrl) || r.wouldTopkCut === true;

    const wouldDiversityCut =

      div.has(u) || div.has(r.canonicalUrl) || r.wouldDiversityCut === true;

    const funnel = deriveFunnelDecision({

      decision: r.decision,

      reasonCode: r.reasonCode,

      reasonDetail: r.reasonDetail,

      wouldTopkCut,

      wouldDiversityCut,

      discountClass: r.discountClass as DiscountClass | undefined,

    });

    return {

      ...r,

      wouldTopkCut,

      wouldDiversityCut,

      funnelStage: funnel.stage,

      funnelReason: funnel.reason,

    };

  });

}


