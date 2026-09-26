/**
 * Day 13.2 — Price Intelligence identity observability (OBSERVABILITY ONLY).
 *
 * Records which identity each Price Intelligence (PI) calculation used, whether a
 * later layer recalculated / overwrote it, and which Price Memory write attempts
 * happened on the way. It never changes keys, writes, intel, DQE, S6.1 or provenance.
 *
 * Identity kinds come only from explicit evidence already carried by the flow
 * (products/items mapping + Day 12.2 identity signals). Never from ID shape.
 * Unknown stays `unknown` / null.
 */

import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type {
  PriceIntelEvidenceKind,
  PriceIntelExplicitKind,
  PriceIntelObserver,
  PriceIntelWriter,
} from '@/lib/bots/ingest/priceIntelObserver';

export const PRICE_INTEL_OBSERVABILITY_VERSION = 1 as const;

export type PriceIntelIdentityKind = PriceIntelExplicitKind;

export const PRICE_INTEL_IDENTITY_SOURCES = [
  'sticky_observe',
  'discovery',
  'worker',
  'identity_mapping',
  'unknown',
] as const;

export type PriceIntelIdentitySource = (typeof PRICE_INTEL_IDENTITY_SOURCES)[number];

export type PriceIntelOverwriteReason = 'identity_changed' | 'same_identity_recalculated' | 'unknown';

export type PriceIntelCalculationRecord = {
  stage: PriceIntelWriter;
  identity_id: string | null;
  identity_kind: PriceIntelIdentityKind;
  identity_source: PriceIntelIdentitySource;
  evidence_kind: PriceIntelEvidenceKind;
  observed_listing_id: string | null;
  /** Whether this calculation's output reached the candidate meta (null = not known). */
  applied_to_meta: boolean | null;
};

export type PriceMemoryWriteRecord = {
  writer: PriceIntelWriter;
  /** Exact `product_id` passed to the Price Memory writer. */
  key: string;
  /** Only when the calling code knows it explicitly; otherwise `unknown`. */
  key_kind: PriceIntelIdentityKind;
  /** Identity of the PI calculation performed by the same call (same key). */
  pi_identity_kind: PriceIntelIdentityKind;
  pi_identity_id: string | null;
  /** Latest PI calculation for this candidate before this write (null when none). */
  prior_pi_identity_kind: PriceIntelIdentityKind | null;
  prior_pi_identity_id: string | null;
  observed_listing_id: string | null;
  evidence_kind: PriceIntelEvidenceKind;
  after_price_intel: boolean;
  /** Write was attempted; the writer does not report success to callers. */
  attempted: true;
};

export type PriceIntelSummary = {
  identity_kind: PriceIntelIdentityKind;
  identity_id: string | null;
  history_ready: boolean | null;
  habitual30d: number | null;
  lowest30d: number | null;
  lowest90d: number | null;
  current_price: number | null;
  original_price: number | null;
  artificial_detected: boolean | null;
  artificial_clauses: string[];
};

export type PriceIntelSecondPassChanges = {
  identity: boolean;
  history_ready: boolean;
  habitual30d: boolean;
  lowest30d: boolean;
  lowest90d: boolean;
  current_price: boolean;
  original_price: boolean;
  artificial: boolean;
};

export type PriceIntelObservation = {
  price_intel_observability_version: typeof PRICE_INTEL_OBSERVABILITY_VERSION;
  price_intel_identity_kind: PriceIntelIdentityKind;
  price_intel_identity_id: string | null;
  observed_listing_id: string | null;
  price_intel_identity_source: PriceIntelIdentitySource;
  price_intel_evidence_kind: PriceIntelEvidenceKind;
  price_intel_calculation_count: number;
  price_intel_overwrite_detected: boolean;
  price_intel_previous_identity_kind: PriceIntelIdentityKind | null;
  price_intel_previous_identity_id: string | null;
  price_intel_overwrite_reason: PriceIntelOverwriteReason | null;
  /** Whether the overwritten calculation had reached meta (null when no overwrite). */
  price_intel_previous_result_applied: boolean | null;
  /** Compact summaries around the second PI pass (null when that pass did not run). */
  before_second_pass: PriceIntelSummary | null;
  after_second_pass: PriceIntelSummary | null;
  second_pass_changed: PriceIntelSecondPassChanges | null;
  calculations: PriceIntelCalculationRecord[];
  price_memory_writes: PriceMemoryWriteRecord[];
  price_memory_writes_truncated: boolean;
};

const MAX_CALCULATIONS = 6;
const MAX_PM_WRITES = 6;

function normId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/-/g, '').trim().toUpperCase();
  return s || null;
}

