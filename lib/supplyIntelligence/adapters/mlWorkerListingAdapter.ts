/**
 * Mercado Libre Worker listing adapter — S4.
 *
 * Why this source:
 * - Already registered as SupplySource `ml_worker`
 * - Stable payload shape: ExternalWorkerCandidate (Playwright worker POSTs it)
 * - No Playwright rewrite; adapter consumes discovered listings
 * - Lowest new surface to prove SOURCE → RawObservation → gate → WOULD_INSERT
 *
 * Source event identity (deterministic, never random UUID alone):
 *   ml_worker:ml:{ITEM_ID}
 *   or ml_worker:url:{sha256(canonicalUrl)[0:24]} when item id missing
 */

import { createHash } from 'node:crypto';
import type { ExternalWorkerCandidate } from '@/lib/bots/ingest/externalWorker';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  buildRawObservation,
  RAW_NORMALIZATION_VERSION,
  RAW_PARSER_VERSION,
  type RawObservation,
} from '@/lib/dealIntelligence/rawObservation';
import { resolveIdentityFromUrl } from '@/lib/dealIntelligence/identity';
import { isOfferMercadoLibreHost } from '@/lib/offers/commerceHostAllowlist';
import {
  resolveMercadoLibreListingExternalId,
} from '@/lib/offers/resolveMercadoLibreItem';
import { normalizeOfferImageUrl } from '@/lib/offerPath';
import { preserveMachinePriceProvenance } from '@/lib/bots/ingest/machinePriceProvenance';
import type {
  SourceAdapter,
  SourceDiscoverContext,
  SourceDiscoverItemOutcome,
  SourceDiscoverResult,
} from '../sourceAdapter';
import { SOURCE_ADAPTER_SCHEMA_VERSION } from '../sourceAdapter';

export const ML_WORKER_ADAPTER_SOURCE_ID = 'ml_worker' as const;
export const ML_WORKER_ADAPTER_PARSER_VERSION = 'ml_worker_listing_adapter.v1' as const;

const MAX_SAMPLE = 50;
const DEFAULT_SAMPLE = 20;

export type MlWorkerListingDiscoverInput = {
  /** Pre-discovered listings (fixtures or worker payload). No live scrape here. */
  candidates: readonly ExternalWorkerCandidate[];
};

function sha24(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function isBlockedWorkerPath(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.toLowerCase();
    return (
      /\/gz\//i.test(path) ||
      /account-verification/i.test(path) ||
      /\/login/i.test(path) ||
      /\/registration/i.test(path)
    );
  } catch {
    return true;
  }
}

function assertSafeMlUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'malformed_url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'invalid_protocol' };
  }
  if (!isOfferMercadoLibreHost(url.hostname)) {
    return { ok: false, reason: 'host_not_allowlisted' };
  }
  if (isBlockedWorkerPath(url.href)) {
    return { ok: false, reason: 'blocked_worker_path' };
  }
  return { ok: true, url };
}

/**
 * Deterministic source-event id for a listing discovery.
 * Prefer ML item id; fall back to URL hash — never Math.random / uuid alone.
 * Identity authority: resolveMercadoLibreListingExternalId (shared with live).
 */
export function buildMlWorkerSourceEventId(input: {
  url: string;
  canonicalUrl?: string | null;
}): string {
  const canonical = (input.canonicalUrl ?? input.url).trim();
  const externalId = resolveMercadoLibreListingExternalId(input.url, input.canonicalUrl);
  if (externalId) return `ml_worker:ml:${externalId}`;
  return `ml_worker:url:${sha24(canonical.toLowerCase())}`;
}

export type NormalizedMlListing = {
  meta: ParsedOfferMetadata;
  sourceEventId: string;
  externalListingId: string | null;
};

/**
 * RAW discovery row → normalized listing metadata (no DB, no offer insert).
 */
export function normalizeMlWorkerListing(
  candidate: ExternalWorkerCandidate,
):
  | { ok: true; value: NormalizedMlListing }
  | { ok: false; reason: string; inputSummary: Record<string, unknown> } {
  const urlRaw = candidate.url?.trim() ?? '';
  const title = candidate.title?.trim() ?? '';
  const canonicalRaw = (candidate.canonicalUrl?.trim() || urlRaw).trim();
  const summary = {
    url: urlRaw.slice(0, 120),
    title: title.slice(0, 80),
    discountPrice: candidate.discountPrice,
  };

  if (!urlRaw) return { ok: false, reason: 'missing_url', inputSummary: summary };
  if (!title) return { ok: false, reason: 'missing_title', inputSummary: summary };

  const urlCheck = assertSafeMlUrl(urlRaw);
  if (!urlCheck.ok) return { ok: false, reason: urlCheck.reason, inputSummary: summary };
  const canonCheck = assertSafeMlUrl(canonicalRaw);
  if (!canonCheck.ok) return { ok: false, reason: `canonical_${canonCheck.reason}`, inputSummary: summary };

  const discountPrice = Number(candidate.discountPrice);
  if (!Number.isFinite(discountPrice) || discountPrice <= 0) {
    return { ok: false, reason: 'malformed_price', inputSummary: summary };
  }

  const originalPrice =
    candidate.originalPrice != null && Number.isFinite(Number(candidate.originalPrice))
      ? Number(candidate.originalPrice)
      : null;

  const itemId = resolveMercadoLibreListingExternalId(urlRaw, canonicalRaw);
  if (!itemId) {
    return { ok: false, reason: 'missing_external_id', inputSummary: summary };
  }

  const computedDiscount =
    originalPrice != null && originalPrice > discountPrice
      ? Math.round((1 - discountPrice / originalPrice) * 100)
      : 0;
  const rawPercent =
    candidate.discountPercent != null && Number.isFinite(Number(candidate.discountPercent))
      ? Math.round(Number(candidate.discountPercent))
      : computedDiscount;
  const discountPercent = Math.max(0, Math.min(95, rawPercent));

  const imageUrl = normalizeOfferImageUrl(candidate.imageUrl) ?? '';
  const store = candidate.store?.trim() || 'Mercado Libre';
  const sourceEventId = buildMlWorkerSourceEventId({
    url: urlRaw,
    canonicalUrl: canonicalRaw,
  });

  // Preserve machine provenance — never invent from discountPercent alone.
  const preserved = preserveMachinePriceProvenance({
    salePrice: discountPrice,
    originalPrice,
    signals: {
      listingTypeId: 'worker_card',
      ...(candidate.signals ?? {}),
    },
    cardDiscountSource: candidate.cardDiscountSource ?? null,
    cardBadgePercent: candidate.cardBadgePercent ?? null,
  });

  // Image provenance is independent of price provenance.
  const signalsWithImage = {
    ...preserved.signals,
    ...(imageUrl
      ? {
          imageProvenance:
            preserved.signals.imageProvenance ??
            candidate.signals?.imageProvenance ??
            'listing_card',
        }
      : {}),
  };

  const meta: ParsedOfferMetadata = {
    canonicalUrl: canonicalRaw,
    title,
    store,
    imageUrl,
    discountPrice,
    originalPrice,
    discountPercent,
    signals: signalsWithImage,
  };

  return {
    ok: true,
    value: {
      meta,
      sourceEventId,
      externalListingId: itemId.toUpperCase(),
    },
  };
}

