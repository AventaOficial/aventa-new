/**
 * CazaOfertasss — BRIDGE-01. Anti-corruption layer:
 * Mercado Libre worker / ingest candidates → DealDiscoverySource.
 *
 * Consumes the EXISTING discovery payload shape (`ExternalWorkerCandidate`-compatible).
 * Does NOT scrape, fetch, call ML APIs, invent prices, invent affiliate URLs,
 * or recalculate discounts as authority — discount claim remains with evidence.ts.
 *
 * Provenance → DealEvidence is a FAIL-CLOSED mapping:
 *   badge_reconstructed / missing original → REJECT (not eligible)
 *   card_strikethrough | pdp with valid original → store_product_page evidence
 */

import { MAX_DISCOVERY_PAGE_SIZE, MAX_DISCOVERY_PER_RUN } from '../constants';
import { buildDealIdentity } from '../identity';
import {
  createStaticDiscoverySource,
  type DealDiscoverySource,
} from '../orchestration/discoverySource';
import type { CazaClock } from '../orchestration/types';
import { normalizeCurrency, normalizePrice } from '../price';
import type {
  CazaResult,
  DealCandidateDraft,
  DealEvidence,
  EvidenceQuality,
  HistoricalConfidence,
  PriceConfidence,
} from '../types';
import { failResult, okResult } from '../types';

/** Structural mirror of ingest `ExternalWorkerCandidate` — ACL input, no import from bots. */
export type MercadoLibreWorkerDiscoveryCandidate = {
  readonly url: string;
  readonly title: string;
  readonly store?: string | null;
  readonly imageUrl?: string | null;
  readonly discountPrice: number;
  readonly originalPrice: number | null;
  readonly discountPercent?: number | null;
  readonly canonicalUrl?: string | null;
  readonly sourceDetail?: string | null;
  readonly signals?: {
    readonly currentPriceProvenance?: string | null;
    readonly originalPriceProvenance?: string | null;
    readonly discountPercentProvenance?: string | null;
    readonly cardDiscountSource?: string | null;
    readonly cardBadgePercent?: number | null;
  } | null;
  readonly cardDiscountSource?: string | null;
  readonly cardBadgePercent?: number | null;
  readonly pdpBlocked?: boolean | null;
};

export type MercadoLibreWorkerBridgeRejectCode =
  | 'bridge.url_missing'
  | 'bridge.title_missing'
  | 'bridge.url_invalid'
  | 'bridge.store_not_ml'
  | 'bridge.current_price_invalid'
  | 'bridge.reference_price_invalid'
  | 'bridge.reference_not_above_current'
  | 'bridge.evidence_badge_only'
  | 'bridge.evidence_insufficient'
  | 'bridge.evidence_pdp_blocked'
  | 'bridge.currency_unsupported'
  | 'bridge.identity_failed'
  | 'bridge.batch_limit_exceeded';

export interface MercadoLibreWorkerBridgeMapResult {
  readonly ok: true;
  readonly draft: DealCandidateDraft;
  readonly identityKey: string;
  readonly externalProductId: string | null;
  readonly cardDiscountSource: string | null;
  readonly originalPriceProvenance: string | null;
}

export interface MercadoLibreWorkerBridgeReject {
  readonly ok: false;
  readonly reasonCode: MercadoLibreWorkerBridgeRejectCode;
  readonly reasons: readonly string[];
}

export type MercadoLibreWorkerBridgeOutcome =
  | MercadoLibreWorkerBridgeMapResult
  | MercadoLibreWorkerBridgeReject;

export interface MapMercadoLibreWorkerCandidateOptions {
  readonly now: Date;
  /** Observation time for evidence.capturedAt. Defaults to now. */
  readonly observedAt?: string;
}

function cardSourceOf(c: MercadoLibreWorkerDiscoveryCandidate): string | null {
  const raw =
    c.cardDiscountSource ??
    c.signals?.cardDiscountSource ??
    null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  return s.length > 0 ? s : null;
}

function originalProvenanceOf(c: MercadoLibreWorkerDiscoveryCandidate): string | null {
  const raw = c.signals?.originalPriceProvenance ?? null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  return s.length > 0 ? s : null;
}

/**
 * Extract stable ML listing id from worker URL/canonical without inventing.
 * Prefers query wid/item_id (worker canonicalize), then path MLM / catalog /up/MLMU.
 */
export function extractMercadoLibreExternalIdFromWorkerUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    for (const key of ['wid', 'item_id', 'itemId']) {
      const v = parsed.searchParams.get(key);
      if (!v) continue;
      const id = v.replace(/-/g, '').trim().toUpperCase();
      if (/^MLM\d{6,14}$/.test(id)) return id;
      if (/^ML[A-Z]U\d{6,14}$/.test(id)) return id;
    }
    const path = parsed.pathname;
    const listing = /\/(MLM)-?(\d{6,14})(?:[-/?]|$)/i.exec(path);
    if (listing) return `MLM${listing[2]}`;
    const catalog = /\/p\/(MLM\d{6,14})(?:[/?]|$)/i.exec(path);
    if (catalog) return catalog[1].toUpperCase();
    const upp = /\/up\/(ML[A-Z]U\d{6,14})(?:[/?]|$)/i.exec(path);
    if (upp) return upp[1].toUpperCase();
    return null;
  } catch {
    return null;
  }
}

