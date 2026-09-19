/**
 * S8 dry observation hook for S7 — shadow evaluation only.
 *
 * HOW S7 SHOULD CALL (without changing production ingest path):
 *
 * ```ts
 * import { observeOpportunityFromIngest } from '@/lib/supply/intelligence';
 *
 * // After normalizeMlWorkerListing / enrichParsedOfferMetadata,
 * // BEFORE insertIngestedOffer / machine pending write:
 * const intel = await observeOpportunityFromIngest({
 *   url: meta.canonicalUrl,
 *   meta,
 *   sourceId: 'ml_worker',
 * });
 * // Log intel.decision / intel.score.reasonCodes to bot_meta or RawObservation.payload.
 * // NEVER branch insert on intel alone — S6.1 evaluateMachineCandidateGate remains authority.
 * ```
 *
 * This module never writes offers.pending and never enables machine pending writes.
 */

import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  evaluateOpportunity,
  type EvaluateOpportunityOptions,
} from './evaluateOpportunity';
import type { OpportunityCandidate, OpportunityEvaluation } from './types';

export type ObserveOpportunityFromIngestInput = {
  url: string;
  meta: ParsedOfferMetadata;
  sourceId?: string | null;
  pdpBlocked?: boolean | null;
  options?: EvaluateOpportunityOptions;
};

export function candidateFromParsedMeta(
  input: ObserveOpportunityFromIngestInput,
): OpportunityCandidate {
  const meta = input.meta;
  return {
    url: input.url,
    canonicalUrl: meta.canonicalUrl,
    store: meta.store,
    title: meta.title,
    imageUrl: meta.imageUrl,
    salePrice: meta.discountPrice,
    declaredOriginalPrice: meta.originalPrice,
    declaredDiscountPercent: meta.discountPercent,
    currency: 'MXN',
    signals: meta.signals ?? null,
    cardDiscountSource: meta.signals?.cardDiscountSource ?? null,
    cardBadgePercent: meta.signals?.cardBadgePercent ?? null,
    pdpBlocked: input.pdpBlocked ?? null,
    sourceId: input.sourceId ?? null,
  };
}

/**
 * Shadow-only evaluation for S7 ingest pipeline. Always dry-run friendly.
 */
export async function observeOpportunityFromIngest(
  input: ObserveOpportunityFromIngestInput,
): Promise<OpportunityEvaluation> {
  return evaluateOpportunity(candidateFromParsedMeta(input), {
    ...input.options,
    skipAdapterFetch: input.options?.skipAdapterFetch ?? true,
    forceDryRun: true,
  });
}
