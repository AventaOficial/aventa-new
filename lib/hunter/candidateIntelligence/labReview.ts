/**
 * Hunter Lab Production Review — pure helpers (client-safe).
 * Never publishes. Never mutates hunter decisions.
 * DB queries live in labReviewQuery.ts (server-only).
 */

import { classifyLabelOutcome, type HunterHumanDecision } from './humanLabels';

/** Minimum labels before FN RATE (derived) is shown. */
export const LAB_FN_RATE_MIN_REVIEWED = 20;
/** Alternate sufficiency: enough explicit FP+FN labels. */
export const LAB_FN_RATE_MIN_FP_FN = 5;

export const LAB_PRIMARY_LABELS = {
  GOOD: 'GOOD_DEAL',
  BAD: 'BAD_DEAL',
  UNCERTAIN: 'UNCERTAIN',
  FALSE_NEGATIVE: 'FALSE_NEGATIVE',
} as const satisfies Record<string, HunterHumanDecision>;

export const LAB_GOOD_DECISIONS = new Set<string>(['GOOD_DEAL', 'GREAT_DEAL', 'PUBLISH']);
export const LAB_BAD_DECISIONS = new Set<string>([
  'BAD_DEAL',
  'REJECT',
  'FALSE_DEAL',
  'LOW_VALUE',
  'PRICE_ERROR',
  'BAD_PRICE',
  'BAD_DISCOUNT',
  'WRONG_IMAGE',
  'BROKEN_LINK',
]);
export const LAB_UNCERTAIN_DECISIONS = new Set<string>(['UNCERTAIN', 'REVIEW', 'WATCH']);

export type LabMetricKind = 'FACT' | 'LABEL' | 'DERIVED';

export type LabPipelineStageName =
  | 'DISCOVERY'
  | 'IDENTITY'
  | 'NORMALIZATION'
  | 'ENRICHMENT'
  | 'VALIDATION'
  | 'SCORE'
  | 'TOP_K_DIVERSITY'
  | 'S9'
  | 'DECISION';

export type LabStageStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'N/D';

export type LabPipelineStage = {
  stage: LabPipelineStageName;
  status: LabStageStatus;
  reason: string | null;
};

export type LabCandidateRow = {
  id: string;
  run_id: string;
  candidate_key?: string | null;
  source: string;
  retailer: string | null;
  title: string | null;
  description?: string | null;
  canonical_url: string;
  source_url?: string | null;
  original_url?: string | null;
  image_url: string | null;
  sale_price: number | null;
  original_price: number | null;
  discount_percentage: number | null;
  product_rating?: number | null;
  review_count?: number | null;
  seller?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  hunter_score: number | null;
  decision: string;
  reason_code: string;
  reason_detail: string | null;
  rejection_stage: string;
  score_explanation: Array<{ signal: string; points: number }> | null;
  score_breakdown?: Record<string, unknown> | null;
  image_validation_status: string | null;
  image_validation_reason?: string | null;
  diversity_cut: boolean | null;
  negative_memory_level: string | null;
  negative_memory_match?: string | null;
  product_fingerprint?: string | null;
  product_identifier?: string | null;
  url_diagnosis?: Record<string, unknown> | null;
  validation_errors?: string[] | null;
  evidence?: Record<string, unknown> | null;
  discovered_at: string;
  human_label?: string | null;
  human_reviewed_at?: string | null;
  label_outcome?: string | null;
};

export type LabListFilters = {
  runId: string;
  source?: string | null;
  retailer?: string | null;
  decision?: string | null;
  reasonCode?: string | null;
  stage?: string | null;
  scoreMin?: number | null;
  scoreMax?: number | null;
  humanLabel?: string | null;
  reviewed?: 'reviewed' | 'unreviewed' | 'all';
  titleSearch?: string | null;
  missedOpportunities?: boolean;
  page?: number;
  pageSize?: number;
};

export type LabLabelCounters = {
  total: number;
  reviewed: number;
  pending: number;
  buenas: number;
  malas: number;
  duda: number;
  falseNegative: number;
  falsePositive: number;
  fnRate: number | null;
  fnRateDisplay: string;
  fnRateNote: string;
};