function isMercadoLibreStoreLabel(store: string | null | undefined): boolean {
  if (store == null || store.trim() === '') return true; // worker omits → assume ML batch
  return /mercado\s*libre/i.test(store) || store.trim().toLowerCase() === 'mercadolibre_mx';
}

function mapEvidenceFromProvenance(input: {
  readonly cardSource: string | null;
  readonly originalProvenance: string | null;
  readonly currentPrice: number;
  readonly referencePrice: number;
  readonly capturedAt: string;
}): CazaResult<DealEvidence> {
  const { cardSource, originalProvenance, currentPrice, referencePrice, capturedAt } = input;

  if (cardSource === 'badge_reconstructed') {
    return failResult(['bridge.evidence_badge_only']);
  }

  let priceConfidence: PriceConfidence;
  let historicalConfidence: HistoricalConfidence;
  let evidenceQuality: EvidenceQuality;
  let evidenceSource: DealEvidence['source'];

  if (cardSource === 'pdp' && (originalProvenance === 'source_explicit' || originalProvenance === 'listing_card')) {
    evidenceSource = 'store_product_page';
    priceConfidence = 'verified';
    historicalConfidence = 'store_reference_price';
    evidenceQuality = 'strong';
  } else if (cardSource === 'card_strikethrough') {
    evidenceSource = 'store_product_page';
    priceConfidence = 'reported';
    historicalConfidence = 'store_reference_price';
    evidenceQuality = 'moderate';
  } else if (
    cardSource === 'pdp' ||
    originalProvenance === 'source_explicit' ||
    originalProvenance === 'listing_card'
  ) {
    // PDP without clear original provenance, or listing_card without card tag — still listing evidence.
    evidenceSource = 'store_product_page';
    priceConfidence = 'reported';
    historicalConfidence = 'store_reference_price';
    evidenceQuality = 'moderate';
  } else {
    return failResult(['bridge.evidence_insufficient']);
  }

  return okResult({
    source: evidenceSource,
    capturedAt,
    currentPrice,
    referencePrice,
    currency: 'MXN',
    evidenceQuality,
    priceConfidence,
    historicalConfidence,
    observationWindowDays: null,
    observationCount: null,
    couponApplied: false,
    promotionApplied: true,
    notes: `ml_worker:${cardSource ?? 'unknown'}:${originalProvenance ?? 'unknown'}`,
  });
}

/**
 * Deterministic ACL: one worker candidate → DealCandidateDraft or reject.
 * Does not invent originalPrice, discount, affiliate, or evidence grades above provenance.
 */
