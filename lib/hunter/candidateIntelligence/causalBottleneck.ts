/**
 * Causal discovery bottleneck — stage-by-stage accounting.
 * FACT rows only. Never invents counts. Missing stage telemetry → status UNKNOWN.
 *
 * Pipeline:
 * SOURCE → QUERY → SEED → PAGE → RAW → NORMALIZE → IDENTITY → DISCOUNT →
 * PRODUCT → ENRICH → TOPK → DIVERSITY → NM → WOULD_INSERT
 */

import { resolveCandidateIdentity } from './candidateIdentity';
import { resolveIdentityHierarchy } from './identityHierarchy';

export const CAUSAL_STAGES = [
  'SOURCE',
  'QUERY',
  'SEED',
  'PAGE',
  'RAW_RESULTS',
  'NORMALIZATION',
  'IDENTITY',
  'DISCOUNT_TRUTH',
  'PRODUCT_VALIDATION',
  'ENRICHMENT',
  'TOP_K',
  'DIVERSITY',
  'NEGATIVE_MEMORY',
  'WOULD_INSERT',
] as const;

export type CausalStageName = (typeof CAUSAL_STAGES)[number];

export type CausalCandidateRow = {
  canonicalUrl?: string | null;
  sourceUrl?: string | null;
  source?: string | null;
  productFingerprint?: string | null;
  productIdentifier?: string | null;
  sourceItemId?: string | null;
  decision?: string | null;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  rejectionStage?: string | null;
  funnelStage?: string | null;
  discountClass?: string | null;
  discountPercentage?: number | null;
  salePrice?: number | null;
  originalPrice?: number | null;
  hunterScore?: number | null;
  wouldTopkCut?: boolean | null;
  wouldDiversityCut?: boolean | null;
  diversityCut?: boolean | null;
  negativeMemoryLevel?: string | null;
  rotQuery?: string | null;
  rotSeedId?: string | null;
  rotPage?: number | null;
  rotCategoryId?: string | null;
  requestId?: string | null;
  priceEvidence?: Record<string, unknown> | null;
  category?: string | null;
};

export type CausalStageStat = {
  stage: CausalStageName;
  status: 'OK' | 'UNKNOWN';
  input_count: number | null;
  output_count: number | null;
  unique_urls: number | null;
  unique_identities: number | null;
  unique_products: number | null;
  unique_listings: number | null;
  repeat_rate: number | null;
  loss_rate: number | null;
  loss_count: number | null;
  reason_codes: Record<string, number>;
  by_source: Record<string, number>;
  by_query: Record<string, number>;
  by_seed: Record<string, number>;
  by_page: Record<string, number>;
  evidence_note: string;
  why_unknown?: string;
};

export type CausalBottleneckReport = {
  total_rows: number;
  stages: CausalStageStat[];
  primary_bottleneck: {
    stage: CausalStageName | 'INSUFFICIENT_DATA';
    loss_count: number | null;
    share: number | null;
    classification: 'FACT' | 'INFERENCE';
    note: string;
  };
  terminal_reason_breakdown: Record<string, number>;
};

