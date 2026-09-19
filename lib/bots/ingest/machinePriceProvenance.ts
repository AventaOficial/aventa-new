/**
 * Machine price-provenance wiring — S6.2.
 *
 * Preserves worker/source evidence into OfferQualitySignals for the S6.1 gate.
 * Never invents trusted provenance from discountPercent alone.
 * Never upgrades badge_reconstructed / unknown → listing_card | source_explicit
 * without new trusted card/source evidence in the same machine payload.
 *
 * Client-supplied provenance is out of scope here — callers must only pass
 * machine-ingest path fields (worker / SourceAdapter).
 */

import type { OfferQualitySignals } from './offerQualitySignals';

export type MachineCardDiscountSource =
  | 'badge_reconstructed'
  | 'card_strikethrough'
  | 'pdp'
  | 'unknown';

export type MachineOriginalPriceProvenance =
  | 'listing_card'
  | 'source_explicit'
  | 'unknown'
  | 'trusted_enrichment'
  | 'price_intel_derivation'
  | 'user_declared';

const TRUSTED_ORIGINAL = new Set(['listing_card', 'source_explicit']);
const CARD_SOURCES = new Set([
  'badge_reconstructed',
  'card_strikethrough',
  'pdp',
  'unknown',
]);
const ORIGINAL_PROVENANCES = new Set([
  'source_explicit',
  'trusted_enrichment',
  'price_intel_derivation',
  'user_declared',
  'listing_card',
  'unknown',
]);

export function isTrustedMachineOriginalProvenance(
  provenance: string | null | undefined,
): boolean {
  return TRUSTED_ORIGINAL.has((provenance ?? '').trim().toLowerCase());
}

export function normalizeMachineCardDiscountSource(
  raw: string | null | undefined,
): MachineCardDiscountSource | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s || !CARD_SOURCES.has(s)) return null;
  return s as MachineCardDiscountSource;
}

export function normalizeMachineOriginalPriceProvenance(
  raw: string | null | undefined,
): MachineOriginalPriceProvenance | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s || !ORIGINAL_PROVENANCES.has(s)) return null;
  return s as MachineOriginalPriceProvenance;
}

/**
 * Provenance trust rank for the upgrade invariant.
 * Lower = untrusted. Trusted ranks must never be reached from untrusted
 * without explicit new evidence handled in preserveMachinePriceProvenance.
 */
export function provenanceTrustRank(
  provenance: string | null | undefined,
  cardDiscountSource?: string | null,
): number {
  const card = normalizeMachineCardDiscountSource(cardDiscountSource);
  if (card === 'badge_reconstructed') return 0;
  const p = normalizeMachineOriginalPriceProvenance(provenance);
  if (!p || p === 'unknown') return 0;
  if (p === 'listing_card' || p === 'source_explicit') return 2;
  // Other machine paths (enrichment / intel) are not S6.1 admission trusted.
  return 1;
}

/**
 * Invariant: badge_reconstructed / unknown must not become listing_card
 * or source_explicit across pipeline stages without new trusted evidence.
 * Returns false when the transition is an illegal upgrade.
 */
export function isLegalProvenanceTransition(input: {
  fromProvenance: string | null | undefined;
  fromCardSource?: string | null;
  toProvenance: string | null | undefined;
  toCardSource?: string | null;
  /** True only when the same stage carries card_strikethrough + valid original. */
  hasNewCardStrikethroughEvidence?: boolean;
  /** True only when the same stage carries explicit PDP/source reference price. */
  hasNewSourceExplicitEvidence?: boolean;
}): boolean {
  const fromTrusted = isTrustedMachineOriginalProvenance(input.fromProvenance);
  const toTrusted = isTrustedMachineOriginalProvenance(input.toProvenance);
  const fromCard = normalizeMachineCardDiscountSource(input.fromCardSource);
  const toCard = normalizeMachineCardDiscountSource(input.toCardSource);

  if (fromCard === 'badge_reconstructed' && toTrusted) {
    return false;
  }
  if (
    (!input.fromProvenance ||
      normalizeMachineOriginalPriceProvenance(input.fromProvenance) === 'unknown') &&
    toTrusted &&
    !input.hasNewCardStrikethroughEvidence &&
    !input.hasNewSourceExplicitEvidence
  ) {
    return false;
  }
  if (fromTrusted && toTrusted) return true;
  if (!fromTrusted && toTrusted) {
    return Boolean(
      input.hasNewCardStrikethroughEvidence || input.hasNewSourceExplicitEvidence,
    );
  }
  // Demotion or stay-untrusted is always legal.
  if (toCard === 'badge_reconstructed' && fromCard === 'card_strikethrough') {
    // Do not silently demote strikethrough → badge in preserve; callers own that.
    return true;
  }
  return true;
}

