/**
 * Adaptive Discovery Scheduler — deterministic exploration / exploitation.
 *
 * Evidence-based policies (FACT from Discovery Experiment v1/v2):
 * - page >= 2 produced 0 new products on observed ML runs → PAGE_1_ONLY for ML
 * - novelty came from page-1 category/query variation → prioritize QUERY + CATEGORY + SEED
 * - sticky surfaces (fixed queries/seeds) drive 93.8% repeat → rotate families by clock
 *
 * Observation-only: never mints / publishes / pays.
 * Does NOT change 25% threshold, topK, diversity, NM, scoring weights.
 */

import {
  DEFAULT_ML_DISCOVERY_QUERIES,
  DEFAULT_ML_TECH_CATEGORY_IDS,
} from '@/lib/bots/ingest/config';
import { rotateSubset, type AxisBitmap, emptyAxisBitmap } from './discoveryRotation';
import {
  buildExplorationCategoryCatalog,
  buildExplorationQueryCatalog,
} from './queryFamilyCatalog';

export type DiscoveryDimension =
  | 'query'
  | 'category'
  | 'seed'
  | 'brand'
  | 'price_band'
  | 'page'
  | 'retailer'
  | 'product_type';

export type PageStrategy = 'page_1_only' | 'shallow_pages' | 'deep_pages';

export type DimensionLeverage = {
  dimension: DiscoveryDimension;
  /** Empirically ranked priority (1 = highest). */
  priority: number;
  marginal_unique_products_per_request: number | null;
  marginal_good_candidates_per_request: number | null;
  classification: 'FACT' | 'INFERENCE' | 'HYPOTHESIS';
  evidence: string;
  enabled: boolean;
};

/**
 * Ranked by measured evidence from prior experiment runs.
 * FACT: page depth ≈ 0 novelty → disabled for ML.
 * FACT: query/category variation on page 1 produced exclusive identities.
 */
export const DIMENSION_LEVERAGE_RANKING: DimensionLeverage[] = [
  {
    dimension: 'query',
    priority: 1,
    marginal_unique_products_per_request: null,
    marginal_good_candidates_per_request: null,
    classification: 'FACT',
    evidence:
      'Experiment v1/v2: novelty observed from page-1 query/seed variation; rotation produced exclusive identities.',
    enabled: true,
  },
  {
    dimension: 'category',
    priority: 2,
    marginal_unique_products_per_request: null,
    marginal_good_candidates_per_request: null,
    classification: 'FACT',
    evidence: 'Category highlights + cat rotation produced incremental identities vs sticky baseline.',
    enabled: true,
  },
  {
    dimension: 'seed',
    priority: 3,
    marginal_unique_products_per_request: null,
    marginal_good_candidates_per_request: null,
    classification: 'FACT',
    evidence: 'Worker seed rotation breaks total stickiness when enabled; breadth > depth.',
    enabled: true,
  },
  {
    dimension: 'price_band',
    priority: 4,
    marginal_unique_products_per_request: null,
    marginal_good_candidates_per_request: null,
    classification: 'HYPOTHESIS',
    evidence: 'Prepared axis; not yet measured in production windows.',
    enabled: false,
  },
  {
    dimension: 'brand',
    priority: 5,
    marginal_unique_products_per_request: null,
    marginal_good_candidates_per_request: null,
    classification: 'HYPOTHESIS',
    evidence: 'Prepared axis; not yet measured.',
    enabled: false,
  },
  {
    dimension: 'page',
    priority: 6,
    marginal_unique_products_per_request: 0,
    marginal_good_candidates_per_request: 0,
    classification: 'FACT',
    evidence: 'page >= 2 produced 0 new products in observed experiment runs.',
    enabled: false,
  },
  {
    dimension: 'retailer',
    priority: 7,
    marginal_unique_products_per_request: null,
    marginal_good_candidates_per_request: null,
    classification: 'INFERENCE',
    evidence: 'ML dominates; other retailers mostly NOT_CONFIGURED — expansion architecture separate.',
    enabled: false,
  },
  {
    dimension: 'product_type',
    priority: 8,
    marginal_unique_products_per_request: null,
    marginal_good_candidates_per_request: null,
    classification: 'HYPOTHESIS',
    evidence: 'Not instrumented as a first-class axis yet.',
    enabled: false,
  },
];

/**
 * Extra exploration queries — adaptive only (does not replace exploit defaults).
 * Built from niche profiles + wide anti-sticky catalog (60+).
 */
export const ML_EXPLORATION_QUERY_FAMILIES: readonly string[] = buildExplorationQueryCatalog();

/** Extra exploration categories (MLM) — adaptive only. */
export const ML_EXPLORATION_CATEGORY_IDS: readonly string[] = buildExplorationCategoryCatalog();

export type AdaptiveSearchCall = {
  kind: 'q' | 'cat' | 'hl';
  value: string;
  sort: string;
  /** Always 1 under page_1_only. */
  page: number;
  axis: 'exploit' | 'explore';
  dimension: DiscoveryDimension;
};

