/**
 * CEO Deal Intelligence truth — read-path connection ≠ persistence ≠ $0.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ML_PRICE_MARKETPLACE } from '@/lib/bots/ingest/mlPriceEngine';
import {
  DEAL_INTELLIGENCE_ECONOMY_BOUNDARY,
  DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY,
  isDealIntelligencePersistenceEnabled,
} from './constants';
import {
  DI_READ_DEFAULT_LIMIT,
  DI_STALE_AFTER_SECONDS,
  readOfferPriceObservations,
  readPriceMemoryObservations,
} from './readers/canonicalRead';
import { isObservationStale } from './priceObservation';
import {
  getDealIntelligenceTelemetry,
  medianLatencyMsFromTelemetry,
  resetDealIntelligenceTelemetry,
} from './telemetry';
import type { DealIntelligenceConnectionState } from './types';

export type DealIntelligenceTruthSnapshot = {
  generatedAt: string;
  /** Read-path connection over existing SoT (P0.2). */
  connection: DealIntelligenceConnectionState;
  persistenceEnabled: boolean;
  economicDataAvailable: false;
  economicDataAttributable: false;
  economicDataSettleable: false;
  autoPublish: false;
  observations: {
    totalSampled: number;
    offerSnapshotsTotal: number | null;
    offerSnapshots24h: number | null;
    offerSnapshots7d: number | null;
    priceMemoryTotal: number | null;
    priceMemory24h: number | null;
    priceMemory7d: number | null;
  };
  identity: {
    exact: number;
    probable: number;
    unknown: number;
    exactPct: number | null;
    probablePct: number | null;
    unknownPct: number | null;
  };
  freshness: {
    fresh: number;
    stale: number;
  };
  sources: {
    distribution: Record<string, number>;
    errors: number;
    latencyMs: number | null;
  };
  metrics: {
    priceObservationsHour: number | null;
    dealsDetectedHour: number | null;
    duplicateRate: number | null;
    dqeRejectionRate: number | null;
    promotionDetectionRate: number | null;
    couponDetectionRate: number | null;
    identityExactRate: number | null;
    identityProbableRate: number | null;
    identityUnknownRate: number | null;
    sourceErrorRate: number | null;
    sourceLatencyMs: number | null;
  };
  note: string;
  error: string | null;
  economyBoundary: typeof DEAL_INTELLIGENCE_ECONOMY_BOUNDARY;
  publicationBoundary: typeof DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY;
};

function pct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Pure builder from already-fetched counters (tests / offline).
 * Read-path: CONNECTED_* when readers succeeded; NOT_CONNECTED on error/unavailable.
 */
export function buildDealIntelligenceTruth(input?: {
  now?: Date;
  readOk?: boolean | null;
  readError?: string | null;
  offerSnapshotsTotal?: number | null;
  offerSnapshots24h?: number | null;
  offerSnapshots7d?: number | null;
  priceMemoryTotal?: number | null;
  priceMemory24h?: number | null;
  priceMemory7d?: number | null;
  identityExact?: number;
  identityProbable?: number;
  identityUnknown?: number;
  fresh?: number;
  stale?: number;
  sourceDistribution?: Record<string, number>;
  readerErrors?: number;
  latencyMs?: number | null;
  /** @deprecated P0.1 persistence counters — ignored for read connection */
  persistedObservationCount?: number | null;
  persistedDealEventCount?: number | null;
}): DealIntelligenceTruthSnapshot {
  const persistenceEnabled = isDealIntelligencePersistenceEnabled();
  const now = input?.now ?? new Date();

  const offerTotal = input?.offerSnapshotsTotal ?? null;
  const pmTotal = input?.priceMemoryTotal ?? null;
  const exact = input?.identityExact ?? 0;
  const probable = input?.identityProbable ?? 0;
  const unknown = input?.identityUnknown ?? 0;
  const idTotal = exact + probable + unknown;
  const fresh = input?.fresh ?? 0;
  const stale = input?.stale ?? 0;

  let connection: DealIntelligenceConnectionState = 'NOT_CONNECTED';
  let note =
    'Deal Intelligence read bridge not evaluated (no SoT read). Persistence remains OFF.';
  const error: string | null = input?.readError ?? null;

  if (input?.readOk === false) {
    connection = 'NOT_CONNECTED';
    note = `Read path failed: ${error ?? 'unknown'}. Persistence OFF.`;
  } else if (input?.readOk === true) {
    const sotTotal = (offerTotal ?? 0) + (pmTotal ?? 0);
    if (sotTotal === 0) {
      connection = 'CONNECTED_ZERO';
      note =
        'Read adapters OK; zero rows in offer_price_snapshots + Price Memory windows. Persistence OFF.';
    } else {
      connection = 'CONNECTED_WITH_DATA';
      note = `Read adapters OK; offer_snaps=${offerTotal ?? 0} price_memory=${pmTotal ?? 0}. Persistence OFF. No publish.`;
    }
  }

  const sampled = idTotal;
  return {
    generatedAt: now.toISOString(),
    connection,
    persistenceEnabled,
    economicDataAvailable: false,
    economicDataAttributable: false,
    economicDataSettleable: false,
    autoPublish: false,
    observations: {
      totalSampled: sampled,
      offerSnapshotsTotal: offerTotal,
      offerSnapshots24h: input?.offerSnapshots24h ?? null,
      offerSnapshots7d: input?.offerSnapshots7d ?? null,
      priceMemoryTotal: pmTotal,
      priceMemory24h: input?.priceMemory24h ?? null,
      priceMemory7d: input?.priceMemory7d ?? null,
    },
    identity: {
      exact,
      probable,
      unknown,
      exactPct: pct(exact, idTotal),
      probablePct: pct(probable, idTotal),
      unknownPct: pct(unknown, idTotal),
    },
    freshness: { fresh, stale },
    sources: {
      distribution: { ...(input?.sourceDistribution ?? {}) },
      errors: input?.readerErrors ?? 0,
      latencyMs: input?.latencyMs ?? null,
    },
    metrics: {
      priceObservationsHour: input?.offerSnapshots24h != null || input?.priceMemory24h != null
        ? Math.round(((input?.offerSnapshots24h ?? 0) + (input?.priceMemory24h ?? 0)) / 24)
        : null,
      dealsDetectedHour: null,
      duplicateRate: null,
      dqeRejectionRate: null,
      promotionDetectionRate: null,
      couponDetectionRate: null,
      identityExactRate: pct(exact, idTotal),
      identityProbableRate: pct(probable, idTotal),
      identityUnknownRate: pct(unknown, idTotal),
      sourceErrorRate: null,
      sourceLatencyMs: input?.latencyMs ?? null,
    },
    note,
    error,
    economyBoundary: DEAL_INTELLIGENCE_ECONOMY_BOUNDARY,
    publicationBoundary: DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY,
  };
}