export type LabReconciliation = {
  discovered: number;
  persisted: number;
  decisionTotals: Record<string, number>;
  decisionSum: number;
  gapDiscoveredPersisted: number;
  gapSilentDrops: number;
  silentDropsOk: boolean;
  hasGap: boolean;
  kind: LabMetricKind;
};

export type LabMetricsPrep = {
  discovery: { value: number | null; kind: LabMetricKind };
  persisted: { value: number; kind: LabMetricKind };
  wouldInsert: { value: number; kind: LabMetricKind };
  rejected: { value: number; kind: LabMetricKind };
  needsReview: { value: number; kind: LabMetricKind };
  humanGood: { value: number; kind: LabMetricKind };
  humanBad: { value: number; kind: LabMetricKind };
  humanFn: { value: number; kind: LabMetricKind };
  humanFp: { value: number; kind: LabMetricKind };
  precisionApprox: { value: number | null; display: string; kind: LabMetricKind };
  coverage: { value: number | null; display: string; kind: LabMetricKind };
  scoreDistribution: { value: Record<string, number>; kind: LabMetricKind };
  decisionDistribution: { value: Record<string, number>; kind: LabMetricKind };
};

export const LAB_CANDIDATE_SELECT = [
  'id',
  'run_id',
  'candidate_key',
  'source',
  'retailer',
  'title',
  'description',
  'canonical_url',
  'source_url',
  'original_url',
  'image_url',
  'sale_price',
  'original_price',
  'discount_percentage',
  'product_rating',
  'review_count',
  'seller',
  'brand',
  'category',
  'subcategory',
  'hunter_score',
  'decision',
  'reason_code',
  'reason_detail',
  'rejection_stage',
  'score_explanation',
  'score_breakdown',
  'image_validation_status',
  'image_validation_reason',
  'diversity_cut',
  'negative_memory_level',
  'negative_memory_match',
  'product_fingerprint',
  'product_identifier',
  'url_diagnosis',
  'validation_errors',
  'evidence',
  'discovered_at',
].join(',');

export function displayOrNd(value: unknown): string {
  if (value == null) return 'N/D';
  if (typeof value === 'string' && value.trim() === '') return 'N/D';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'N/D';
  return String(value);
}

export function parseLabListFilters(searchParams: URLSearchParams): LabListFilters | null {
  const runId = searchParams.get('run_id')?.trim() || '';
  if (!runId) return null;

  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') ?? 50) || 50));
  const scoreMinRaw = searchParams.get('score_min');
  const scoreMaxRaw = searchParams.get('score_max');
  const reviewedRaw = searchParams.get('reviewed')?.trim() || '';
  const unreviewedOnly = searchParams.get('unreviewed_only') === '1' || searchParams.get('unreviewed_only') === 'true';

  let reviewed: LabListFilters['reviewed'] = 'all';
  if (unreviewedOnly || reviewedRaw === 'unreviewed') reviewed = 'unreviewed';
  else if (reviewedRaw === 'reviewed') reviewed = 'reviewed';

  return {
    runId,
    source: searchParams.get('source')?.trim() || null,
    retailer: searchParams.get('retailer')?.trim() || null,
    decision: searchParams.get('decision')?.trim() || null,
    reasonCode: searchParams.get('reason_code')?.trim() || null,
    stage: searchParams.get('stage')?.trim() || null,
    scoreMin: scoreMinRaw != null && scoreMinRaw !== '' ? Number(scoreMinRaw) : null,
    scoreMax: scoreMaxRaw != null && scoreMaxRaw !== '' ? Number(scoreMaxRaw) : null,
    humanLabel: searchParams.get('human_label')?.trim() || null,
    reviewed,
    titleSearch: searchParams.get('q')?.trim() || searchParams.get('title')?.trim() || null,
    missedOpportunities:
      searchParams.get('missed') === '1' || searchParams.get('view') === 'missed_opportunities',
    page,
    pageSize,
  };
}

