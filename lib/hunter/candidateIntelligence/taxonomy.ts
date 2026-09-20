/**
 * Decision taxonomy for Candidate Intelligence.
 * Reuses/extends supplyIntelligence dry-run outcomes without inventing ML states.
 */

export const HUNTER_CANDIDATE_DECISIONS = [
  'DISCOVERED',
  'NORMALIZED',
  'ENRICHED',
  'DUPLICATE',
  'REJECTED_LOW_VALUE',
  'REJECTED_PRICE',
  'REJECTED_DISCOUNT',
  'REJECTED_SELLER',
  'REJECTED_PRODUCT',
  'REJECTED_SOURCE',
  'REJECTED_EXPIRED',
  'REJECTED_UNAVAILABLE',
  'REJECTED_NOT_MONETIZABLE',
  'REJECTED_NEGATIVE_MEMORY',
  'REJECTED_POLICY',
  'REJECTED_BUDGET',
  'REJECTED_IMAGE',
  'REJECTED_DIVERSITY',
  'REJECTED_IDENTITY',
  'REJECTED_URL',
  'REJECTED_DQE',
  'REJECTED_SCORE',
  'REJECTED_WRITE_GATE',
  'NEEDS_REVIEW',
  'WATCHLIST',
  'WOULD_INSERT',
  'INSERTED_PENDING',
  'PUBLISHED',
  'FAILED',
] as const;

export type HunterCandidateDecision = (typeof HUNTER_CANDIDATE_DECISIONS)[number];

export const HUNTER_REJECTION_STAGES = [
  'discovery',
  'normalize',
  'enrich',
  'validate',
  'qualify',
  'score',
  'policy',
  'negative_memory',
  'dedup',
  'budget',
  'write',
  'publish',
  'unknown',
] as const;

export type HunterRejectionStage = (typeof HUNTER_REJECTION_STAGES)[number];

export type Disposition = {
  decision: HunterCandidateDecision;
  reasonCode: string;
  reasonDetail: string | null;
  stage: HunterRejectionStage;
};

/**
 * Map free-form skip/insert reasons from ingest into stable taxonomy.
 * Deterministic; does not invent evidence.
 */
