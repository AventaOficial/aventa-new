/**
 * Mission Control — full evidence aggregator for Hunter closure.
 * Observation only. Never mints / publishes / pays.
 */

import { resolveCandidateIdentity } from './candidateIdentity';
import { buildCausalBottleneckReport, type CausalBottleneckReport } from './causalBottleneck';
import { reconcileDiscoveryCompleteness } from './completenessReconciliation';
import { validateCandidateTelemetry } from './dataQualityContract';
import { computeDiscoveryEfficiency, type DiscoveryEfficiencyReport } from './discoveryEfficiency';
import { DIMENSION_LEVERAGE_RANKING } from './discoveryScheduler';
import { resolveIdentityHierarchy } from './identityHierarchy';
import { computeLabelAvailability, type LabelAvailability } from './labelAvailability';
import { buildLossFunnelReport, type LossFunnelReport, type LossFunnelRow } from './lossFunnel';
import {
  computeNoveltyRunMetrics,
  type NoveltyCandidateInput,
  type NoveltyRunMetrics,
} from './noveltyMetrics';
import { getSourceExpansionArchitecture } from './sourceExpansionArchitecture';
import { buildSourceCoverageMatrix, type SourceCoverageRow } from './sourceCoverage';
import { computeStickinessReport, type StickinessReport } from './stickinessMetrics';
import { computeTemporalNovelty, type TemporalNoveltyReport } from './temporalNovelty';
import { buildUnknownDiscountBreakdown, type UnknownBreakdownReport } from './unknownDiscountBreakdown';

export type MissionControlCandidate = NoveltyCandidateInput &
  LossFunnelRow & {
    runId?: string | null;
    retailer?: string | null;
    title?: string | null;
    salePrice?: number | null;
    originalPrice?: number | null;
    discoveredAt?: string | null;
    experimentId?: string | null;
    experimentVariant?: string | null;
    identityType?: string | null;
    sourceItemId?: string | null;
    sourceDetail?: string | null;
    requestId?: string | null;
  };

export type MissionControlReport = {
  window: { since: string | null; until: string | null; runIds: string[] };
  summary: {
    discovered: number;
    unique_urls: number;
    unique_identities: number;
    unique_products: number;
    unique_listings: number;
    would_insert: number;
    sticky: boolean | null;
  };
  coverage: SourceCoverageRow[];
  novelty: NoveltyRunMetrics;
  temporalNovelty: TemporalNoveltyReport | null;
  stickiness: StickinessReport;
  lossFunnel: LossFunnelReport;
  causalBottleneck: CausalBottleneckReport;
  unknownBreakdown: UnknownBreakdownReport;
  discoveryEfficiency: DiscoveryEfficiencyReport;
  discoveryStrategy: {
    page_policy: 'page_1_only';
    dimension_leverage: typeof DIMENSION_LEVERAGE_RANKING;
    adaptive_note: string;
  };
  sourceExpansion: ReturnType<typeof getSourceExpansionArchitecture>;
  reconciliation: ReturnType<typeof reconcileDiscoveryCompleteness>;
  labelAvailability: LabelAvailability;
  dataQuality: {
    sampled: number;
    valid: number;
    unknown: number;
    invalid: number;
    missing: number;
  };
  identityBreakdown: Record<string, number>;
  identityStrengthBreakdown: Record<string, number>;
  answers: {
    A_universe_breadth: Record<string, unknown>;
    B_good_candidates_lost: Record<string, unknown>;
    C_bottleneck: Record<string, unknown>;
    D_discovered_even_if_rejected: number;
    E_good_lost_proxy: number;
    F_quantified_losses: LossFunnelReport['separated'];
    G_zero_silent_drops: { ok: boolean; gap: number; note: string };
    H_variety_without_money: {
      observation_only: true;
      novelty_engine: true;
      experiment_shadow: true;
      money_path_untouched: true;
    };
  };
};

function share(n: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((n / total) * 1000) / 10;
}