export type AdaptiveDiscoveryPlan = {
  source: 'mercadolibre_mx';
  pageStrategy: PageStrategy;
  pages: number[];
  exploitationShare: number;
  explorationShare: number;
  calls: AdaptiveSearchCall[];
  axisBitmap: AxisBitmap;
  runSlot: number;
  dayKey: string;
  leverage: DimensionLeverage[];
  note: string;
  classification: 'FACT' | 'INFERENCE';
};

export type SchedulerPersistedState = {
  dayKey: string;
  lastRunSlot: number;
  lastQueryOffset: number;
  lastCategoryOffset: number;
  lastSeedOffset: number;
  seenQueryKeys: string[];
  seenCategoryKeys: string[];
  updatedAt: string;
};

function dayKeyFromMs(ms: number, timeZone = 'America/Mexico_City'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** 15-minute slots — matches existing ingest rotation wave granularity. */
export function computeRunSlot(nowMs: number, slotMinutes = 15): number {
  return Math.floor(nowMs / (slotMinutes * 60_000));
}

/**
 * Build adaptive ML search plan.
 * Default pageStrategy = page_1_only (FACT).
 * exploitation: rotate through configured/default queries+cats
 * exploration: rotate through exploration families not in exploit set
 */
export function buildAdaptiveDiscoveryPlan(input: {
  nowMs?: number;
  runSlot?: number;
  /** Configured production queries (exploit). */
  exploitQueries?: readonly string[];
  exploitCategories?: readonly string[];
  exploreQueries?: readonly string[];
  exploreCategories?: readonly string[];
  /** 0–1 share of calls reserved for exploration. */
  explorationShare?: number;
  maxCalls?: number;
  trendingSort?: string;
  /** Prior persisted offsets — deterministic continue. */
  priorState?: Partial<SchedulerPersistedState> | null;
  /** Force page strategy override (ops only). Default page_1_only. */
  pageStrategy?: PageStrategy;
  maxPagesOverride?: number;
}): AdaptiveDiscoveryPlan {
  const nowMs = input.nowMs ?? Date.now();
  const runSlot = input.runSlot ?? computeRunSlot(nowMs);
  const dayKey = dayKeyFromMs(nowMs);
  const explorationShare = Math.min(0.5, Math.max(0, input.explorationShare ?? 0.3));
  const exploitationShare = 1 - explorationShare;
  const maxCalls = Math.max(4, Math.min(24, input.maxCalls ?? 14));
  const trendingSort = input.trendingSort || 'sold_quantity_desc';
  const relevanceSort = 'relevance';

  const pageStrategy = input.pageStrategy ?? 'page_1_only';
  const pages =
    pageStrategy === 'page_1_only'
      ? [1]
      : pageStrategy === 'shallow_pages'
        ? [1, 2].slice(0, Math.min(2, input.maxPagesOverride ?? 2))
        : Array.from({ length: Math.min(5, input.maxPagesOverride ?? 3) }, (_, i) => i + 1);

  const exploitQ =
    input.exploitQueries && input.exploitQueries.length > 0
      ? [...input.exploitQueries]
      : [...DEFAULT_ML_DISCOVERY_QUERIES];
  const exploitC =
    input.exploitCategories && input.exploitCategories.length > 0
      ? [...input.exploitCategories]
      : [...DEFAULT_ML_TECH_CATEGORY_IDS];
  const exploreQ = (input.exploreQueries ?? ML_EXPLORATION_QUERY_FAMILIES).filter(
    (q) => !exploitQ.includes(q),
  );
  const exploreC = (input.exploreCategories ?? ML_EXPLORATION_CATEGORY_IDS).filter(
    (c) => !exploitC.includes(c),
  );

  const queryOffset = input.priorState?.lastQueryOffset ?? runSlot;
  const categoryOffset = input.priorState?.lastCategoryOffset ?? runSlot * 2;
  const seedOffset = input.priorState?.lastSeedOffset ?? runSlot;

  const exploreBudget = Math.max(1, Math.round(maxCalls * explorationShare));
  const exploitBudget = Math.max(1, maxCalls - exploreBudget);

  const axisBitmap: AxisBitmap = {
    ...emptyAxisBitmap(),
    query: true,
    category: true,
    seed: true,
    page: pageStrategy !== 'page_1_only',
    brand: false,
    price_band: false,
  };

  const calls: AdaptiveSearchCall[] = [];

  // Exploitation: mix queries + categories, page 1 only
  const exploitQueries = rotateSubset(exploitQ, queryOffset, Math.ceil(exploitBudget * 0.55));
  const exploitCats = rotateSubset(exploitC, categoryOffset, Math.ceil(exploitBudget * 0.45));
  for (const q of exploitQueries) {
    if (calls.length >= exploitBudget) break;
    calls.push({
      kind: 'q',
      value: q,
      sort: runSlot % 2 === 0 ? trendingSort : relevanceSort,
      page: 1,
      axis: 'exploit',
      dimension: 'query',
    });
  }
  for (const c of exploitCats) {
    if (calls.length >= exploitBudget) break;
    calls.push({
      kind: 'cat',
      value: c,
      sort: relevanceSort,
      page: 1,
      axis: 'exploit',
      dimension: 'category',
    });
  }

  // Exploration: unused families
  const exploreQueries = rotateSubset(exploreQ, seedOffset + 7, Math.ceil(exploreBudget * 0.6));
  const exploreCats = rotateSubset(exploreC, seedOffset + 11, Math.ceil(exploreBudget * 0.4));
  for (const q of exploreQueries) {
    if (calls.length >= maxCalls) break;
    calls.push({
      kind: 'q',
      value: q,
      sort: relevanceSort,
      page: 1,
      axis: 'explore',
      dimension: 'query',
    });
  }
  for (const c of exploreCats) {
    if (calls.length >= maxCalls) break;
    calls.push({
      kind: 'cat',
      value: c,
      sort: relevanceSort,
      page: 1,
      axis: 'explore',
      dimension: 'category',
    });
  }

  return {
    source: 'mercadolibre_mx',
    pageStrategy,
    pages,
    exploitationShare,
    explorationShare,
    calls,
    axisBitmap,
    runSlot,
    dayKey,
    leverage: DIMENSION_LEVERAGE_RANKING,
    note:
      pageStrategy === 'page_1_only'
        ? 'Adaptive plan: page_1_only (FACT page>=2 novelty≈0). Exploit sticky families + explore unused query/category families.'
        : `Adaptive plan with pageStrategy=${pageStrategy} (override).`,
    classification: 'FACT',
  };
}

/** Next persisted cursor after a plan executes (no DB write here). */
export function nextSchedulerState(
  plan: AdaptiveDiscoveryPlan,
  prior?: Partial<SchedulerPersistedState> | null,
): SchedulerPersistedState {
  return {
    dayKey: plan.dayKey,
    lastRunSlot: plan.runSlot,
    lastQueryOffset: (prior?.lastQueryOffset ?? plan.runSlot) + plan.calls.filter((c) => c.kind === 'q').length,
    lastCategoryOffset:
      (prior?.lastCategoryOffset ?? plan.runSlot * 2) + plan.calls.filter((c) => c.kind === 'cat').length,
    lastSeedOffset: (prior?.lastSeedOffset ?? plan.runSlot) + 1,
    seenQueryKeys: [
      ...new Set([
        ...(prior?.seenQueryKeys ?? []).slice(-200),
        ...plan.calls.filter((c) => c.kind === 'q').map((c) => c.value),
      ]),
    ].slice(-200),
    seenCategoryKeys: [
      ...new Set([
        ...(prior?.seenCategoryKeys ?? []).slice(-200),
        ...plan.calls.filter((c) => c.kind === 'cat').map((c) => c.value),
      ]),
    ].slice(-200),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Parse ml sourceDetail into rotation metadata.
 * Formats:
 *   ml:q:laptop|sort:relevance|page:1|axis:exploit
 *   ml:cat:MLM1000|sort:relevance
 *   worker:playwright:seed:ofertas_hub|page:1
 */
export function parseDiscoverySourceDetail(sourceDetail: string | null | undefined): {
  kind: string | null;
  value: string | null;
  sort: string | null;
  page: number | null;
  axis: string | null;
  rotQuery: string | null;
  rotSeedId: string | null;
  rotCategoryId: string | null;
} {
  const raw = (sourceDetail ?? '').trim();
  if (!raw) {
    return {
      kind: null,
      value: null,
      sort: null,
      page: null,
      axis: null,
      rotQuery: null,
      rotSeedId: null,
      rotCategoryId: null,
    };
  }

  const parts = raw.split('|');
  const head = parts[0] ?? '';
  let kind: string | null = null;
  let value: string | null = null;
  const kv: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const i = p.indexOf(':');
    if (i > 0) kv[p.slice(0, i)] = p.slice(i + 1);
  }

  const ml = /^ml:(q|cat|hl):(.+)$/i.exec(head);
  if (ml) {
    kind = ml[1]!.toLowerCase();
    value = ml[2]!;
  }
  const worker = /^worker:(?:playwright:)?(?:seed:)?(.+)$/i.exec(head);
  if (worker && !ml) {
    kind = 'seed';
    value = worker[1]!;
  }

  const pageRaw = kv.page ?? kv.p;
  const page = pageRaw != null && pageRaw !== '' ? Number(pageRaw) : null;

  return {
    kind,
    value,
    sort: kv.sort ?? null,
    page: Number.isFinite(page) ? page : null,
    axis: kv.axis ?? null,
    rotQuery: kind === 'q' ? value : null,
    rotSeedId: kind === 'seed' ? value : kind === 'hl' ? `hl:${value}` : null,
    rotCategoryId: kind === 'cat' ? value : kind === 'hl' && value?.includes('MLM') ? value.split('|')[0] ?? value : null,
  };
}

/** Format sourceDetail with page + axis for telemetry. */
export function formatMlSourceDetail(call: {
  kind: string;
  value: string;
  sort: string;
  page?: number;
  axis?: string;
}): string {
  const page = call.page ?? 1;
  const axis = call.axis ?? 'exploit';
  return `ml:${call.kind}:${call.value}|sort:${call.sort}|page:${page}|axis:${axis}`;
}