/**
 * Live read of existing SoT → CEO truth. Bounded counts + sample map.
 */
export async function buildDealIntelligenceReadTruth(
  supabase: SupabaseClient,
  opts?: { now?: Date; sampleLimit?: number },
): Promise<DealIntelligenceTruthSnapshot> {
  const now = opts?.now ?? new Date();
  const sampleLimit = opts?.sampleLimit ?? DI_READ_DEFAULT_LIMIT;
  resetDealIntelligenceTelemetry();

  const since24 = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const since7 = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
  const since7Ymd = since7.slice(0, 10);
  const since24Ymd = since24.slice(0, 10);

  try {
    const [
      offerTotal,
      offer24,
      offer7,
      pmTotal,
      pm24,
      pm7,
      offerSample,
      pmSample,
    ] = await Promise.all([
      supabase
        .from('offer_price_snapshots')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('offer_price_snapshots')
        .select('*', { count: 'exact', head: true })
        .gte('recorded_at', since24),
      supabase
        .from('offer_price_snapshots')
        .select('*', { count: 'exact', head: true })
        .gte('recorded_at', since7),
      supabase
        .from('product_price_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('marketplace', ML_PRICE_MARKETPLACE),
      supabase
        .from('product_price_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('marketplace', ML_PRICE_MARKETPLACE)
        .gte('recorded_on', since24Ymd),
      supabase
        .from('product_price_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('marketplace', ML_PRICE_MARKETPLACE)
        .gte('recorded_on', since7Ymd),
      readOfferPriceObservations(supabase, {
        sinceIso: since7,
        limit: sampleLimit,
        currencyHint: 'MXN',
        now,
      }),
      readPriceMemoryObservations(supabase, {
        sinceYmd: since7Ymd,
        limit: sampleLimit,
        now,
      }),
    ]);

    const countErrors = [
      offerTotal.error,
      offer24.error,
      offer7.error,
      pmTotal.error,
      pm24.error,
      pm7.error,
    ].filter(Boolean);

    if (countErrors.length > 0 || !offerSample.ok || !pmSample.ok) {
      return buildDealIntelligenceTruth({
        now,
        readOk: false,
        readError:
          countErrors[0]?.message ??
          offerSample.error ??
          pmSample.error ??
          'read_failed',
        readerErrors: getDealIntelligenceTelemetry().reader_errors,
        latencyMs: medianLatencyMsFromTelemetry(),
      });
    }

    const observations = [...offerSample.observations, ...pmSample.observations];
    let exact = 0;
    let probable = 0;
    let unknown = 0;
    let fresh = 0;
    let stale = 0;
    const distribution: Record<string, number> = {};

    for (const o of observations) {
      if (o.identity.identityStatus === 'exact') exact += 1;
      else if (o.identity.identityStatus === 'probable') probable += 1;
      else unknown += 1;
      const isStale = isObservationStale({
        observedAt: o.observedAt,
        now,
        maxAgeSeconds: DI_STALE_AFTER_SECONDS,
      });
      if (isStale) stale += 1;
      else fresh += 1;
      distribution[o.sourceId] = (distribution[o.sourceId] ?? 0) + 1;
    }

    const tel = getDealIntelligenceTelemetry();

    return buildDealIntelligenceTruth({
      now,
      readOk: true,
      offerSnapshotsTotal: offerTotal.count ?? 0,
      offerSnapshots24h: offer24.count ?? 0,
      offerSnapshots7d: offer7.count ?? 0,
      priceMemoryTotal: pmTotal.count ?? 0,
      priceMemory24h: pm24.count ?? 0,
      priceMemory7d: pm7.count ?? 0,
      identityExact: exact,
      identityProbable: probable,
      identityUnknown: unknown,
      fresh,
      stale,
      sourceDistribution: distribution,
      readerErrors: tel.reader_errors,
      latencyMs: medianLatencyMsFromTelemetry(tel),
    });
  } catch (e) {
    return buildDealIntelligenceTruth({
      now,
      readOk: false,
      readError: e instanceof Error ? e.message : 'read_exception',
    });
  }
}
