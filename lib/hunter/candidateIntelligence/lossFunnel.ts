/**
 * Opportunity loss accounting — reconciliable funnel.
 * Every candidate maps to exactly one terminal loss/pass bucket.
 * Observation only. Does not change gates.
 */

import type { DiscountClass } from './discountClass';
import { deriveFunnelDecision, type FunnelStageName } from './discountAudit';

/** Explicit loss / pass buckets — never collapse into generic "rejected". */
export const LOSS_BUCKETS = [
  'DISCOVERED',
  'IDENTITY_VALID',
  'IDENTITY_FAILURE',
  'PRODUCT_VALID',
  'DISCOUNT_KNOWN',
  'DISCOUNT_UNKNOWN',
  'DISCOUNT_PASS',
  'DISCOUNT_FAIL_REAL_LOW',
  'DISCOUNT_FAIL_FALSE_ZERO_CORRECTED',
  'PRICE_VALID',
  'PRICE_INVALID',
  'QUALITY_PASS',
  'QUALITY_REJECTED',
  'SCORE',
  'TOPK_CUT',
  'BUDGET_CUT',
  'DIVERSITY_CUT',
  'DUPLICATE',
  'NEGATIVE_MEMORY',
  'SOURCE_FAILURE',
  'WOULD_INSERT',
  'INSERT_ATTEMPT',
  'INSERTED',
  'OTHER',
] as const;

export type LossBucket = (typeof LOSS_BUCKETS)[number];

export type LossFunnelRow = {
  decision: string;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  rejectionStage?: string | null;
  discountClass?: string | null;
  discountPercentage?: number | null;
  funnelStage?: string | null;
  wouldTopkCut?: boolean | null;
  wouldDiversityCut?: boolean | null;
  diversityCut?: boolean | null;
  negativeMemoryLevel?: string | null;
  priceEvidence?: Record<string, unknown> | null;
  hunterScore?: number | null;
  humanLabel?: string | null;
  labelOutcome?: string | null;
};

export type LossBucketStat = {
  bucket: LossBucket;
  count: number;
  percentage: number | null;
  reasonCodes: Record<string, number>;
};

export type LossFunnelReport = {
  total: number;
  /** Ordered funnel stages with cumulative surviving + losses at each hop. */
  stages: Array<{
    stage: FunnelStageName | 'IDENTITY' | 'PRICE' | 'QUALITY' | 'NEGATIVE_MEMORY' | 'INSERT';
    entered: number;
    survived: number;
    lost: number;
    lossPercentage: number | null;
    buckets: LossBucketStat[];
  }>;
  terminalBuckets: LossBucketStat[];
  /** Explicit Mission-5 separations. */
  separated: {
    REAL_LOW_DISCOUNT: number;
    UNKNOWN_DISCOUNT: number;
    FALSE_ZERO_CORRECTED: number;
    PRICE_INVALID: number;
    QUALITY_REJECTED: number;
    TOPK_CUT: number;
    BUDGET_CUT: number;
    DIVERSITY_CUT: number;
    DUPLICATE: number;
    NEGATIVE_MEMORY: number;
    SOURCE_FAILURE: number;
    IDENTITY_FAILURE: number;
    WOULD_INSERT: number;
    INSERTED: number;
  };
  humanGroundTruth: {
    labeled: number;
    goodAmongRejected: number;
    badAmongRejected: number;
    uncertainAmongRejected: number;
    falseNegative: number;
    falsePositive: number;
    unknownDiscountLabeled: number;
    falseZeroCorrectedLabeled: number;
  };
  reconciliation: {
    terminalSum: number;
    matchesTotal: boolean;
    gap: number;
  };
  /**
   * Full requested pipeline. stage=UNKNOWN when evidence insufficient for that hop.
   * Never invents counts — uses terminal classification + known stage annotations.
   */
  completePipeline: Array<{
    stage:
      | 'DISCOVERED'
      | 'IDENTITY_VALID'
      | 'PRODUCT_VALID'
      | 'DISCOUNT_CLASSIFIED'
      | 'DISCOUNT_PASS'
      | 'SCORE_VALID'
      | 'TOP_K'
      | 'DIVERSITY'
      | 'NEGATIVE_MEMORY'
      | 'WOULD_INSERT'
      | 'MINT_ATTEMPT';
    status: 'OK' | 'UNKNOWN';
    reason_code: string;
    candidate_count: number;
    candidate_rate: number | null;
    previous_stage_count: number | null;
    evidence_source: string;
    why_unknown?: string;
  }>;
};

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function pct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

