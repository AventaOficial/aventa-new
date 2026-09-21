/**
 * Append-only discovery event persistence — Experiment v2.
 * NEVER called when experiment flag is OFF.
 * NEVER imports insertIngestedOffer / mint paths.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  HUNTER_DISCOVERY_EXPERIMENT_ID,
  isHunterDiscoveryExperimentEnabled,
  type DiscoveryExperimentVariant,
} from './discoveryExperiment';
import type { DiscountClass, DiscountClassV1, DiscountConfidence, DiscountSource } from './discountClass';
import type { AxisBitmap } from './discoveryRotation';
import type { PriceBand } from './priceBand';
import { candidateKeyForUrl, inferRetailer } from './buildCandidateRecord';

export const HUNTER_DISCOVERY_EVENTS_TABLE = 'hunter_discovery_events' as const;

export type DiscoveryEventInput = {
  runId: string;
  experimentVariant: DiscoveryExperimentVariant;
  observedAt?: string;
  source: string;
  retailer?: string | null;
  canonicalUrl: string;
  candidateKey?: string;
  productFingerprint?: string | null;
  productIdentifier?: string | null;
  title?: string | null;
  salePrice?: number | null;
  originalPrice?: number | null;
  discountPct?: number | null;
  discountClass?: DiscountClass | null;
  discountClassV1?: DiscountClassV1 | null;
  discountConfidence?: DiscountConfidence | null;
  discountSource?: DiscountSource | null;
  historicalPriceConfidence?: DiscountConfidence | null;
  priceEvidence?: Record<string, unknown> | null;
  currency?: string;
  rotPage?: number | null;
  rotSeedId?: string | null;
  rotCategoryId?: string | null;
  rotQuery?: string | null;
  rotBrand?: string | null;
  rotPriceBand?: PriceBand;
  /** Rank in search response when known; else null. */
  position?: number | null;
  /** Upstream request/correlation id when known; else null. */
  requestId?: string | null;
  /** Marketplace item id when known; else null (never invent). */
  sourceItemId?: string | null;
  axisBitmap: AxisBitmap;
  rawMetadata?: Record<string, unknown>;
};

function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = k.toLowerCase();
    if (
      key.includes('token') ||
      key.includes('secret') ||
      key.includes('password') ||
      key.includes('authorization') ||
      key.includes('api_key') ||
      key.includes('apikey')
    ) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function toDiscoveryEventRow(ev: DiscoveryEventInput): Record<string, unknown> {
  const url = ev.canonicalUrl.trim();
  return {
    run_id: ev.runId,
    experiment_id: HUNTER_DISCOVERY_EXPERIMENT_ID,
    experiment_variant: ev.experimentVariant,
    observed_at: ev.observedAt ?? new Date().toISOString(),
    source: ev.source,
    retailer: ev.retailer ?? inferRetailer(url, ev.source),
    candidate_key: ev.candidateKey ?? candidateKeyForUrl(url),
    canonical_url: url,
    product_fingerprint: ev.productFingerprint ?? null,
    product_identifier: ev.productIdentifier ?? null,
    title: ev.title ?? null,
    sale_price: ev.salePrice ?? null,
    original_price: ev.originalPrice ?? null,
    discount_pct: ev.discountPct ?? null,
    discount_class: ev.discountClass ?? null,
    discount_class_v1: ev.discountClassV1 ?? null,
    discount_confidence: ev.discountConfidence ?? null,
    discount_source: ev.discountSource ?? null,
    historical_price_confidence: ev.historicalPriceConfidence ?? null,
    price_evidence: ev.priceEvidence ?? null,
    currency: ev.currency ?? 'MXN',
    rot_page: ev.rotPage ?? null,
    rot_seed_id: ev.rotSeedId ?? null,
    rot_category_id: ev.rotCategoryId ?? null,
    rot_query: ev.rotQuery ?? null,
    rot_brand: ev.rotBrand ?? null,
    rot_price_band: ev.rotPriceBand ?? null,
    axis_bitmap: ev.axisBitmap,
    raw_metadata: sanitizeMeta({
      ...ev.rawMetadata,
      position: ev.position ?? null,
      request_id: ev.requestId ?? null,
      source_item_id: ev.sourceItemId ?? null,
    }),
  };
}

/**
 * Append discovery events. Fail-soft. No-op when experiment flag OFF.
 */
export async function persistDiscoveryEvents(
  supabase: SupabaseClient | null | undefined,
  events: DiscoveryEventInput[],
  opts?: { allowInTests?: boolean; force?: boolean },
): Promise<{ ok: boolean; written: number; error?: string }> {
  if (!opts?.force && !isHunterDiscoveryExperimentEnabled() && !opts?.allowInTests) {
    return { ok: true, written: 0 };
  }
  if (!supabase || events.length === 0) return { ok: true, written: 0 };
  if (process.env.NODE_ENV === 'test' && !opts?.allowInTests) {
    return { ok: true, written: 0 };
  }

  const rows = events.map(toDiscoveryEventRow);
  const { error } = await supabase.from(HUNTER_DISCOVERY_EVENTS_TABLE).insert(rows);
  if (error) return { ok: false, written: 0, error: error.message };
  return { ok: true, written: rows.length };
}