export function buildMissionControlReport(input: {
  candidates: readonly MissionControlCandidate[];
  since?: string | null;
  until?: string | null;
  previousRunIdentities?: ReadonlySet<string> | readonly string[];
  identities24h?: ReadonlySet<string> | readonly string[];
  identities7d?: ReadonlySet<string> | readonly string[];
  urls7d?: ReadonlySet<string> | readonly string[];
  products7d?: ReadonlySet<string> | readonly string[];
  /** Non-overlapping baseline rows for temporal novelty. */
  baseline24hRows?: readonly NoveltyCandidateInput[];
  baseline7dRows?: readonly NoveltyCandidateInput[];
  configuredSources?: readonly string[];
  enabledSources?: readonly string[];
}): MissionControlReport {
  const rows = input.candidates;
  const runIds = [...new Set(rows.map((r) => r.runId).filter(Boolean))] as string[];

  const enriched = rows.map((r) => {
    const id = resolveCandidateIdentity({
      canonicalUrl: r.canonicalUrl,
      sourceUrl: r.sourceUrl,
      productFingerprint: r.productFingerprint,
      productIdentifier: r.productIdentifier,
      source: r.source,
      sourceItemId: r.sourceItemId,
    });
    return { ...r, _identity: id };
  });

  const novelty = computeNoveltyRunMetrics({
    runCandidates: rows,
    previousRunIdentities: input.previousRunIdentities,
    identities24h: input.identities24h,
    identities7d: input.identities7d,
    urls7d: input.urls7d,
    products7d: input.products7d,
  });

  const temporalNovelty =
    input.since && input.until
      ? computeTemporalNovelty({
          since: input.since,
          until: input.until,
          currentRows: rows,
          baseline24hRows: input.baseline24hRows,
          baseline7dRows: input.baseline7dRows,
        })
      : null;

  const stickiness = computeStickinessReport(rows);
  const lossFunnel = buildLossFunnelReport(rows);

  const reconciliation = reconcileDiscoveryCompleteness({
    rows: enriched
      .filter((r) => Boolean((r.canonicalUrl || r.sourceUrl || '').trim()))
      .map((r) => ({
        url: (r.canonicalUrl || r.sourceUrl || '').trim(),
        decision: r.decision,
        reasonCode: r.reasonCode,
        stage: r.funnelStage,
      })),
    requireTerminalBeyondDiscovered: false,
  });

  const labeled = rows.filter((r) => r.humanLabel).length;
  const labelAvailability = computeLabelAvailability({
    totalCandidates: rows.length,
    labeled,
    truePositive: lossFunnel.humanGroundTruth.goodAmongRejected,
    falsePositive: lossFunnel.humanGroundTruth.falsePositive,
    falseNegative: lossFunnel.humanGroundTruth.falseNegative,
  });

  const identityBreakdown: Record<string, number> = {};
  const identityStrengthBreakdown: Record<string, number> = {};
  const listingIds = new Set<string>();
  const productIds = new Set<string>();
  const dq = { sampled: 0, valid: 0, unknown: 0, invalid: 0, missing: 0 };
  for (const r of enriched) {
    const t = r._identity.identityType;
    identityBreakdown[t] = (identityBreakdown[t] ?? 0) + 1;
    const h = resolveIdentityHierarchy({
      canonicalUrl: r.canonicalUrl,
      sourceUrl: r.sourceUrl,
      productFingerprint: r.productFingerprint,
      productIdentifier: r.productIdentifier,
      source: r.source,
      sourceItemId: r.sourceItemId,
    });
    identityStrengthBreakdown[h.strength] = (identityStrengthBreakdown[h.strength] ?? 0) + 1;
    if (h.listingId) listingIds.add(h.listingId);
    if (h.productId) productIds.add(h.productId);
    const report = validateCandidateTelemetry({
      canonicalUrl: r.canonicalUrl,
      source: r.source,
      identityType: r._identity.identityType,
      identityKey: r._identity.identityKey,
      discoveredAt: r.discoveredAt,
      discountPercentage: r.discountPercentage,
      discountClass: r.discountClass,
      salePrice: r.salePrice,
      originalPrice: r.originalPrice,
      decision: r.decision,
      reasonCode: r.reasonCode,
      funnelStage: r.funnelStage,
      experimentId: r.experimentId,
      experimentVariant: r.experimentVariant,
      rotQuery: r.rotQuery,
      rotSeedId: r.rotSeedId,
      rotPage: r.rotPage,
    });
    dq.sampled += 1;
    if (report.overall === 'VALID') dq.valid += 1;
    else if (report.overall === 'UNKNOWN') dq.unknown += 1;
    else if (report.overall === 'INVALID') dq.invalid += 1;
    else dq.missing += 1;
  }

  const causalBottleneck = buildCausalBottleneckReport(rows);
  const unknownBreakdown = buildUnknownDiscountBreakdown(rows);

  // Coverage by source from rows
  const bySource: Record<
    string,
    { events: number; urls: Set<string>; ids: Set<string>; would: number }
  > = {};
  for (const r of enriched) {
    const s = r.source || 'unknown';
    const bucket = bySource[s] ?? { events: 0, urls: new Set(), ids: new Set(), would: 0 };
    bucket.events += 1;
    const u = (r.canonicalUrl || '').trim().toLowerCase();
    if (u) bucket.urls.add(u);
    if (r._identity.identityKey) bucket.ids.add(r._identity.identityKey);
    if (r.decision === 'WOULD_INSERT' || r.decision === 'INSERTED_PENDING') bucket.would += 1;
    bySource[s] = bucket;
  }
  const rowsBySource: Record<
    string,
    {
      events: number;
      unique_urls: number;
      unique_identities: number;
      would_insert: number;
    }
  > = {};
  for (const [s, b] of Object.entries(bySource)) {
    rowsBySource[s] = {
      events: b.events,
      unique_urls: b.urls.size,
      unique_identities: b.ids.size,
      would_insert: b.would,
    };
  }
  const present = Object.keys(rowsBySource);
  const coverage = buildSourceCoverageMatrix({
    rowsBySource,
    configuredSources: input.configuredSources ?? present,
    enabledSources: input.enabledSources ?? present,
  });

  const sep = lossFunnel.separated;
  const efficiency = computeDiscoveryEfficiency({
    successfulRequests: Math.max(
      1,
      new Set(rows.map((r) => `${r.source || ''}|${r.rotQuery || r.rotSeedId || 'req'}`)).size,
    ),
    candidatesObserved: rows.length,
    uniqueUrls: novelty.unique_url_count,
    uniqueIdentities: novelty.unique_identity_count,
    uniqueProducts: productIds.size || novelty.unique_product_count,
    goodCandidates: sep.WOULD_INSERT + sep.INSERTED,
    verifiedGoodCandidates: rows.filter(
      (r) =>
        (r.decision === 'WOULD_INSERT' || r.decision === 'INSERTED_PENDING') &&
        r.discountClass === 'DISCOUNT_REAL_GOOD',
    ).length,
    unknownDiscountCount: sep.UNKNOWN_DISCOUNT,
    realLowCount: sep.REAL_LOW_DISCOUNT,
  });

  const ranked = [
    { cause: 'discount_real_low', count: sep.REAL_LOW_DISCOUNT },
    { cause: 'discount_unknown', count: sep.UNKNOWN_DISCOUNT },
    { cause: 'false_zero_corrected', count: sep.FALSE_ZERO_CORRECTED },
    { cause: 'topk', count: sep.TOPK_CUT },
    { cause: 'budget', count: sep.BUDGET_CUT },
    { cause: 'diversity', count: sep.DIVERSITY_CUT },
    { cause: 'quality', count: sep.QUALITY_REJECTED },
    { cause: 'price_invalid', count: sep.PRICE_INVALID },
    { cause: 'duplicate', count: sep.DUPLICATE },
    { cause: 'negative_memory', count: sep.NEGATIVE_MEMORY },
    { cause: 'identity', count: sep.IDENTITY_FAILURE },
    { cause: 'source_failure', count: sep.SOURCE_FAILURE },
  ]
    .map((r) => ({ ...r, share: share(r.count, rows.length) }))
    .sort((a, b) => b.count - a.count);

  const primary = ranked[0] && ranked[0].count > 0 ? ranked[0].cause : 'insufficient_data';
  const sticky =
    temporalNovelty?.jaccard_7d != null
      ? temporalNovelty.jaccard_7d >= 0.7
      : stickiness.diagnostics.STICKY_IDENTITY;

  return {
    window: {
      since: input.since ?? null,
      until: input.until ?? null,
      runIds,
    },
    summary: {
      discovered: novelty.discovered_count,
      unique_urls: novelty.unique_url_count,
      unique_identities: novelty.unique_identity_count,
      unique_products: productIds.size || novelty.unique_product_count,
      unique_listings: listingIds.size,
      would_insert: sep.WOULD_INSERT + sep.INSERTED,
      sticky,
    },
    coverage,
    novelty,
    temporalNovelty,
    stickiness,
    lossFunnel,
    causalBottleneck,
    unknownBreakdown,
    discoveryEfficiency: efficiency,
    discoveryStrategy: {
      page_policy: 'page_1_only',
      dimension_leverage: DIMENSION_LEVERAGE_RANKING,
      adaptive_note:
        'Prefer query/category/seed rotation. Page depth disabled by default (FACT page>=2 novelty≈0). Enable via HUNTER_ADAPTIVE_DISCOVERY=1 or experiment multi_axis_rotation.',
    },
    sourceExpansion: getSourceExpansionArchitecture(),
    reconciliation,
    labelAvailability,
    dataQuality: dq,
    identityBreakdown,
    identityStrengthBreakdown,
    answers: {
      A_universe_breadth: {
        discovered: novelty.discovered_count,
        unique_urls: novelty.unique_url_count,
        unique_identities: novelty.unique_identity_count,
        unique_products: productIds.size || novelty.unique_product_count,
        unique_listings: listingIds.size,
        repeat_url_rate: novelty.repeat_url_rate,
        repeat_identity_rate: novelty.repeat_identity_rate,
        jaccard_vs_7d: temporalNovelty?.jaccard_7d ?? novelty.jaccard_vs_7d,
        novelty_24h: temporalNovelty?.novelty_24h ?? null,
        novelty_7d: temporalNovelty?.novelty_7d ?? null,
        sticky,
        identityBreakdown,
        identityStrengthBreakdown,
        note: sticky
          ? 'Discovery sticky (high repeat / concentration). Root: fixed surfaces + page_1 inventory, not topK.'
          : 'Variedad medible o baseline insuficiente.',
      },
      B_good_candidates_lost: {
        would_insert: sep.WOULD_INSERT + sep.INSERTED,
        labeled_good_among_rejected: lossFunnel.humanGroundTruth.goodAmongRejected,
        labeled_bad_among_rejected: lossFunnel.humanGroundTruth.badAmongRejected,
        false_negatives: lossFunnel.humanGroundTruth.falseNegative,
        labelStatus: labelAvailability.status,
        note: labelAvailability.note,
      },
      C_bottleneck: {
        primary,
        ranked,
        causal_primary: causalBottleneck.primary_bottleneck,
        unknown_paths: unknownBreakdown.by_path,
        note: 'Primary = largest loss bucket. Causal stage report attached. No policy change to 25%/topK/diversity/NM.',
      },
      D_discovered_even_if_rejected: novelty.discovered_count,
      E_good_lost_proxy:
        labelAvailability.status === 'BLOCKED'
          ? 0
          : lossFunnel.humanGroundTruth.falseNegative ||
            lossFunnel.humanGroundTruth.goodAmongRejected,
      F_quantified_losses: sep,
      G_zero_silent_drops: {
        ok: reconciliation.ok,
        gap: reconciliation.gap,
        note: reconciliation.note,
      },
      H_variety_without_money: {
        observation_only: true,
        novelty_engine: true,
        experiment_shadow: true,
        money_path_untouched: true,
      },
    },
  };
}