function isFalseZeroCorrected(row: LossFunnelRow): boolean {
  const pe = row.priceEvidence;
  if (!pe || typeof pe !== 'object') return false;
  if (pe.falseZero === true || pe.backfill === 'false_zero_correction_v1') return true;
  const status = pe.calculationStatus;
  const supplied = pe.suppliedDiscountPercentage;
  const computed = pe.computedDiscountPercentage;
  return (
    status === 'conflict' &&
    (supplied === 0 || supplied === null) &&
    typeof computed === 'number' &&
    computed >= 25
  );
}

/**
 * Map one candidate to exactly one terminal loss/pass bucket.
 */
export function classifyLossBucket(row: LossFunnelRow): LossBucket {
  const d = row.decision || '';
  const reason = `${row.reasonCode ?? ''} ${row.reasonDetail ?? ''}`.toLowerCase();
  const stage = (row.funnelStage || '').toUpperCase();
  const cls = row.discountClass || '';

  if (d === 'INSERTED_PENDING' || d === 'PUBLISHED') return 'INSERTED';
  if (d === 'WOULD_INSERT') return 'WOULD_INSERT';
  if (d === 'DUPLICATE' || reason.includes('duplic')) return 'DUPLICATE';

  if (
    row.negativeMemoryLevel === 'SUPPRESS' ||
    d === 'REJECTED_NEGATIVE_MEMORY' ||
    reason.includes('negative_memory') ||
    reason.includes('nm_')
  ) {
    return 'NEGATIVE_MEMORY';
  }

  if (
    row.wouldDiversityCut === true ||
    row.diversityCut === true ||
    d === 'REJECTED_DIVERSITY' ||
    stage === 'DIVERSITY' ||
    reason.includes('diversity')
  ) {
    return 'DIVERSITY_CUT';
  }

  if (
    row.wouldTopkCut === true ||
    d === 'REJECTED_BUDGET' ||
    stage === 'TOP_K' ||
    reason.includes('topk') ||
    reason.includes('top_k') ||
    reason.includes('score_shortlist') ||
    reason.includes('candidate_pool_truncated') ||
    reason.includes('budget')
  ) {
    if (reason.includes('pool') || reason.includes('budget') || d === 'REJECTED_BUDGET') {
      return reason.includes('pool') || reason.includes('candidate_pool')
        ? 'BUDGET_CUT'
        : reason.includes('budget')
          ? 'BUDGET_CUT'
          : 'TOPK_CUT';
    }
    return 'TOPK_CUT';
  }

  if (
    d === 'FAILED' ||
    reason.includes('403') ||
    reason.includes('source_fail') ||
    reason.includes('http') ||
    reason.includes('timeout') ||
    reason.includes('worker payload')
  ) {
    return 'SOURCE_FAILURE';
  }

  if (
    d === 'REJECTED_IDENTITY' ||
    reason.includes('identity') ||
    reason.includes('fingerprint') ||
    reason.includes('url invál') ||
    reason.includes('url vac')
  ) {
    return 'IDENTITY_FAILURE';
  }

  if (
    d === 'REJECTED_PRICE' ||
    reason.includes('precio original') ||
    reason.includes('precio actual') ||
    reason.includes('sin precio')
  ) {
    return 'PRICE_INVALID';
  }

  if (isFalseZeroCorrected(row)) {
    // Still may have been rejected for other reasons after correction — if terminal discount reject:
    if (d === 'REJECTED_DISCOUNT' || stage === 'DISCOUNT_CLASSIFICATION') {
      return 'DISCOUNT_FAIL_FALSE_ZERO_CORRECTED';
    }
  }

  if (
    d === 'REJECTED_DISCOUNT' ||
    stage === 'DISCOUNT_CLASSIFICATION' ||
    reason.includes('descuento') ||
    reason.includes('discount')
  ) {
    if (cls === 'DISCOUNT_UNKNOWN' || cls === 'DISCOUNT_MISSING_PRICE' || row.discountPercentage == null) {
      return 'DISCOUNT_UNKNOWN';
    }
    if (cls === 'DISCOUNT_REAL_LOW' || (typeof row.discountPercentage === 'number' && row.discountPercentage > 0 && row.discountPercentage < 25)) {
      return 'DISCOUNT_FAIL_REAL_LOW';
    }
    if (isFalseZeroCorrected(row)) return 'DISCOUNT_FAIL_FALSE_ZERO_CORRECTED';
    return 'DISCOUNT_FAIL_REAL_LOW';
  }

  if (
    d === 'REJECTED_QUALITY' ||
    d === 'REJECTED_DQE' ||
    d === 'REJECTED_LOW_VALUE' ||
    reason.includes('título') ||
    reason.includes('calidad') ||
    reason.includes('quality') ||
    reason.includes('imagen')
  ) {
    return 'QUALITY_REJECTED';
  }

  if (d === 'REJECTED_SCORE' || d === 'NEEDS_REVIEW' || d === 'WATCHLIST' || stage === 'SCORE') {
    return 'SCORE';
  }

  if (d.startsWith('REJECTED_') || d === 'DISCOVERED') {
    return d === 'DISCOVERED' ? 'DISCOVERED' : 'OTHER';
  }

  return 'OTHER';
}