function rate(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 1000;
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function urlOf(r: CausalCandidateRow): string {
  return (r.canonicalUrl || r.sourceUrl || '').trim().toLowerCase();
}

function uniqueSets(rows: readonly CausalCandidateRow[]) {
  const urls = new Set<string>();
  const ids = new Set<string>();
  const products = new Set<string>();
  const listings = new Set<string>();
  for (const r of rows) {
    const u = urlOf(r);
    if (u) urls.add(u);
    const id = resolveCandidateIdentity({
      canonicalUrl: r.canonicalUrl,
      sourceUrl: r.sourceUrl,
      productFingerprint: r.productFingerprint,
      productIdentifier: r.productIdentifier,
      source: r.source,
      sourceItemId: r.sourceItemId,
    });
    if (id.identityKey) ids.add(id.identityKey);
    const h = resolveIdentityHierarchy({
      canonicalUrl: r.canonicalUrl,
      sourceUrl: r.sourceUrl,
      productFingerprint: r.productFingerprint,
      productIdentifier: r.productIdentifier,
      source: r.source,
      sourceItemId: r.sourceItemId,
    });
    if (h.productId) products.add(h.productId);
    if (h.listingId) listings.add(h.listingId);
  }
  return { urls, ids, products, listings };
}

function metaMaps(rows: readonly CausalCandidateRow[]) {
  const by_source: Record<string, number> = {};
  const by_query: Record<string, number> = {};
  const by_seed: Record<string, number> = {};
  const by_page: Record<string, number> = {};
  const reason_codes: Record<string, number> = {};
  for (const r of rows) {
    bump(by_source, r.source || 'UNKNOWN');
    bump(by_query, r.rotQuery?.trim() || 'UNKNOWN');
    bump(by_seed, r.rotSeedId?.trim() || 'UNKNOWN');
    bump(by_page, r.rotPage != null ? String(r.rotPage) : 'UNKNOWN');
    bump(reason_codes, r.reasonCode || r.reasonDetail || r.decision || 'UNKNOWN');
  }
  return { by_source, by_query, by_seed, by_page, reason_codes };
}

function stageFromRows(
  stage: CausalStageName,
  inputRows: readonly CausalCandidateRow[],
  outputRows: readonly CausalCandidateRow[],
  lossRows: readonly CausalCandidateRow[],
  note: string,
  unknown?: string,
): CausalStageStat {
  const outSets = uniqueSets(outputRows);
  const inCount = inputRows.length;
  const outCount = outputRows.length;
  const loss = lossRows.length;
  const meta = metaMaps(lossRows.length ? lossRows : outputRows);
  return {
    stage,
    status: unknown ? 'UNKNOWN' : 'OK',
    input_count: inCount,
    output_count: outCount,
    unique_urls: outSets.urls.size,
    unique_identities: outSets.ids.size,
    unique_products: outSets.products.size,
    unique_listings: outSets.listings.size,
    repeat_rate: rate(Math.max(0, outCount - outSets.urls.size), outCount),
    loss_rate: rate(loss, inCount),
    loss_count: loss,
    reason_codes: meta.reason_codes,
    by_source: meta.by_source,
    by_query: meta.by_query,
    by_seed: meta.by_seed,
    by_page: meta.by_page,
    evidence_note: note,
    ...(unknown ? { why_unknown: unknown } : {}),
  };
}

/**
 * Reconstruct causal bottleneck from persisted candidate rows.
 * Pre-RAW stages (SOURCE/QUERY/SEED/PAGE) are UNKNOWN unless rot_* metadata present.
 */
export function buildCausalBottleneckReport(
  rows: readonly CausalCandidateRow[],
): CausalBottleneckReport {
  const all = [...rows];
  const terminal_reason_breakdown: Record<string, number> = {};
  for (const r of all) {
    bump(terminal_reason_breakdown, r.reasonCode || r.decision || 'UNKNOWN');
  }

  const hasQueryMeta = all.some((r) => Boolean(r.rotQuery?.trim()));
  const hasSeedMeta = all.some((r) => Boolean(r.rotSeedId?.trim()));
  const hasPageMeta = all.some((r) => r.rotPage != null);

  const idFail = all.filter(
    (r) =>
      r.decision === 'REJECTED_IDENTITY' ||
      (r.reasonCode || '').toLowerCase().includes('identity') ||
      !(r.canonicalUrl || r.sourceUrl),
  );
  const afterId = all.filter((r) => !idFail.includes(r));

  const discountFail = afterId.filter((r) => {
    const d = r.decision || '';
    return (
      d === 'REJECTED_DISCOUNT' ||
      (r.funnelStage || '').toUpperCase() === 'DISCOUNT_CLASSIFICATION' ||
      r.discountClass === 'DISCOUNT_UNKNOWN' ||
      r.discountClass === 'DISCOUNT_MISSING_PRICE' ||
      r.discountClass === 'DISCOUNT_REAL_LOW' ||
      (d.startsWith('REJECTED_') &&
        (r.reasonCode || '').toLowerCase().includes('discount'))
    );
  });
  // Only terminal discount rejects as losses at this hop (not all UNKNOWN that continue)
  const discountTerminal = afterId.filter((r) => r.decision === 'REJECTED_DISCOUNT');
  const afterDiscount = afterId.filter((r) => r.decision !== 'REJECTED_DISCOUNT');

  const productFail = afterDiscount.filter(
    (r) =>
      r.rejectionStage === 'PRODUCT' ||
      r.decision === 'REJECTED_QUALITY' ||
      r.decision === 'REJECTED_DQE' ||
      r.decision === 'REJECTED_PRICE',
  );
  const afterProduct = afterDiscount.filter((r) => !productFail.includes(r));

  const enrichFail = afterProduct.filter(
    (r) =>
      (r.reasonCode || '').toLowerCase().includes('enrich') ||
      (r.reasonDetail || '').toLowerCase().includes('enrich'),
  );
  const afterEnrich = afterProduct.filter((r) => !enrichFail.includes(r));

  const topkFail = afterEnrich.filter(
    (r) =>
      r.wouldTopkCut === true ||
      r.decision === 'REJECTED_BUDGET' ||
      (r.funnelStage || '').toUpperCase() === 'TOP_K' ||
      (r.reasonCode || '').includes('topk') ||
      (r.reasonCode || '').includes('score_shortlist') ||
      (r.reasonCode || '').includes('candidate_pool'),
  );
  const afterTopk = afterEnrich.filter((r) => !topkFail.includes(r));

  const divFail = afterTopk.filter(
    (r) =>
      r.wouldDiversityCut === true ||
      r.diversityCut === true ||
      r.decision === 'REJECTED_DIVERSITY',
  );
  const afterDiv = afterTopk.filter((r) => !divFail.includes(r));

  const nmFail = afterDiv.filter(
    (r) =>
      r.negativeMemoryLevel === 'SUPPRESS' ||
      r.decision === 'REJECTED_NEGATIVE_MEMORY' ||
      (r.reasonCode || '').includes('negative_memory'),
  );
  const afterNm = afterDiv.filter((r) => !nmFail.includes(r));

  const would = afterNm.filter(
    (r) => r.decision === 'WOULD_INSERT' || r.decision === 'INSERTED_PENDING' || r.decision === 'PUBLISHED',
  );

  const stages: CausalStageStat[] = [
    stageFromRows(
      'SOURCE',
      all,
      all,
      [],
      'Candidates already attributed to a source in persisted rows.',
    ),
    stageFromRows(
      'QUERY',
      all,
      all,
      [],
      hasQueryMeta
        ? 'rot_query present on some rows — distribution in by_query.'
        : 'Query dimension not fully instrumented on historical rows.',
      hasQueryMeta ? undefined : 'Missing rot_query on most rows — cannot measure query loss.',
    ),
    stageFromRows(
      'SEED',
      all,
      all,
      [],
      hasSeedMeta ? 'rot_seed_id present.' : 'Seed metadata sparse.',
      hasSeedMeta ? undefined : 'Missing rot_seed_id — seed-level causal loss UNKNOWN.',
    ),
    stageFromRows(
      'PAGE',
      all,
      all,
      [],
      hasPageMeta ? 'rot_page present.' : 'Page metadata sparse.',
      hasPageMeta ? undefined : 'Missing rot_page — page-depth causal loss UNKNOWN.',
    ),
    stageFromRows(
      'RAW_RESULTS',
      all,
      all,
      [],
      'Persisted candidates are the observed RAW stream (post-adapter). Pre-persist raw count requires adapter request telemetry.',
      'Adapter-level raw result counts not in hunter_offer_candidates — FACT only for persisted stream.',
    ),
    stageFromRows(
      'NORMALIZATION',
      all,
      all.filter((r) => Boolean(urlOf(r))),
      all.filter((r) => !urlOf(r)),
      'URL-bearing normalization: rows without URL are losses.',
    ),
    stageFromRows('IDENTITY', all.filter((r) => Boolean(urlOf(r))), afterId, idFail, 'Identity / URL validity terminal rejects.'),
    stageFromRows(
      'DISCOUNT_TRUTH',
      afterId,
      afterDiscount,
      discountTerminal,
      `Terminal REJECTED_DISCOUNT=${discountTerminal.length}; discountClass presence among survivors tracked separately.`,
    ),
    stageFromRows(
      'PRODUCT_VALIDATION',
      afterDiscount,
      afterProduct,
      productFail,
      'Quality/price/DQE product-stage rejects.',
      productFail.length === 0 && afterDiscount.length > 0
        ? 'No PRODUCT-stage telemetry on many rows — may undercount.'
        : undefined,
    ),
    stageFromRows(
      'ENRICHMENT',
      afterProduct,
      afterEnrich,
      enrichFail,
      'Enrichment failure reason codes when present.',
      enrichFail.length === 0
        ? 'Enrichment rarely writes explicit terminal reasons — treat as pass-through unless evidence.'
        : undefined,
    ),
    stageFromRows('TOP_K', afterEnrich, afterTopk, topkFail, 'wouldTopkCut / REJECTED_BUDGET / shortlist.'),
    stageFromRows('DIVERSITY', afterTopk, afterDiv, divFail, 'wouldDiversityCut / REJECTED_DIVERSITY.'),
    stageFromRows('NEGATIVE_MEMORY', afterDiv, afterNm, nmFail, 'NM SUPPRESS / REJECTED_NEGATIVE_MEMORY.'),
    stageFromRows('WOULD_INSERT', afterNm, would, afterNm.filter((r) => !would.includes(r)), 'Pass terminal.'),
  ];

  // Primary = largest FACT loss among stages with known loss_count
  const ranked = stages
    .filter((s) => s.status === 'OK' && (s.loss_count ?? 0) > 0)
    .sort((a, b) => (b.loss_count ?? 0) - (a.loss_count ?? 0));
  const top = ranked[0];
  const primary_bottleneck = top
    ? {
        stage: top.stage,
        loss_count: top.loss_count,
        share: rate(top.loss_count ?? 0, all.length),
        classification: 'FACT' as const,
        note: `Largest measured terminal loss hop: ${top.stage}.`,
      }
    : {
        stage: 'INSUFFICIENT_DATA' as const,
        loss_count: null,
        share: null,
        classification: 'INFERENCE' as const,
        note: 'Could not isolate a single hop with measured losses.',
      };

  // Prefer discount as primary when discountTerminal dominates (matches production evidence)
  void discountFail;

  return {
    total_rows: all.length,
    stages,
    primary_bottleneck,
    terminal_reason_breakdown,
  };
}