export function mapMercadoLibreWorkerCandidateToDealDraft(
  candidate: MercadoLibreWorkerDiscoveryCandidate,
  options: MapMercadoLibreWorkerCandidateOptions
): MercadoLibreWorkerBridgeOutcome {
  const url = (candidate.canonicalUrl ?? candidate.url)?.trim() ?? '';
  const title = candidate.title?.trim() ?? '';
  if (!url) {
    return { ok: false, reasonCode: 'bridge.url_missing', reasons: ['bridge.url_missing'] };
  }
  if (!title) {
    return { ok: false, reasonCode: 'bridge.title_missing', reasons: ['bridge.title_missing'] };
  }
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, reasonCode: 'bridge.url_invalid', reasons: ['bridge.url_invalid'] };
  }
  if (!isMercadoLibreStoreLabel(candidate.store)) {
    return { ok: false, reasonCode: 'bridge.store_not_ml', reasons: ['bridge.store_not_ml'] };
  }
  if (candidate.pdpBlocked === true && cardSourceOf(candidate) === 'pdp') {
    return {
      ok: false,
      reasonCode: 'bridge.evidence_pdp_blocked',
      reasons: ['bridge.evidence_pdp_blocked'],
    };
  }

  const current = normalizePrice(candidate.discountPrice);
  if (!current.ok) {
    return {
      ok: false,
      reasonCode: 'bridge.current_price_invalid',
      reasons: current.reasons.map((r) => `bridge.current_${r}`),
    };
  }

  if (candidate.originalPrice == null) {
    return {
      ok: false,
      reasonCode: 'bridge.evidence_insufficient',
      reasons: ['bridge.reference_absent'],
    };
  }
  const reference = normalizePrice(candidate.originalPrice);
  if (!reference.ok) {
    return {
      ok: false,
      reasonCode: 'bridge.reference_price_invalid',
      reasons: reference.reasons.map((r) => `bridge.reference_${r}`),
    };
  }
  if (reference.value <= current.value) {
    return {
      ok: false,
      reasonCode: 'bridge.reference_not_above_current',
      reasons: ['bridge.reference_not_above_current'],
    };
  }

  const currency = normalizeCurrency('MXN');
  if (!currency.ok) {
    return {
      ok: false,
      reasonCode: 'bridge.currency_unsupported',
      reasons: currency.reasons,
    };
  }

  const cardSource = cardSourceOf(candidate);
  const originalProvenance = originalProvenanceOf(candidate);
  const capturedAt = options.observedAt ?? options.now.toISOString();

  const evidence = mapEvidenceFromProvenance({
    cardSource,
    originalProvenance,
    currentPrice: current.value,
    referencePrice: reference.value,
    capturedAt,
  });
  if (!evidence.ok) {
    const code =
      evidence.reasons[0] === 'bridge.evidence_badge_only'
        ? 'bridge.evidence_badge_only'
        : 'bridge.evidence_insufficient';
    return { ok: false, reasonCode: code, reasons: evidence.reasons };
  }

  const extractedId =
    extractMercadoLibreExternalIdFromWorkerUrl(url) ??
    extractMercadoLibreExternalIdFromWorkerUrl(candidate.url);

  const identity = buildDealIdentity({
    store: 'mercadolibre_mx',
    url,
    externalProductId: extractedId,
  });
  if (!identity.ok) {
    return {
      ok: false,
      reasonCode: 'bridge.identity_failed',
      reasons: identity.reasons.map((r) => `bridge.${r}`),
    };
  }

  const draft: DealCandidateDraft = {
    store: 'mercadolibre_mx',
    externalProductId: identity.value.externalProductId,
    title,
    url: identity.value.normalizedUrl,
    currentPrice: current.value,
    referencePrice: reference.value,
    currency: currency.value,
    category: 'other',
    availability: 'unknown',
    seller: { trustClass: 'unknown' },
    evidence: evidence.value,
    detectedAt: capturedAt,
  };

  return {
    ok: true,
    draft,
    identityKey: identity.value.key,
    externalProductId: identity.value.externalProductId,
    cardDiscountSource: cardSource,
    originalPriceProvenance: originalProvenance,
  };
}

export interface MercadoLibreWorkerDiscoverySourceOptions {
  readonly candidates: readonly MercadoLibreWorkerDiscoveryCandidate[];
  readonly clock?: CazaClock;
  readonly sourceId?: string;
  /** Hard cap on accepted drafts (≤ MAX_DISCOVERY_PER_RUN). */
  readonly maxItems?: number;
}

export interface MercadoLibreWorkerDiscoverySource extends DealDiscoverySource {
  readonly bridgeReport: {
    readonly received: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly rejectReasonCounts: Readonly<Record<string, number>>;
  };
}

/**
 * DealDiscoverySource over an already-discovered worker batch.
 * No network. Bounded. Runner-compatible without runner changes.
 */
export function createMercadoLibreWorkerDiscoverySource(
  options: MercadoLibreWorkerDiscoverySourceOptions
): MercadoLibreWorkerDiscoverySource {
  const clock = options.clock ?? (() => new Date());
  const maxItems = Math.min(
    Math.max(1, options.maxItems ?? MAX_DISCOVERY_PER_RUN),
    MAX_DISCOVERY_PER_RUN
  );
  const now = clock();
  const observedAt = now.toISOString();

  const drafts: DealCandidateDraft[] = [];
  const rejectReasonCounts: Record<string, number> = {};
  let rejected = 0;
  const received = options.candidates.length;

  if (received > maxItems) {
    // Fail-closed batch: do not partially accept an oversized injection.
    rejectReasonCounts['bridge.batch_limit_exceeded'] = received;
    const empty = createStaticDiscoverySource({
      sourceId: options.sourceId ?? 'ml_worker:bridge',
      store: 'mercadolibre_mx',
      items: [],
      clock,
    });
    return {
      ...empty,
      bridgeReport: {
        received,
        accepted: 0,
        rejected: received,
        rejectReasonCounts,
      },
    };
  }

  for (const candidate of options.candidates) {
    const mapped = mapMercadoLibreWorkerCandidateToDealDraft(candidate, {
      now,
      observedAt,
    });
    if (!mapped.ok) {
      rejected += 1;
      rejectReasonCounts[mapped.reasonCode] = (rejectReasonCounts[mapped.reasonCode] ?? 0) + 1;
      continue;
    }
    drafts.push(mapped.draft);
  }

  const inner = createStaticDiscoverySource({
    sourceId: options.sourceId ?? 'ml_worker:bridge',
    store: 'mercadolibre_mx',
    items: drafts.slice(0, MAX_DISCOVERY_PAGE_SIZE * 4), // still ≤ maxItems ≤ 200
    clock,
  });

  return {
    ...inner,
    bridgeReport: {
      received,
      accepted: drafts.length,
      rejected,
      rejectReasonCounts,
    },
  };
}
