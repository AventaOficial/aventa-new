import type { SupabaseClient } from '@supabase/supabase-js';
import { isHunterCandidateIntelligenceEnabled } from './flags';
import type { HunterCandidateRecord, HunterIntelligenceRunSummary } from './types';

export const HUNTER_OFFER_CANDIDATES_TABLE = 'hunter_offer_candidates' as const;
export const HUNTER_INTELLIGENCE_RUNS_TABLE = 'hunter_intelligence_runs' as const;
export const HUNTER_CANDIDATE_LABELS_TABLE = 'hunter_candidate_human_labels' as const;

function toRow(record: HunterCandidateRecord): Record<string, unknown> {
  return {
    run_id: record.runId,
    candidate_key: record.candidateKey,
    source: record.source,
    retailer: record.retailer,
    source_url: record.sourceUrl,
    canonical_url: record.canonicalUrl,
    title: record.title,
    description: record.description,
    image_url: record.imageUrl,
    seller: record.seller,
    brand: record.brand,
    category: record.category,
    subcategory: record.subcategory,
    original_price: record.originalPrice,
    sale_price: record.salePrice,
    discount_percentage: record.discountPercentage,
    coupon: record.coupon,
    shipping_cost: record.shippingCost,
    currency: record.currency,
    availability: record.availability,
    seller_rating: record.sellerRating,
    product_rating: record.productRating,
    review_count: record.reviewCount,
    product_fingerprint: record.productFingerprint,
    duplicate_of: record.duplicateOf,
    duplicate_cluster_id: record.duplicateClusterId,
    hunter_score: record.hunterScore,
    score_breakdown: record.scoreBreakdown,
    score_explanation: record.scoreExplanation,
    dqe_qualification: record.dqeQualification,
    machine_quality_decision: record.machineQualityDecision,
    reason_codes: record.reasonCodes,
    decision: record.decision,
    reason_code: record.reasonCode,
    reason_detail: record.reasonDetail,
    rejection_stage: record.rejectionStage,
    evidence: record.evidence,
    raw_metadata: record.rawMetadata,
    negative_memory_level: record.negativeMemoryLevel,
    inserted_offer_id: record.insertedOfferId,
    affiliate_status: record.affiliateStatus,
    discovered_at: record.discoveredAt,
    last_seen_at: record.discoveredAt,
    hunter_version: record.hunterVersion,
    normalization_version: record.normalizationVersion,
    scoring_version: record.scoringVersion,
    decision_policy_version: record.decisionPolicyVersion,
    original_url: record.originalUrl ?? record.sourceUrl,
    affiliate_url: record.affiliateUrl ?? null,
    title_raw: record.titleRaw ?? record.title,
    title_normalized: record.titleNormalized ?? record.title,
    image_url_original: record.imageUrlOriginal ?? null,
    image_url_resolved: record.imageUrlResolved ?? record.imageUrl,
    image_validation_status: record.imageValidationStatus ?? null,
    image_validation_reason: record.imageValidationReason ?? null,
    product_identifier: record.productIdentifier ?? record.productFingerprint,
    url_diagnosis: record.urlDiagnosis ?? {},
    validation_errors: record.validationErrors ?? [],
    diversity_cut: record.diversityCut === true,
    negative_memory_match: record.negativeMemoryMatch ?? record.negativeMemoryLevel,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Upsert candidate rows. Fail-soft: missing table / RLS never breaks ingest mint path.
 */
export async function persistHunterCandidates(
  supabase: SupabaseClient | null | undefined,
  records: HunterCandidateRecord[],
  opts?: { allowInTests?: boolean },
): Promise<{ ok: boolean; written: number; error?: string }> {
  if (!isHunterCandidateIntelligenceEnabled() && !opts?.allowInTests) {
    return { ok: true, written: 0 };
  }
  if (!supabase || records.length === 0) return { ok: true, written: 0 };
  if (process.env.NODE_ENV === 'test' && !opts?.allowInTests) {
    return { ok: true, written: 0 };
  }

  const rows = records.map(toRow);
  const { error } = await supabase.from(HUNTER_OFFER_CANDIDATES_TABLE).upsert(rows, {
    onConflict: 'run_id,candidate_key',
  });
  if (error) {
    return { ok: false, written: 0, error: error.message };
  }
  return { ok: true, written: rows.length };
}

export async function persistHunterIntelligenceRun(
  supabase: SupabaseClient | null | undefined,
  summary: HunterIntelligenceRunSummary,
  opts?: { allowInTests?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (!isHunterCandidateIntelligenceEnabled() && !opts?.allowInTests) {
    return { ok: true };
  }
  if (!supabase) return { ok: true };
  if (process.env.NODE_ENV === 'test' && !opts?.allowInTests) {
    return { ok: true };
  }

  const { error } = await supabase.from(HUNTER_INTELLIGENCE_RUNS_TABLE).upsert(
    {
      run_id: summary.runId,
      started_at: summary.startedAt,
      finished_at: summary.finishedAt,
      mode: summary.mode,
      sources: summary.sources,
      retailers: summary.retailers,
      candidate_count: summary.candidateCount,
      normalized_count: summary.normalizedCount,
      duplicate_count: summary.duplicateCount,
      rejected_count: summary.rejectedCount,
      needs_review_count: summary.needsReviewCount,
      would_insert_count: summary.wouldInsertCount,
      inserted_pending_count: summary.insertedPendingCount,
      published_count: summary.publishedCount,
      rejection_breakdown: summary.rejectionBreakdown,
      decision_breakdown: summary.decisionBreakdown,
      score_distribution: summary.scoreDistribution,
      hunter_version: summary.hunterVersion,
      scoring_version: summary.scoringVersion,
      decision_policy_version: summary.decisionPolicyVersion,
    },
    { onConflict: 'run_id' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