/** Latest label per candidate (append-only table). */
export function latestLabelsByCandidate(
  rows: Array<{
    candidate_id: string;
    human_decision: string;
    reviewed_at: string;
    hunter_decision?: string | null;
  }>,
): Map<
  string,
  {
    human_decision: string;
    reviewed_at: string;
    hunter_decision?: string | null;
    outcome: ReturnType<typeof classifyLabelOutcome>;
  }
> {
  const map = new Map<
    string,
    {
      human_decision: string;
      reviewed_at: string;
      hunter_decision?: string | null;
      outcome: ReturnType<typeof classifyLabelOutcome>;
    }
  >();
  for (const row of rows) {
    const prev = map.get(row.candidate_id);
    if (prev && prev.reviewed_at >= row.reviewed_at) continue;
    const hunterDecision = row.hunter_decision ?? 'UNKNOWN';
    map.set(row.candidate_id, {
      human_decision: row.human_decision,
      reviewed_at: row.reviewed_at,
      hunter_decision: row.hunter_decision,
      outcome: classifyLabelOutcome({
        hunterDecision,
        humanDecision: row.human_decision as HunterHumanDecision,
      }),
    });
  }
  return map;
}

export function computeLabLabelCounters(input: {
  total: number;
  latestByCandidate: Map<string, { human_decision: string; outcome: string }>;
}): LabLabelCounters {
  let buenas = 0;
  let malas = 0;
  let duda = 0;
  let falseNegative = 0;
  let falsePositive = 0;

  for (const label of input.latestByCandidate.values()) {
    if (LAB_GOOD_DECISIONS.has(label.human_decision)) buenas += 1;
    else if (LAB_BAD_DECISIONS.has(label.human_decision)) malas += 1;
    else if (LAB_UNCERTAIN_DECISIONS.has(label.human_decision)) duda += 1;

    // Explicit FN/FP buttons take precedence; otherwise use derived outcome.
    if (label.human_decision === 'FALSE_NEGATIVE' || label.outcome === 'false_negative') {
      falseNegative += 1;
    } else if (label.human_decision === 'FALSE_POSITIVE' || label.outcome === 'false_positive') {
      falsePositive += 1;
    }
  }

  const reviewed = input.latestByCandidate.size;
  const pending = Math.max(0, input.total - reviewed);
  const denom = falseNegative + falsePositive;
  const sufficient =
    reviewed >= LAB_FN_RATE_MIN_REVIEWED || denom >= LAB_FN_RATE_MIN_FP_FN;
  const fnRate = sufficient && denom > 0 ? falseNegative / denom : null;

  return {
    total: input.total,
    reviewed,
    pending,
    buenas,
    malas,
    duda,
    falseNegative,
    falsePositive,
    fnRate,
    fnRateDisplay:
      fnRate == null
        ? 'N/D — insuficientes labels'
        : `${Math.round(fnRate * 1000) / 10}%`,
    fnRateNote: `DERIVED: FN/(FN+FP). Visible si revisadas≥${LAB_FN_RATE_MIN_REVIEWED} o (FN+FP)≥${LAB_FN_RATE_MIN_FP_FN}.`,
  };
}

export function computeLabReconciliation(input: {
  run: {
    candidate_count?: number | null;
    decision_breakdown?: Record<string, number> | null;
  } | null;
  persistedCount: number;
}): LabReconciliation {
  const decisionTotals = { ...(input.run?.decision_breakdown ?? {}) };
  const decisionSum = Object.values(decisionTotals).reduce((a, b) => a + b, 0);
  const discovered = input.run?.candidate_count ?? decisionSum;
  // Same contract as assertZeroSilentDrops: discovered must equal sum(decision_breakdown).
  const gapSilentDrops = discovered - decisionSum;
  const silentDropsOk = gapSilentDrops === 0;
  const gapDiscoveredPersisted = discovered - input.persistedCount;
  const hasGap = gapDiscoveredPersisted !== 0 || !silentDropsOk;

  return {
    discovered,
    persisted: input.persistedCount,
    decisionTotals,
    decisionSum,
    gapDiscoveredPersisted,
    gapSilentDrops,
    silentDropsOk,
    hasGap,
    kind: 'FACT',
  };
}