export function normalizedListingToRawObservation(
  normalized: NormalizedMlListing,
  opts?: {
    observedAt?: string;
    supplyRunId?: string | null;
    sourceDetail?: string | null;
    pdpBlocked?: boolean | null;
  },
): RawObservation {
  const { meta, sourceEventId } = normalized;
  const identity = resolveIdentityFromUrl({
    url: meta.canonicalUrl,
    merchant: 'mercadolibre',
  });
  const s = meta.signals;
  return buildRawObservation({
    sourceId: ML_WORKER_ADAPTER_SOURCE_ID,
    sourceEventId,
    url: meta.canonicalUrl,
    observedAt: opts?.observedAt,
    merchant: meta.store,
    salePrice: meta.discountPrice,
    listPrice: meta.originalPrice,
    currency: 'MXN',
    title: meta.title,
    identity,
    captureMethod: 'browser_justified',
    sourceDetail: opts?.sourceDetail ?? null,
    supplyRunId: opts?.supplyRunId ?? null,
    parserVersion: ML_WORKER_ADAPTER_PARSER_VERSION,
    normalizationVersion: RAW_NORMALIZATION_VERSION,
    processingStatus: 'normalized',
    // Compact price provenance in existing payload.summary — no new table/column.
    payloadSummaryExtra: {
      originalPriceProvenance: s?.originalPriceProvenance ?? null,
      cardDiscountSource: s?.cardDiscountSource ?? null,
      cardBadgePercent: s?.cardBadgePercent ?? null,
      imagePresent: Boolean(meta.imageUrl?.trim()),
      imageProvenance: s?.imageProvenance ?? null,
    },
    fetchMetadata: {
      httpStatus: 200,
      finalUrl: meta.canonicalUrl,
      redirectHops: null,
      contentType: 'application/json',
      timedOut: false,
      blocked: opts?.pdpBlocked === true,
      errorCode: opts?.pdpBlocked === true ? 'pdp_blocked' : null,
    },
  });
}

export function createMlWorkerListingAdapter(
  input: MlWorkerListingDiscoverInput,
): SourceAdapter {
  return {
    id: ML_WORKER_ADAPTER_SOURCE_ID,
    displayName: 'Mercado Libre Worker Listings',
    schemaVersion: SOURCE_ADAPTER_SCHEMA_VERSION,
    captureMethod: 'browser_justified',
    canInsertOffers: false,
    canPublish: false,
    canModifyRewards: false,
    async discover(ctx: SourceDiscoverContext): Promise<SourceDiscoverResult> {
      const started = Date.now();
      const cap = Math.min(MAX_SAMPLE, Math.max(1, Math.floor(ctx.maxItems || DEFAULT_SAMPLE)));
      const slice = input.candidates.slice(0, cap);
      const items: SourceDiscoverItemOutcome[] = [];

      for (const candidate of slice) {
        try {
          const normalized = normalizeMlWorkerListing(candidate);
          if (!normalized.ok) {
            items.push({
              status: 'rejected',
              reason: normalized.reason,
              inputSummary: normalized.inputSummary,
            });
            continue;
          }
          const observation = normalizedListingToRawObservation(normalized.value, {
            observedAt: (ctx.now ?? new Date()).toISOString(),
            supplyRunId: ctx.runId ?? null,
            sourceDetail: candidate.sourceDetail ?? null,
            pdpBlocked: candidate.pdpBlocked === true,
          });
          // Ensure parser version from adapter is visible on observation
          items.push({
            status: 'discovered',
            observation: {
              ...observation,
              parserVersion: ML_WORKER_ADAPTER_PARSER_VERSION || RAW_PARSER_VERSION,
              externalListingId: normalized.value.externalListingId,
            },
          });
        } catch (e) {
          items.push({
            status: 'rejected',
            reason: e instanceof Error ? e.message.slice(0, 120) : 'item_exception',
            inputSummary: { url: candidate.url?.slice(0, 80) },
          });
        }
      }

      return {
        sourceId: ML_WORKER_ADAPTER_SOURCE_ID,
        ok: true,
        items,
        errorCode: null,
        errorMessageSafe: null,
        latencyMs: Date.now() - started,
      };
    },
  };
}