function emptySeparated(): LossFunnelReport['separated'] {
  return {
    REAL_LOW_DISCOUNT: 0,
    UNKNOWN_DISCOUNT: 0,
    FALSE_ZERO_CORRECTED: 0,
    PRICE_INVALID: 0,
    QUALITY_REJECTED: 0,
    TOPK_CUT: 0,
    BUDGET_CUT: 0,
    DIVERSITY_CUT: 0,
    DUPLICATE: 0,
    NEGATIVE_MEMORY: 0,
    SOURCE_FAILURE: 0,
    IDENTITY_FAILURE: 0,
    WOULD_INSERT: 0,
    INSERTED: 0,
  };
}

function toSeparated(bucket: LossBucket, sep: LossFunnelReport['separated']): void {
  switch (bucket) {
    case 'DISCOUNT_FAIL_REAL_LOW':
      sep.REAL_LOW_DISCOUNT += 1;
      break;
    case 'DISCOUNT_UNKNOWN':
      sep.UNKNOWN_DISCOUNT += 1;
      break;
    case 'DISCOUNT_FAIL_FALSE_ZERO_CORRECTED':
      sep.FALSE_ZERO_CORRECTED += 1;
      break;
    case 'PRICE_INVALID':
      sep.PRICE_INVALID += 1;
      break;
    case 'QUALITY_REJECTED':
      sep.QUALITY_REJECTED += 1;
      break;
    case 'TOPK_CUT':
      sep.TOPK_CUT += 1;
      break;
    case 'BUDGET_CUT':
      sep.BUDGET_CUT += 1;
      break;
    case 'DIVERSITY_CUT':
      sep.DIVERSITY_CUT += 1;
      break;
    case 'DUPLICATE':
      sep.DUPLICATE += 1;
      break;
    case 'NEGATIVE_MEMORY':
      sep.NEGATIVE_MEMORY += 1;
      break;
    case 'SOURCE_FAILURE':
      sep.SOURCE_FAILURE += 1;
      break;
    case 'IDENTITY_FAILURE':
      sep.IDENTITY_FAILURE += 1;
      break;
    case 'WOULD_INSERT':
      sep.WOULD_INSERT += 1;
      break;
    case 'INSERTED':
      sep.INSERTED += 1;
      break;
    default:
      break;
  }
}