export type PreserveMachinePriceProvenanceInput = {
  salePrice: number;
  originalPrice: number | null;
  signals?: Partial<OfferQualitySignals> | null;
  /** Top-level worker fields (machine path only). */
  cardDiscountSource?: string | null;
  cardBadgePercent?: number | null;
};

export type PreservedMachinePriceProvenance = {
  signals: OfferQualitySignals;
  /** Compact slice for RawObservation.payload.summary / bot_meta reuse. */
  summary: {
    originalPriceProvenance: string | null;
    cardDiscountSource: string | null;
    cardBadgePercent: number | null;
  };
};

/**
 * Merge worker top-level + signals into a single signals object.
 * Does not invent listing_card from discountPercent.
 * Maps card_strikethrough + real original → listing_card only when provenance absent.
 */
export function preserveMachinePriceProvenance(
  input: PreserveMachinePriceProvenanceInput,
): PreservedMachinePriceProvenance {
  const base: OfferQualitySignals = { ...(input.signals ?? {}) };

  const cardFromSignals = normalizeMachineCardDiscountSource(base.cardDiscountSource);
  const cardFromTop = normalizeMachineCardDiscountSource(input.cardDiscountSource);
  // Prefer signals when set; otherwise lift top-level worker field.
  const cardDiscountSource = cardFromSignals ?? cardFromTop;

  const badgeFromSignals =
    typeof base.cardBadgePercent === 'number' && Number.isFinite(base.cardBadgePercent)
      ? base.cardBadgePercent
      : null;
  const badgeFromTop =
    typeof input.cardBadgePercent === 'number' && Number.isFinite(input.cardBadgePercent)
      ? input.cardBadgePercent
      : null;
  const cardBadgePercent = badgeFromSignals ?? badgeFromTop;

  let originalPriceProvenance = normalizeMachineOriginalPriceProvenance(
    base.originalPriceProvenance,
  );

  const hasValidOriginal =
    input.originalPrice != null &&
    Number.isFinite(input.originalPrice) &&
    input.originalPrice > input.salePrice;

  const hasCardStrikethroughEvidence =
    cardDiscountSource === 'card_strikethrough' && hasValidOriginal;

  // Fail-closed: badge evidence never carries trusted original provenance.
  if (cardDiscountSource === 'badge_reconstructed') {
    if (
      originalPriceProvenance &&
      isTrustedMachineOriginalProvenance(originalPriceProvenance)
    ) {
      originalPriceProvenance = 'unknown';
    }
    if (!originalPriceProvenance) originalPriceProvenance = 'unknown';
  }

  // Explicit mapping from real strikethrough evidence when provenance was omitted.
  if (hasCardStrikethroughEvidence && !originalPriceProvenance) {
    const legal = isLegalProvenanceTransition({
      fromProvenance: null,
      fromCardSource: cardDiscountSource,
      toProvenance: 'listing_card',
      toCardSource: cardDiscountSource,
      hasNewCardStrikethroughEvidence: true,
    });
    if (legal) originalPriceProvenance = 'listing_card';
  }

  // PDP / source_explicit already on signals is preserved as-is (machine path).
  // Do not invent source_explicit from prices alone.

  // Honest documentation: original present but no trusted evidence → unknown.
  // Explicit `unknown` is never upgraded without new evidence (invariant).
  if (hasValidOriginal && !originalPriceProvenance) {
    originalPriceProvenance = 'unknown';
  }

  const signals: OfferQualitySignals = {
    ...base,
    ...(cardDiscountSource ? { cardDiscountSource } : {}),
    ...(cardBadgePercent != null ? { cardBadgePercent } : {}),
    ...(originalPriceProvenance
      ? { originalPriceProvenance }
      : {}),
  };

  return {
    signals,
    summary: {
      originalPriceProvenance: originalPriceProvenance ?? null,
      cardDiscountSource: cardDiscountSource ?? null,
      cardBadgePercent: cardBadgePercent ?? null,
    },
  };
}

/** Safe structured trace for diagnostics (no secrets / HTML). */
export function tracePriceProvenanceBoundary(
  stage: string,
  summary: PreservedMachinePriceProvenance['summary'] & {
    salePrice?: number | null;
    originalPrice?: number | null;
    discountPercent?: number | null;
  },
): Record<string, unknown> {
  return {
    stage,
    salePrice: summary.salePrice ?? null,
    originalPrice: summary.originalPrice ?? null,
    discountPercent: summary.discountPercent ?? null,
    originalPriceProvenance: summary.originalPriceProvenance,
    cardDiscountSource: summary.cardDiscountSource,
    cardBadgePercent: summary.cardBadgePercent,
  };
}
