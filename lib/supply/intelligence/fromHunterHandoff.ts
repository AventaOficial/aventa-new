/**
 * S8 ← S8.1 handoff adapter.
 * Maps HunterBenchmark `hunterCandidateToS8Input()` DTO → OpportunityCandidate.
 * Never trusts hunter original/reference as SoT without S8 provenance rules.
 */

import type { OpportunityCandidate } from './types';

/** Shape produced by lib/supply/hunterBenchmark hunterCandidateToS8Input. */
export type HunterS8HandoffInput = {
  candidateId?: string;
  sourceUrl?: string | null;
  title?: string | null;
  currentPrice?: number | null;
  originalPrice?: number | null;
  currency?: string | null;
  currentPriceProvenance?: string | null;
  originalPriceProvenance?: string | null;
  identitySignals?: unknown;
  discoveredAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Fail-closed: missing URL or non-positive sale price → null.
 * Declared original is passed as declaredOriginalPrice only — S8 scoring
 * will treat it untrusted unless provenance upgrades via adapters.
 */
export function opportunityCandidateFromHunterHandoff(
  handoff: HunterS8HandoffInput,
): OpportunityCandidate | null {
  const url = (handoff.sourceUrl ?? '').trim();
  if (!url) return null;
  const sale =
    typeof handoff.currentPrice === 'number' && Number.isFinite(handoff.currentPrice)
      ? handoff.currentPrice
      : null;
  if (sale === null || sale <= 0) return null;

  const declared =
    typeof handoff.originalPrice === 'number' && Number.isFinite(handoff.originalPrice)
      ? handoff.originalPrice
      : null;

  return {
    url,
    canonicalUrl: url,
    title: handoff.title ?? null,
    salePrice: sale,
    declaredOriginalPrice: declared,
    currency: handoff.currency ?? null,
    sourceId: handoff.candidateId ?? null,
    // Hunter-declared original is never listing_card / source_explicit here.
    cardDiscountSource: null,
    signals: null,
  };
}