/**
 * Build full loss funnel from candidate rows (in-memory).
 * Reconciles: sum(terminalBuckets) === total.
 */
export function buildLossFunnelReport(rows: readonly LossFunnelRow[]): LossFunnelReport {
  const total = rows.length;
  const bucketCounts = new Map<LossBucket, { count: number; reasonCodes: Record<string, number> }>();
  const separated = emptySeparated();
  const human = {
    labeled: 0,
    goodAmongRejected: 0,
    badAmongRejected: 0,
    uncertainAmongRejected: 0,
    falseNegative: 0,
    falsePositive: 0,
    unknownDiscountLabeled: 0,
    falseZeroCorrectedLabeled: 0,
  };

  for (const row of rows) {
    const bucket = classifyLossBucket(row);
    const entry = bucketCounts.get(bucket) ?? { count: 0, reasonCodes: {} };
    entry.count += 1;
    bump(entry.reasonCodes, row.reasonCode || row.reasonDetail || row.decision || 'unknown');
    bucketCounts.set(bucket, entry);
    toSeparated(bucket, separated);

    if (row.humanLabel) {
      human.labeled += 1;
      const rejected = bucket !== 'WOULD_INSERT' && bucket !== 'INSERTED' && bucket !== 'DISCOVERED';
      const label = row.humanLabel.toUpperCase();
      if (rejected) {
        if (label.includes('GOOD') || label.includes('GREAT') || label === 'PUBLISH') {
          human.goodAmongRejected += 1;
        } else if (label.includes('BAD') || label.includes('REJECT') || label.includes('FALSE_DEAL')) {
          human.badAmongRejected += 1;
        } else if (label.includes('UNCERTAIN') || label.includes('WATCH')) {
          human.uncertainAmongRejected += 1;
        }
      }
      if (row.labelOutcome === 'FALSE_NEGATIVE' || label === 'FALSE_NEGATIVE') {
        human.falseNegative += 1;
      }
      if (row.labelOutcome === 'FALSE_POSITIVE' || label === 'FALSE_POSITIVE') {
        human.falsePositive += 1;
      }
      if (bucket === 'DISCOUNT_UNKNOWN') human.unknownDiscountLabeled += 1;
      if (bucket === 'DISCOUNT_FAIL_FALSE_ZERO_CORRECTED') human.falseZeroCorrectedLabeled += 1;
    }
  }

  const terminalBuckets: LossBucketStat[] = LOSS_BUCKETS.map((bucket) => {
    const entry = bucketCounts.get(bucket) ?? { count: 0, reasonCodes: {} };
    return {
      bucket,
      count: entry.count,
      percentage: pct(entry.count, total),
      reasonCodes: entry.reasonCodes,
    };
  }).filter((b) => b.count > 0);

  const terminalSum = terminalBuckets.reduce((a, b) => a + b.count, 0);

  // Stage hops (conceptual): DISCOVERED → … → WOULD_INSERT
  // Survived = not yet terminalized at earlier hop — approximate via complement of earlier losses.
  const lostDiscount =
    separated.REAL_LOW_DISCOUNT +
    separated.UNKNOWN_DISCOUNT +
    separated.FALSE_ZERO_CORRECTED;
  const lostPrice = separated.PRICE_INVALID;
  const lostQuality = separated.QUALITY_REJECTED;
  const lostTop = separated.TOPK_CUT + separated.BUDGET_CUT;
  const lostDiv = separated.DIVERSITY_CUT;
  const lostNm = separated.NEGATIVE_MEMORY;
  const lostDup = separated.DUPLICATE;
  const lostId = separated.IDENTITY_FAILURE;
  const lostSrc = separated.SOURCE_FAILURE;
  const would = separated.WOULD_INSERT + separated.INSERTED;

  const lostScore = bucketCounts.get('SCORE')?.count ?? 0;
  const lostOther = (bucketCounts.get('OTHER')?.count ?? 0) + (bucketCounts.get('DISCOVERED')?.count ?? 0);

  let remaining = total;
  const mkStage = (
    stage: LossFunnelReport['stages'][number]['stage'],
    lostHere: number,
    bucketsHere: LossBucket[],
  ) => {
    const entered = remaining;
    const lost = lostHere;
    const survived = Math.max(0, entered - lost);
    remaining = survived;
    const buckets = terminalBuckets.filter((b) => bucketsHere.includes(b.bucket));
    return {
      stage,
      entered,
      survived,
      lost,
      lossPercentage: pct(lost, entered),
      buckets,
    };
  };

  const stages: LossFunnelReport['stages'] = [
    mkStage('IDENTITY', lostId + lostSrc, ['IDENTITY_FAILURE', 'SOURCE_FAILURE']),
    mkStage('DISCOUNT_CLASSIFICATION', lostDiscount, [
      'DISCOUNT_FAIL_REAL_LOW',
      'DISCOUNT_UNKNOWN',
      'DISCOUNT_FAIL_FALSE_ZERO_CORRECTED',
    ]),
    mkStage('PRICE', lostPrice, ['PRICE_INVALID']),
    mkStage('QUALITY', lostQuality, ['QUALITY_REJECTED']),
    mkStage('SCORE', lostScore + lostOther, ['SCORE', 'OTHER', 'DISCOVERED']),
    mkStage('TOP_K', lostTop, ['TOPK_CUT', 'BUDGET_CUT']),
    mkStage('DIVERSITY', lostDiv, ['DIVERSITY_CUT']),
    mkStage('NEGATIVE_MEMORY', lostNm + lostDup, ['NEGATIVE_MEMORY', 'DUPLICATE']),
    mkStage('WOULD_INSERT', 0, ['WOULD_INSERT', 'INSERTED']),
  ];
  // Fix last stage: would-insert is pass not loss
  const last = stages[stages.length - 1]!;
  last.survived = would;
  last.lost = 0;
  last.lossPercentage = pct(0, last.entered);
  last.entered = Math.max(last.entered, would);

  const rate = (n: number, d: number | null) => (d != null && d > 0 ? pct(n, d) : null);
  const completePipeline: LossFunnelReport['completePipeline'] = [];
  const pushPipe = (
    stage: LossFunnelReport['completePipeline'][number]['stage'],
    count: number,
    prev: number | null,
    evidence_source: string,
    reason_code: string,
    unknown?: string,
  ) => {
    completePipeline.push({
      stage,
      status: unknown ? 'UNKNOWN' : 'OK',
      reason_code,
      candidate_count: count,
      candidate_rate: rate(count, prev ?? total),
      previous_stage_count: prev,
      evidence_source,
      ...(unknown ? { why_unknown: unknown } : {}),
    });
  };

  pushPipe('DISCOVERED', total, null, 'candidate_rows', 'ALL_OBSERVED');
  const idFail = separated.IDENTITY_FAILURE + separated.SOURCE_FAILURE;
  pushPipe('IDENTITY_VALID', Math.max(0, total - idFail), total, 'classifyLossBucket', 'IDENTITY_OR_SOURCE');
  // PRODUCT_VALID: no dedicated product-schema terminal in telemetry → UNKNOWN if we cannot prove
  const productEvidence = rows.some((r) => r.funnelStage === 'PRODUCT' || r.rejectionStage === 'PRODUCT');
  if (productEvidence) {
    const prodFail = rows.filter(
      (r) => r.rejectionStage === 'PRODUCT' || (r.funnelStage || '').toUpperCase() === 'PRODUCT',
    ).length;
    pushPipe(
      'PRODUCT_VALID',
      Math.max(0, completePipeline[1]!.candidate_count - prodFail),
      completePipeline[1]!.candidate_count,
      'rejection_stage=PRODUCT',
      'PRODUCT_STAGE',
    );
  } else {
    pushPipe(
      'PRODUCT_VALID',
      completePipeline[1]!.candidate_count,
      completePipeline[1]!.candidate_count,
      'inferred_passthrough',
      'NO_PRODUCT_STAGE_EVIDENCE',
      'No PRODUCT rejection_stage in window — treated as pass-through, not invented loss.',
    );
  }
  const discountClassified =
    separated.REAL_LOW_DISCOUNT +
    separated.UNKNOWN_DISCOUNT +
    separated.FALSE_ZERO_CORRECTED +
    would +
    separated.TOPK_CUT +
    separated.BUDGET_CUT +
    separated.DIVERSITY_CUT +
    separated.QUALITY_REJECTED +
    separated.PRICE_INVALID +
    separated.NEGATIVE_MEMORY +
    separated.DUPLICATE +
    lostScore;
  pushPipe(
    'DISCOUNT_CLASSIFIED',
    discountClassified,
    completePipeline[2]!.candidate_count,
    'discount_class+decision',
    'DISCOUNT_PATH',
  );
  const discountPass = Math.max(
    0,
    discountClassified -
      separated.REAL_LOW_DISCOUNT -
      separated.UNKNOWN_DISCOUNT -
      separated.FALSE_ZERO_CORRECTED,
  );
  pushPipe(
    'DISCOUNT_PASS',
    discountPass,
    completePipeline[3]!.candidate_count,
    'separated_discount_buckets',
    'DISCOUNT_GATE',
  );
  const afterScore = Math.max(0, discountPass - lostScore - lostQuality - lostPrice - lostOther);
  pushPipe('SCORE_VALID', afterScore, completePipeline[4]!.candidate_count, 'score+quality+price', 'SCORE_PATH');
  const afterTop = Math.max(0, afterScore - lostTop);
  pushPipe('TOP_K', afterTop, completePipeline[5]!.candidate_count, 'wouldTopkCut+REJECTED_BUDGET', 'TOPK');
  const afterDiv = Math.max(0, afterTop - lostDiv);
  pushPipe('DIVERSITY', afterDiv, completePipeline[6]!.candidate_count, 'wouldDiversityCut', 'DIVERSITY');
  const afterNm = Math.max(0, afterDiv - lostNm - lostDup);
  pushPipe('NEGATIVE_MEMORY', afterNm, completePipeline[7]!.candidate_count, 'negativeMemoryLevel', 'NM');
  pushPipe('WOULD_INSERT', would, completePipeline[8]!.candidate_count, 'decision=WOULD_INSERT|INSERTED_*', 'PASS');
  // Mint is hard-walled in observation — count INSERT_ATTEMPT/INSERTED only if present
  const mintAttempts = separated.INSERTED + (bucketCounts.get('INSERT_ATTEMPT')?.count ?? 0);
  pushPipe(
    'MINT_ATTEMPT',
    mintAttempts,
    completePipeline[9]!.candidate_count,
    'decision=INSERTED_*|INSERT_ATTEMPT',
    'MINT',
    mintAttempts === 0 && would > 0
      ? 'Observation wall: WOULD_INSERT observed but mint not attempted (expected).'
      : undefined,
  );

  return {
    total,
    stages,
    terminalBuckets,
    separated,
    humanGroundTruth: human,
    reconciliation: {
      terminalSum,
      matchesTotal: terminalSum === total,
      gap: total - terminalSum,
    },
    completePipeline,
  };
}

/** Ensure deriveFunnelDecision stays available for callers that annotate rows. */
export function annotateFunnelStage(row: LossFunnelRow): FunnelStageName {
  return deriveFunnelDecision({
    decision: row.decision,
    reasonCode: row.reasonCode,
    reasonDetail: row.reasonDetail,
    wouldTopkCut: row.wouldTopkCut === true,
    wouldDiversityCut: row.wouldDiversityCut === true || row.diversityCut === true,
    discountClass: (row.discountClass as DiscountClass) ?? null,
  }).stage;
}