export function classifyIngestDisposition(input: {
  status: 'skipped' | 'inserted' | 'duplicate' | 'error' | 'would_insert' | 'resolved';
  reason?: string | null;
  scoreDecision?: 'auto_approve' | 'pending' | 'reject' | null;
  machineEligible?: boolean | null;
}): Disposition {
  const reason = (input.reason ?? '').trim();
  const lower = reason.toLowerCase();

  if (input.status === 'inserted') {
    return {
      decision: 'INSERTED_PENDING',
      reasonCode: 'inserted_pending',
      reasonDetail: reason || 'minted pending for human moderation',
      stage: 'write',
    };
  }
  if (input.status === 'duplicate' || lower.includes('duplicad')) {
    return {
      decision: 'DUPLICATE',
      reasonCode: 'duplicate',
      reasonDetail: reason || null,
      stage: 'dedup',
    };
  }
  if (input.status === 'error') {
    return {
      decision: 'FAILED',
      reasonCode: 'error',
      reasonDetail: reason || null,
      stage: 'unknown',
    };
  }
  if (input.status === 'would_insert') {
    return {
      decision: 'WOULD_INSERT',
      reasonCode: 'would_insert_observation',
      reasonDetail: reason || 'eligible under gates; mint not executed (observation)',
      stage: 'write',
    };
  }

  if (lower.startsWith('negative_memory:') || lower.includes('negative_memory')) {
    return {
      decision: 'REJECTED_NEGATIVE_MEMORY',
      reasonCode: reason.slice(0, 120) || 'negative_memory',
      reasonDetail: reason || null,
      stage: 'negative_memory',
    };
  }
  if (lower.includes('machine_pending_writes') || lower.includes('writes_disabled')) {
    return {
      decision: 'REJECTED_WRITE_GATE',
      reasonCode: 'writes_disabled',
      reasonDetail: reason || null,
      stage: 'write',
    };
  }
  if (lower.includes('diversity') || lower.includes('shortlist_cut')) {
    return {
      decision: 'REJECTED_DIVERSITY',
      reasonCode: 'diversity_cut',
      reasonDetail: reason || null,
      stage: 'budget',
    };
  }
  if (lower.includes('identity') || lower.includes('payload inválido') || lower.includes('payload invalido')) {
    return {
      decision: 'REJECTED_IDENTITY',
      reasonCode: 'identity_invalid',
      reasonDetail: reason || null,
      stage: 'normalize',
    };
  }
  if (lower.includes('imagen') || lower.includes('image')) {
    return {
      decision: 'REJECTED_IMAGE',
      reasonCode: 'image_invalid',
      reasonDetail: reason || null,
      stage: 'validate',
    };
  }
  if (lower.includes('dqe') || lower.includes('deal_quality')) {
    return {
      decision: 'REJECTED_DQE',
      reasonCode: 'dqe_reject',
      reasonDetail: reason || null,
      stage: 'qualify',
    };
  }
  if (lower.includes('dryrun') || lower.includes('dry_run') || lower.includes('dry-run')) {
    return {
      decision: 'WOULD_INSERT',
      reasonCode: 'dry_run_simulated',
      reasonDetail: reason || null,
      stage: 'write',
    };
  }
  if (lower.includes('budget') || lower.includes('daily') || lower.includes('tope') || lower.includes('pool_truncated') || lower.includes('candidate_pool')) {
    return {
      decision: 'REJECTED_BUDGET',
      reasonCode: 'budget',
      reasonDetail: reason || null,
      stage: 'budget',
    };
  }
  if (lower.includes('s61_gate') || lower.includes('policy') || lower.includes('provenance')) {
    return {
      decision: 'REJECTED_POLICY',
      reasonCode: reason.slice(0, 120) || 'policy',
      reasonDetail: reason || null,
      stage: 'policy',
    };
  }
  if (lower.includes('descuento') || lower.includes('discount')) {
    return {
      decision: 'REJECTED_DISCOUNT',
      reasonCode: 'discount_out_of_range',
      reasonDetail: reason || null,
      stage: 'validate',
    };
  }
  if (
    lower.includes('precio') ||
    lower.includes('price') ||
    lower.includes('original') ||
    lower.includes('artificial')
  ) {
    return {
      decision: 'REJECTED_PRICE',
      reasonCode: 'price_invalid',
      reasonDetail: reason || null,
      stage: 'validate',
    };
  }
  if (lower.includes('título') || lower.includes('titulo') || lower.includes('title')) {
    return {
      decision: 'REJECTED_PRODUCT',
      reasonCode: 'title_quality',
      reasonDetail: reason || null,
      stage: 'validate',
    };
  }
  if (lower.includes('url') || lower.includes('payload') || lower.includes('metadatos')) {
    return {
      decision: 'REJECTED_SOURCE',
      reasonCode: 'source_invalid',
      reasonDetail: reason || null,
      stage: lower.includes('metadatos') ? 'enrich' : 'normalize',
    };
  }
  if (input.scoreDecision === 'reject' || lower.includes('score') || lower.includes('reject')) {
    return {
      decision: 'REJECTED_SCORE',
      reasonCode: 'score_reject',
      reasonDetail: reason || null,
      stage: 'score',
    };
  }
  if (input.scoreDecision === 'pending' || input.machineEligible === true) {
    return {
      decision: 'NEEDS_REVIEW',
      reasonCode: 'needs_review',
      reasonDetail: reason || 'passed gates for human review / shortlist',
      stage: 'score',
    };
  }
  if (input.scoreDecision === 'auto_approve') {
    return {
      decision: 'NEEDS_REVIEW',
      reasonCode: 'score_auto_approve_pending_only',
      reasonDetail: reason || 'scoring suggested auto_approve; mint remains pending-only',
      stage: 'score',
    };
  }

  return {
    decision: 'REJECTED_POLICY',
    reasonCode: reason.slice(0, 80) || 'skipped',
    reasonDetail: reason || null,
    stage: 'unknown',
  };
}