function finiteOrNull(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Classify the identity used by `enrichWithPriceIntel` (derived from canonicalUrl)
 * against the explicit Day 12.2 identity signals already on the meta.
 * Only `catalog_to_listing_via_products_items` proves which side is PRODUCT / LISTING.
 */
export function classifyUrlDerivedPriceIntelIdentity(input: {
  id: string | null;
  signals: ParsedOfferMetadata['signals'] | null | undefined;
  acquisitionPath: string | null | undefined;
}): { kind: PriceIntelIdentityKind; source: PriceIntelIdentitySource } {
  const id = normId(input.id);
  const sig = input.signals ?? null;
  if (id && sig?.mlIdentityMatchMethod === 'catalog_to_listing_via_products_items') {
    if (id === normId(sig.mlListingItemId)) return { kind: 'listing', source: 'identity_mapping' };
    if (id === normId(sig.mlCatalogProductId)) return { kind: 'product', source: 'identity_mapping' };
  }
  const source: PriceIntelIdentitySource =
    input.acquisitionPath === 'sticky_observe'
      ? 'sticky_observe'
      : input.acquisitionPath === 'discovery_evidence_fallback'
        ? 'discovery'
        : 'unknown';
  return { kind: 'unknown', source };
}

/** Listing id only when the products/items mapping proved it; never inferred. */
export function explicitListingIdFromSignals(
  signals: ParsedOfferMetadata['signals'] | null | undefined,
): string | null {
  if (signals?.mlIdentityMatchMethod !== 'catalog_to_listing_via_products_items') return null;
  return normId(signals.mlListingItemId);
}

export function summarizePriceIntel(
  meta: ParsedOfferMetadata | null,
  identity: { kind: PriceIntelIdentityKind; id: string | null },
): PriceIntelSummary | null {
  if (!meta) return null;
  const s = meta.signals ?? {};
  return {
    identity_kind: identity.kind,
    identity_id: identity.id,
    history_ready: typeof s.historyReady === 'boolean' ? s.historyReady : null,
    habitual30d: finiteOrNull(s.habitual30d),
    lowest30d: finiteOrNull(s.priceLowest30d),
    lowest90d: finiteOrNull(s.priceLowest90d),
    current_price: finiteOrNull(meta.discountPrice),
    original_price: finiteOrNull(meta.originalPrice),
    artificial_detected:
      typeof s.suspectedArtificialListPrice === 'boolean' ? s.suspectedArtificialListPrice : null,
    artificial_clauses: Array.isArray(s.artificialListPriceClauses)
      ? [...(s.artificialListPriceClauses as string[])].sort()
      : [],
  };
}

export function diffPriceIntelSummaries(
  before: PriceIntelSummary | null,
  after: PriceIntelSummary | null,
): PriceIntelSecondPassChanges | null {
  if (!before || !after) return null;
  return {
    identity: before.identity_kind !== after.identity_kind || before.identity_id !== after.identity_id,
    history_ready: before.history_ready !== after.history_ready,
    habitual30d: before.habitual30d !== after.habitual30d,
    lowest30d: before.lowest30d !== after.lowest30d,
    lowest90d: before.lowest90d !== after.lowest90d,
    current_price: before.current_price !== after.current_price,
    original_price: before.original_price !== after.original_price,
    artificial:
      before.artificial_detected !== after.artificial_detected ||
      before.artificial_clauses.join('+') !== after.artificial_clauses.join('+'),
  };
}

export type PriceIntelRecorder = {
  /** Observer for a stage; `classify` maps the computed id to kind/source. */
  observerFor(
    stage: PriceIntelWriter,
    classify: (event: { id: string; kind: PriceIntelExplicitKind }) => {
      kind: PriceIntelIdentityKind;
      source: PriceIntelIdentitySource;
    },
  ): PriceIntelObserver;
  /** Marks whether the latest calculation of `stage` reached the candidate meta. */
  markApplied(stage: PriceIntelWriter, applied: boolean): void;
  /** Identity of the latest calculation known to have reached meta (null when none). */
  latestAppliedIdentity(): { kind: PriceIntelIdentityKind; id: string | null } | null;
  calculationCount(): number;
  setSecondPassSummaries(before: PriceIntelSummary | null, after: PriceIntelSummary | null): void;
  finalize(input?: { explicitListingId?: string | null }): PriceIntelObservation;
};

export function createPriceIntelRecorder(): PriceIntelRecorder {
  const calcs: PriceIntelCalculationRecord[] = [];
  const writes: PriceMemoryWriteRecord[] = [];
  let writesTruncated = false;
  let before: PriceIntelSummary | null = null;
  let after: PriceIntelSummary | null = null;

  const latest = () => (calcs.length > 0 ? calcs[calcs.length - 1]! : null);

  return {
    observerFor(stage, classify) {
      return {
        onPriceMemoryWriteAttempt: (e) => {
          if (writes.length >= MAX_PM_WRITES) {
            writesTruncated = true;
            return;
          }
          const prior = latest();
          const key = normId(e.key) ?? e.key;
          const classified = classify({ id: key, kind: e.keyKind });
          writes.push({
            writer: e.writer,
            key,
            key_kind: e.keyKind === 'unknown' ? classified.kind : e.keyKind,
            pi_identity_kind: e.keyKind === 'unknown' ? classified.kind : e.keyKind,
            pi_identity_id: key,
            prior_pi_identity_kind: prior ? prior.identity_kind : null,
            prior_pi_identity_id: prior ? prior.identity_id : null,
            observed_listing_id: normId(e.observedListingId),
            evidence_kind: e.evidenceKind,
            after_price_intel: prior !== null,
            attempted: true,
          });
        },
        onPriceIntelComputed: (e) => {
          if (calcs.length >= MAX_CALCULATIONS) return;
          const id = normId(e.id);
          const classified = classify({ id: id ?? e.id, kind: e.kind });
          calcs.push({
            stage,
            identity_id: id,
            identity_kind: e.kind === 'unknown' ? classified.kind : e.kind,
            identity_source: classified.source,
            evidence_kind: e.evidenceKind,
            observed_listing_id: normId(e.observedListingId),
            applied_to_meta: null,
          });
        },
      };
    },
    markApplied(stage, applied) {
      for (let i = calcs.length - 1; i >= 0; i--) {
        if (calcs[i]!.stage === stage) {
          calcs[i]!.applied_to_meta = applied;
          return;
        }
      }
    },
    latestAppliedIdentity() {
      for (let i = calcs.length - 1; i >= 0; i--) {
        const c = calcs[i]!;
        if (c.applied_to_meta === true) return { kind: c.identity_kind, id: c.identity_id };
      }
      return null;
    },
    calculationCount() {
      return calcs.length;
    },
    setSecondPassSummaries(b, a) {
      before = b;
      after = a;
    },
    finalize(input) {
      let finalIdx = -1;
      for (let i = calcs.length - 1; i >= 0; i--) {
        if (calcs[i]!.applied_to_meta === true) {
          finalIdx = i;
          break;
        }
      }
      const final = finalIdx >= 0 ? calcs[finalIdx]! : null;
      const previous = finalIdx > 0 ? calcs[finalIdx - 1]! : null;
      const overwrite = final !== null && previous !== null;
      let reason: PriceIntelOverwriteReason | null = null;
      if (overwrite) {
        reason =
          final!.identity_id && previous!.identity_id
            ? final!.identity_id === previous!.identity_id
              ? 'same_identity_recalculated'
              : 'identity_changed'
            : 'unknown';
      }
      const observedListing =
        final?.observed_listing_id ??
        calcs.find((c) => c.observed_listing_id)?.observed_listing_id ??
        normId(input?.explicitListingId ?? null);

      return {
        price_intel_observability_version: PRICE_INTEL_OBSERVABILITY_VERSION,
        price_intel_identity_kind: final?.identity_kind ?? 'unknown',
        price_intel_identity_id: final?.identity_id ?? null,
        observed_listing_id: observedListing ?? null,
        price_intel_identity_source: final?.identity_source ?? 'unknown',
        price_intel_evidence_kind: final?.evidence_kind ?? 'unknown',
        price_intel_calculation_count: calcs.length,
        price_intel_overwrite_detected: overwrite,
        price_intel_previous_identity_kind: overwrite ? previous!.identity_kind : null,
        price_intel_previous_identity_id: overwrite ? previous!.identity_id : null,
        price_intel_overwrite_reason: reason,
        price_intel_previous_result_applied: overwrite ? previous!.applied_to_meta : null,
        before_second_pass: before,
        after_second_pass: after,
        second_pass_changed: diffPriceIntelSummaries(before, after),
        calculations: calcs.map((c) => ({ ...c })),
        price_memory_writes: writes.map((w) => ({ ...w })),
        price_memory_writes_truncated: writesTruncated,
      };
    },
  };
}

/**
 * Runs the existing second PI pass unchanged (`run` receives the same meta) and
 * records identity + before/after summaries. Errors are rethrown untouched so the
 * caller's existing error handling stays authoritative.
 */
export async function runObservedSecondPricePass(input: {
  meta: ParsedOfferMetadata;
  recorder: PriceIntelRecorder;
  acquisitionPath: string | null;
  run: (meta: ParsedOfferMetadata, observer: PriceIntelObserver) => Promise<ParsedOfferMetadata>;
}): Promise<ParsedOfferMetadata> {
  const { meta, recorder } = input;
  const signalsAtEntry = meta.signals ? { ...meta.signals } : null;
  const beforeIdentity = recorder.latestAppliedIdentity() ?? { kind: 'unknown' as const, id: null };
  const before = summarizePriceIntel(meta, beforeIdentity);
  const countBefore = recorder.calculationCount();
  const observer = recorder.observerFor('enrich_with_price_intel', ({ id }) =>
    classifyUrlDerivedPriceIntelIdentity({
      id,
      signals: signalsAtEntry,
      acquisitionPath: input.acquisitionPath,
    }),
  );

  let out: ParsedOfferMetadata;
  try {
    out = await input.run(meta, observer);
  } catch (error) {
    if (recorder.calculationCount() > countBefore) {
      recorder.markApplied('enrich_with_price_intel', false);
    }
    recorder.setSecondPassSummaries(before, summarizePriceIntel(meta, beforeIdentity));
    throw error;
  }

  const calculated = recorder.calculationCount() > countBefore;
  if (calculated) recorder.markApplied('enrich_with_price_intel', true);
  const afterIdentity = calculated
    ? (recorder.latestAppliedIdentity() ?? beforeIdentity)
    : beforeIdentity;
  recorder.setSecondPassSummaries(before, summarizePriceIntel(out, afterIdentity));
  return out;
}

export type PriceIntelObservabilityAggregate = {
  price_intel_observability_version: typeof PRICE_INTEL_OBSERVABILITY_VERSION;
  candidates: number;
  calculations_total: number;
  multi_calculation: number;
  overwrite_detected: number;
  identity_changed: number;
  same_identity_recalculated: number;
  overwrite_reason_unknown: number;
  final_identity_kind: Record<PriceIntelIdentityKind, number>;
  final_evidence_kind: Record<PriceIntelEvidenceKind, number>;
  second_pass_changed_history_ready: number;
  second_pass_changed_habitual30d: number;
  second_pass_changed_lowest30d: number;
  second_pass_changed_lowest90d: number;
  second_pass_changed_artificial: number;
  pm_write_attempts: number;
  pm_write_attempts_after_price_intel: number;
  pm_write_attempts_key_differs_from_prior_pi: number;
};

export function aggregatePriceIntelObservations(
  list: ReadonlyArray<PriceIntelObservation | null | undefined>,
): PriceIntelObservabilityAggregate {
  const agg: PriceIntelObservabilityAggregate = {
    price_intel_observability_version: PRICE_INTEL_OBSERVABILITY_VERSION,
    candidates: 0,
    calculations_total: 0,
    multi_calculation: 0,
    overwrite_detected: 0,
    identity_changed: 0,
    same_identity_recalculated: 0,
    overwrite_reason_unknown: 0,
    final_identity_kind: { product: 0, listing: 0, unknown: 0 },
    final_evidence_kind: { live: 0, fallback: 0, unknown: 0 },
    second_pass_changed_history_ready: 0,
    second_pass_changed_habitual30d: 0,
    second_pass_changed_lowest30d: 0,
    second_pass_changed_lowest90d: 0,
    second_pass_changed_artificial: 0,
    pm_write_attempts: 0,
    pm_write_attempts_after_price_intel: 0,
    pm_write_attempts_key_differs_from_prior_pi: 0,
  };
  for (const o of list) {
    if (!o) continue;
    agg.candidates += 1;
    agg.calculations_total += o.price_intel_calculation_count;
    if (o.price_intel_calculation_count > 1) agg.multi_calculation += 1;
    if (o.price_intel_overwrite_detected) agg.overwrite_detected += 1;
    if (o.price_intel_overwrite_reason === 'identity_changed') agg.identity_changed += 1;
    if (o.price_intel_overwrite_reason === 'same_identity_recalculated') agg.same_identity_recalculated += 1;
    if (o.price_intel_overwrite_reason === 'unknown') agg.overwrite_reason_unknown += 1;
    agg.final_identity_kind[o.price_intel_identity_kind] += 1;
    agg.final_evidence_kind[o.price_intel_evidence_kind] += 1;
    const ch = o.second_pass_changed;
    if (ch?.history_ready) agg.second_pass_changed_history_ready += 1;
    if (ch?.habitual30d) agg.second_pass_changed_habitual30d += 1;
    if (ch?.lowest30d) agg.second_pass_changed_lowest30d += 1;
    if (ch?.lowest90d) agg.second_pass_changed_lowest90d += 1;
    if (ch?.artificial) agg.second_pass_changed_artificial += 1;
    for (const w of o.price_memory_writes) {
      agg.pm_write_attempts += 1;
      if (w.after_price_intel) agg.pm_write_attempts_after_price_intel += 1;
      if (w.prior_pi_identity_id && w.prior_pi_identity_id !== w.key) {
        agg.pm_write_attempts_key_differs_from_prior_pi += 1;
      }
    }
  }
  return agg;
}
