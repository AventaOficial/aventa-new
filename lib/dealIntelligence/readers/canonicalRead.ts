/**
 * Canonical read facade — existing SoT → PriceObservation.
 * Bounded queries only. No writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ML_PRICE_MARKETPLACE } from '@/lib/bots/ingest/mlPriceEngine';
import { isObservationStale } from '../priceObservation';
import { mapOfferPriceSnapshotToObservation } from '../mappers/offerPriceSnapshot';
import { mapPriceMemorySnapshotToObservation } from '../mappers/priceMemorySnapshot';
import type { OfferPriceSnapshotRow, OfferSnapshotIdentityHint, ProductPriceSnapshotRow } from '../mappers/rawRows';
import type { PriceObservation } from '../types';
import {
  recordMappedObservation,
  recordReadLatency,
  recordReaderError,
} from '../telemetry';

export const DI_READ_DEFAULT_LIMIT = 100;
export const DI_READ_MAX_LIMIT = 200;
export const DI_STALE_AFTER_SECONDS = 7 * 24 * 3600;

export type PriceObservationReadResult = {
  ok: boolean;
  observations: PriceObservation[];
  invalid: number;
  error: string | null;
  latencyMs: number;
};

function clampLimit(n: number | undefined): number {
  const v = n ?? DI_READ_DEFAULT_LIMIT;
  if (!Number.isFinite(v) || v < 1) return DI_READ_DEFAULT_LIMIT;
  return Math.min(DI_READ_MAX_LIMIT, Math.floor(v));
}

function trackObs(
  mapped: ReturnType<typeof mapOfferPriceSnapshotToObservation>,
  now: Date,
): PriceObservation | null {
  if (!mapped.ok) {
    recordMappedObservation({ ok: false, reason: mapped.reason });
    return null;
  }
  const stale = isObservationStale({
    observedAt: mapped.observation.observedAt,
    now,
    maxAgeSeconds: DI_STALE_AFTER_SECONDS,
  });
  recordMappedObservation({
    ok: true,
    sourceId: mapped.observation.sourceId,
    identityStatus: mapped.observation.identity.identityStatus,
    stale,
    variantUnknown: mapped.observation.variantKey == null,
  });
  return mapped.observation;
}

function trackPm(
  mapped: ReturnType<typeof mapPriceMemorySnapshotToObservation>,
  now: Date,
): PriceObservation | null {
  if (!mapped.ok) {
    recordMappedObservation({ ok: false, reason: mapped.reason });
    return null;
  }
  const stale = isObservationStale({
    observedAt: mapped.observation.observedAt,
    now,
    maxAgeSeconds: DI_STALE_AFTER_SECONDS,
  });
  recordMappedObservation({
    ok: true,
    sourceId: mapped.observation.sourceId,
    identityStatus: mapped.observation.identity.identityStatus,
    stale,
    variantUnknown: true,
  });
  return mapped.observation;
}

/** Recent offer_price_snapshots → observations (currencyHint required for valid map). */
export async function readOfferPriceObservations(
  supabase: SupabaseClient,
  opts?: {
    offerId?: string;
    sinceIso?: string;
    limit?: number;
    currencyHint?: string;
    identityByOfferId?: Record<string, OfferSnapshotIdentityHint>;
    now?: Date;
  },
): Promise<PriceObservationReadResult> {
  const started = Date.now();
  const now = opts?.now ?? new Date();
  const limit = clampLimit(opts?.limit);
  try {
    let q = supabase
      .from('offer_price_snapshots')
      .select('id, offer_id, price, original_price, source, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (opts?.offerId) q = q.eq('offer_id', opts.offerId);
    if (opts?.sinceIso) q = q.gte('recorded_at', opts.sinceIso);

    const { data, error } = await q;
    const latencyMs = Date.now() - started;
    recordReadLatency(latencyMs);
    if (error) {
      recordReaderError();
      return { ok: false, observations: [], invalid: 0, error: error.message, latencyMs };
    }

    const rows = (data ?? []) as OfferPriceSnapshotRow[];
    const observations: PriceObservation[] = [];
    let invalid = 0;
    for (const row of rows) {
      const hint: OfferSnapshotIdentityHint = {
        ...(opts?.identityByOfferId?.[row.offer_id] ?? {}),
        currencyHint:
          opts?.identityByOfferId?.[row.offer_id]?.currencyHint ?? opts?.currencyHint ?? null,
      };
      const obs = trackObs(mapOfferPriceSnapshotToObservation(row, hint, { now }), now);
      if (obs) observations.push(obs);
      else invalid += 1;
    }
    return { ok: true, observations, invalid, error: null, latencyMs };
  } catch (e) {
    recordReaderError();
    const latencyMs = Date.now() - started;
    recordReadLatency(latencyMs);
    return {
      ok: false,
      observations: [],
      invalid: 0,
      error: e instanceof Error ? e.message : 'reader_error',
      latencyMs,
    };
  }
}

/** Recent Price Memory rows → observations. */
export async function readPriceMemoryObservations(
  supabase: SupabaseClient,
  opts?: {
    productId?: string;
    sinceYmd?: string;
    limit?: number;
    now?: Date;
  },
): Promise<PriceObservationReadResult> {
  const started = Date.now();
  const now = opts?.now ?? new Date();
  const limit = clampLimit(opts?.limit);
  try {
    let q = supabase
      .from('product_price_snapshots')
      .select(
        'id, marketplace, product_id, last_price, min_price, list_price, regular_price, currency, recorded_on, recorded_at',
      )
      .eq('marketplace', ML_PRICE_MARKETPLACE)
      .order('recorded_on', { ascending: false })
      .limit(limit);
    if (opts?.productId) q = q.eq('product_id', opts.productId);
    if (opts?.sinceYmd) q = q.gte('recorded_on', opts.sinceYmd);

    const { data, error } = await q;
    const latencyMs = Date.now() - started;
    recordReadLatency(latencyMs);
    if (error) {
      recordReaderError();
      return { ok: false, observations: [], invalid: 0, error: error.message, latencyMs };
    }

    const rows = (data ?? []) as ProductPriceSnapshotRow[];
    const observations: PriceObservation[] = [];
    let invalid = 0;
    for (const row of rows) {
      const obs = trackPm(mapPriceMemorySnapshotToObservation(row, { now }), now);
      if (obs) observations.push(obs);
      else invalid += 1;
    }
    return { ok: true, observations, invalid, error: null, latencyMs };
  } catch (e) {
    recordReaderError();
    const latencyMs = Date.now() - started;
    recordReadLatency(latencyMs);
    return {
      ok: false,
      observations: [],
      invalid: 0,
      error: e instanceof Error ? e.message : 'reader_error',
      latencyMs,
    };
  }
}

/**
 * Candidate for DealDetectedEvent from a valid observation — does not emit/publish.
 */
export function observationToDealDetectedCandidate(observation: PriceObservation): {
  productIdentity: PriceObservation['identity'];
  sourceId: string;
  observedAt: string;
  priceObservation: PriceObservation;
  publicationAllowed: false;
} {
  return {
    productIdentity: observation.identity,
    sourceId: observation.sourceId,
    observedAt: observation.observedAt,
    priceObservation: observation,
    publicationAllowed: false,
  };
}