export function computeLabMetricsPrep(input: {
  recon: LabReconciliation;
  counters: LabLabelCounters;
  run: {
    would_insert_count?: number | null;
    rejected_count?: number | null;
    needs_review_count?: number | null;
    score_distribution?: Record<string, number> | null;
    decision_breakdown?: Record<string, number> | null;
    candidate_count?: number | null;
  } | null;
}): LabMetricsPrep {
  const wouldInsert =
    input.run?.would_insert_count ??
    input.recon.decisionTotals['WOULD_INSERT'] ??
    0;
  const rejected =
    input.run?.rejected_count ??
    Object.entries(input.recon.decisionTotals)
      .filter(([k]) => k.startsWith('REJECTED_') || k === 'FAILED')
      .reduce((a, [, n]) => a + n, 0);
  const needsReview =
    input.run?.needs_review_count ??
    (input.recon.decisionTotals['NEEDS_REVIEW'] ?? 0) +
      (input.recon.decisionTotals['WATCHLIST'] ?? 0);

  const goodPlusBad = input.counters.buenas + input.counters.malas;
  const precision =
    goodPlusBad > 0 ? input.counters.buenas / goodPlusBad : null;
  const coverage =
    input.counters.total > 0 ? input.counters.reviewed / input.counters.total : null;

  return {
    discovery: { value: input.recon.discovered, kind: 'FACT' },
    persisted: { value: input.recon.persisted, kind: 'FACT' },
    wouldInsert: { value: wouldInsert, kind: 'FACT' },
    rejected: { value: rejected, kind: 'FACT' },
    needsReview: { value: needsReview, kind: 'FACT' },
    humanGood: { value: input.counters.buenas, kind: 'LABEL' },
    humanBad: { value: input.counters.malas, kind: 'LABEL' },
    humanFn: { value: input.counters.falseNegative, kind: 'LABEL' },
    humanFp: { value: input.counters.falsePositive, kind: 'LABEL' },
    precisionApprox: {
      value: precision,
      display: precision == null ? 'N/D' : `${Math.round(precision * 1000) / 10}%`,
      kind: 'DERIVED',
    },
    coverage: {
      value: coverage,
      display: coverage == null ? 'N/D' : `${Math.round(coverage * 1000) / 10}%`,
      kind: 'DERIVED',
    },
    scoreDistribution: {
      value: { ...(input.run?.score_distribution ?? {}) },
      kind: 'FACT',
    },
    decisionDistribution: {
      value: { ...(input.run?.decision_breakdown ?? input.recon.decisionTotals) },
      kind: 'FACT',
    },
  };
}

/**
 * Best-effort pipeline from persisted fields only.
 * Unknown stages → SKIPPED / N/D — never invent PASS/FAIL.
 */
export function derivePipelineStages(c: LabCandidateRow): LabPipelineStage[] {
  const decision = c.decision ?? '';
  const stage = (c.rejection_stage ?? '').toLowerCase();
  const reason = c.reason_code || c.reason_detail || null;
  const rejected = decision.startsWith('REJECTED_') || decision === 'FAILED';

  const discovery: LabPipelineStage = {
    stage: 'DISCOVERY',
    status: 'PASS',
    reason: 'candidato persistido',
  };

  let identity: LabPipelineStage;
  if (decision === 'REJECTED_IDENTITY' || stage === 'identity') {
    identity = { stage: 'IDENTITY', status: 'FAIL', reason };
  } else if (c.product_fingerprint || c.product_identifier) {
    identity = {
      stage: 'IDENTITY',
      status: 'PASS',
      reason: c.product_identifier || c.product_fingerprint || null,
    };
  } else {
    identity = { stage: 'IDENTITY', status: 'N/D', reason: null };
  }

  let normalization: LabPipelineStage;
  if (stage === 'normalize' && rejected) {
    normalization = { stage: 'NORMALIZATION', status: 'FAIL', reason };
  } else if (c.title || c.sale_price != null) {
    normalization = { stage: 'NORMALIZATION', status: 'PASS', reason: null };
  } else {
    normalization = { stage: 'NORMALIZATION', status: 'N/D', reason: null };
  }

  let enrichment: LabPipelineStage;
  if (stage === 'enrich' && rejected) {
    enrichment = { stage: 'ENRICHMENT', status: 'FAIL', reason };
  } else if (c.image_url || c.brand || c.category || c.product_rating != null) {
    enrichment = { stage: 'ENRICHMENT', status: 'PASS', reason: null };
  } else {
    enrichment = { stage: 'ENRICHMENT', status: 'N/D', reason: null };
  }

  let validation: LabPipelineStage;
  if (
    decision === 'REJECTED_IMAGE' ||
    decision === 'REJECTED_URL' ||
    stage === 'validate' ||
    (Array.isArray(c.validation_errors) && c.validation_errors.length > 0)
  ) {
    const imgFail =
      c.image_validation_status &&
      c.image_validation_status !== 'ok' &&
      c.image_validation_status !== 'valid';
    validation = {
      stage: 'VALIDATION',
      status: rejected || imgFail ? 'FAIL' : 'N/D',
      reason:
        c.image_validation_reason ||
        (Array.isArray(c.validation_errors) ? c.validation_errors.join(', ') : null) ||
        reason,
    };
  } else if (c.image_validation_status === 'ok' || c.image_validation_status === 'valid') {
    validation = { stage: 'VALIDATION', status: 'PASS', reason: c.image_validation_status };
  } else if (c.image_validation_status) {
    validation = {
      stage: 'VALIDATION',
      status: 'FAIL',
      reason: c.image_validation_reason || c.image_validation_status,
    };
  } else {
    validation = { stage: 'VALIDATION', status: 'N/D', reason: null };
  }

  let score: LabPipelineStage;
  if (decision === 'REJECTED_SCORE' || stage === 'score') {
    score = { stage: 'SCORE', status: 'FAIL', reason };
  } else if (c.hunter_score != null) {
    score = {
      stage: 'SCORE',
      status: 'PASS',
      reason: `score=${c.hunter_score}`,
    };
  } else {
    score = { stage: 'SCORE', status: 'N/D', reason: null };
  }

  let diversity: LabPipelineStage;
  if (decision === 'REJECTED_DIVERSITY' || c.diversity_cut === true) {
    diversity = {
      stage: 'TOP_K_DIVERSITY',
      status: 'FAIL',
      reason: c.diversity_cut === true ? 'diversity_cut' : reason,
    };
  } else if (c.diversity_cut === false) {
    diversity = { stage: 'TOP_K_DIVERSITY', status: 'PASS', reason: 'not cut' };
  } else {
    diversity = { stage: 'TOP_K_DIVERSITY', status: 'SKIPPED', reason: null };
  }

  let s9: LabPipelineStage;
  const evidence = c.evidence ?? {};
  const s9Hint =
    typeof evidence === 'object' &&
    evidence != null &&
    ('s9' in evidence || 's9_gate' in evidence || 'write_gate' in evidence);
  if (decision === 'REJECTED_WRITE_GATE' || stage === 'write' || stage === 'budget') {
    s9 = { stage: 'S9', status: 'FAIL', reason };
  } else if (s9Hint) {
    s9 = { stage: 'S9', status: 'N/D', reason: 'evidence presente; estado no determinístico' };
  } else {
    s9 = { stage: 'S9', status: 'SKIPPED', reason: null };
  }

  let decisionStage: LabPipelineStage;
  if (!decision) {
    decisionStage = { stage: 'DECISION', status: 'N/D', reason: null };
  } else if (
    decision === 'WOULD_INSERT' ||
    decision === 'INSERTED_PENDING' ||
    decision === 'PUBLISHED' ||
    decision === 'NEEDS_REVIEW' ||
    decision === 'WATCHLIST'
  ) {
    decisionStage = { stage: 'DECISION', status: 'PASS', reason: decision };
  } else if (rejected || decision === 'DUPLICATE') {
    decisionStage = { stage: 'DECISION', status: 'FAIL', reason: `${decision} / ${c.reason_code}` };
  } else {
    decisionStage = { stage: 'DECISION', status: 'N/D', reason: decision };
  }

  return [
    discovery,
    identity,
    normalization,
    enrichment,
    validation,
    score,
    diversity,
    s9,
    decisionStage,
  ];
}
