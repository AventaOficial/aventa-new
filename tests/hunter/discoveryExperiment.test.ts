/**
 * Hunter Discovery Experiment v1 — 18 mandatory cases.
 * Shadow only: never mints offers / insertIngestedOffer.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyWouldCutAnnotations,
  buildRotationPlan,
  classifyDiscountClass,
  classifyLabelOutcome,
  computeNovelProductRate,
  earlyPersistDiscoverySightings,
  emptyAxisBitmap,
  getDiscoveryExperimentCaps,
  getDiscoveryExperimentVariant,
  HUNTER_DISCOVERY_EVENTS_TABLE,
  HUNTER_DISCOVERY_EXPERIMENT_ID,
  HUNTER_HUMAN_DECISIONS,
  LAB_PRIMARY_LABELS,
  isHunterDiscoveryExperimentEnabled,
  jaccardOverlap,
  parseLabListFilters,
  persistDiscoveryEvents,
  productIdentityKey,
  repeatRate,
  rotateSubset,
} from '@/lib/hunter/candidateIntelligence';
import { toDiscoveryEventRow } from '@/lib/hunter/candidateIntelligence/persistDiscoveryEvents';

vi.mock('@/lib/hunter/candidateIntelligence/flags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hunter/candidateIntelligence/flags')>();
  return {
    ...actual,
    isHunterCandidateIntelligenceEnabled: () => true,
  };
});

function src(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function experimentModuleFiles(): string[] {
  const dir = join(process.cwd(), 'lib/hunter/candidateIntelligence');
  return readdirSync(dir)
    .filter(
      (f) =>
        /discovery|earlyPersist|discountClass|priceBand/i.test(f) && f.endsWith('.ts'),
    )
    .map((f) => join('lib/hunter/candidateIntelligence', f));
}

type InsertCall = { table: string; rows: unknown };
type UpsertCall = { table: string; rows: unknown; opts?: unknown };

function mockSupabase() {
  const inserts: InsertCall[] = [];
  const upserts: UpsertCall[] = [];
  const client = {
    from(table: string) {
      return {
        insert(rows: unknown) {
          inserts.push({ table, rows });
          return Promise.resolve({ error: null, data: rows });
        },
        upsert(rows: unknown, opts?: unknown) {
          upserts.push({ table, rows, opts });
          return Promise.resolve({ error: null, data: rows });
        },
      };
    },
  };
  return { client: client as never, inserts, upserts };
}

describe('Discovery Experiment — flags', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('1. Flag OFF → zero experiment writes', async () => {
    process.env.HUNTER_DISCOVERY_EXPERIMENT = '0';
    expect(isHunterDiscoveryExperimentEnabled()).toBe(false);
    const { client, inserts, upserts } = mockSupabase();
    const early = await earlyPersistDiscoverySightings({
      supabase: client,
      runId: 'run-off',
      sightings: [
        {
          canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM1',
          source: 'ml_worker',
          salePrice: 100,
          originalPrice: 200,
        },
      ],
      minDiscountPercent: 20,
    });
    expect(early.enabled).toBe(false);
    expect(early.eventsWritten).toBe(0);
    expect(early.candidatesWritten).toBe(0);
    const ev = await persistDiscoveryEvents(
      client,
      [
        {
          runId: 'run-off',
          experimentVariant: 'baseline_sticky',
          source: 'ml_worker',
          canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM1',
          axisBitmap: emptyAxisBitmap(),
        },
      ],
      { allowInTests: false },
    );
    expect(ev.written).toBe(0);
    expect(inserts.filter((i) => i.table === HUNTER_DISCOVERY_EVENTS_TABLE)).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });

  it('2. Flag OFF → golden baseline behavior (no offset / baseline caps)', () => {
    process.env.HUNTER_DISCOVERY_EXPERIMENT = '0';
    delete process.env.HUNTER_DISCOVERY_EXPERIMENT_VARIANT;
    expect(isHunterDiscoveryExperimentEnabled()).toBe(false);
    expect(getDiscoveryExperimentVariant()).toBe('baseline_sticky');
    const plan = buildRotationPlan({ variant: 'baseline_sticky', runIndex: 7 });
    expect(plan.pages).toEqual([1]);
    expect(plan.axisBitmap).toEqual(emptyAxisBitmap());
    const ml = src('lib/bots/ingest/discoverMercadoLibre.ts');
    // Evidence-based: page depth requires explicit HUNTER_DISCOVERY_ENABLE_PAGE_AXIS=1
    expect(ml).toMatch(/HUNTER_DISCOVERY_ENABLE_PAGE_AXIS/);
    expect(ml).toMatch(/page_1_only|page >= 2|enablePageAxis/);
    expect(ml).toMatch(/useExperimentDepth\s*\?\s*`&offset=\$\{offset\}`\s*:\s*''/);
  });
});

describe('Discovery Experiment — persist + early', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.HUNTER_DISCOVERY_EXPERIMENT = '1';
    process.env.HUNTER_DISCOVERY_EXPERIMENT_VARIANT = 'baseline_sticky';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('3. Flag ON → append discovery events', async () => {
    const { client, inserts } = mockSupabase();
    const res = await persistDiscoveryEvents(
      client,
      [
        {
          runId: 'run-a',
          experimentVariant: 'baseline_sticky',
          source: 'ml_worker',
          canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM100',
          discountClass: 'DISCOUNT_REAL_GOOD',
          axisBitmap: emptyAxisBitmap(),
        },
      ],
      { allowInTests: true, force: true },
    );
    expect(res.ok).toBe(true);
    expect(res.written).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.table).toBe(HUNTER_DISCOVERY_EVENTS_TABLE);
    const row = (inserts[0]!.rows as Record<string, unknown>[])[0]!;
    expect(row.experiment_id).toBe(HUNTER_DISCOVERY_EXPERIMENT_ID);
    expect(row.run_id).toBe('run-a');
  });

  it('4. Same URL two runs → two candidate rows, >=2 events', async () => {
    const { client, inserts, upserts } = mockSupabase();
    const sighting = {
      canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM200',
      source: 'ml_worker' as const,
      salePrice: 400,
      originalPrice: 800,
      discountPct: 50,
    };
    await earlyPersistDiscoverySightings({
      supabase: client,
      runId: 'run-1',
      sightings: [sighting],
      minDiscountPercent: 20,
      allowInTests: true,
    });
    await earlyPersistDiscoverySightings({
      supabase: client,
      runId: 'run-2',
      sightings: [sighting],
      minDiscountPercent: 20,
      allowInTests: true,
    });
    const eventInserts = inserts.filter((i) => i.table === HUNTER_DISCOVERY_EVENTS_TABLE);
    expect(eventInserts.length).toBeGreaterThanOrEqual(2);
    const eventCount = eventInserts.reduce(
      (n, i) => n + (Array.isArray(i.rows) ? i.rows.length : 1),
      0,
    );
    expect(eventCount).toBeGreaterThanOrEqual(2);
    expect(upserts.length).toBeGreaterThanOrEqual(2);
    const runIds = upserts.flatMap((u) =>
      (Array.isArray(u.rows) ? u.rows : [u.rows]).map(
        (r) => (r as { run_id: string }).run_id,
      ),
    );
    expect(runIds).toContain('run-1');
    expect(runIds).toContain('run-2');
  });

  it('5. Same URL twice same run → one candidate row, multiple events', async () => {
    const { client, inserts, upserts } = mockSupabase();
    const url = 'https://www.mercadolibre.com.mx/x/p/MLM300';
    const early = await earlyPersistDiscoverySightings({
      supabase: client,
      runId: 'run-same',
      sightings: [
        { canonicalUrl: url, source: 'ml_worker', salePrice: 100, originalPrice: 200 },
        { canonicalUrl: url, source: 'ml_worker', salePrice: 90, originalPrice: 200 },
      ],
      minDiscountPercent: 20,
      allowInTests: true,
    });
    expect(early.eventsWritten).toBe(2);
    expect(early.candidatesWritten).toBe(1);
    const eventRows = inserts
      .filter((i) => i.table === HUNTER_DISCOVERY_EVENTS_TABLE)
      .flatMap((i) => (Array.isArray(i.rows) ? i.rows : [i.rows]));
    expect(eventRows).toHaveLength(2);
    expect(upserts).toHaveLength(1);
    const cand = (upserts[0]!.rows as Record<string, unknown>[])[0]!;
    expect(cand.discovery_count_in_run).toBe(2);
    expect(cand.first_price_sale).toBe(100);
    expect(cand.last_price_sale).toBe(90);
  });

  it('6. Early persistence survives discount rejection (DISCOVERED pre-gate)', async () => {
    const { client, upserts } = mockSupabase();
    const early = await earlyPersistDiscoverySightings({
      supabase: client,
      runId: 'run-disc',
      sightings: [
        {
          canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM400',
          source: 'ml_worker',
          salePrice: 190,
          originalPrice: 200,
          discountPct: 5,
        },
      ],
      minDiscountPercent: 20,
      allowInTests: true,
    });
    expect(early.eventsWritten).toBe(1);
    expect(early.candidatesWritten).toBe(1);
    const cand = (upserts[0]!.rows as Record<string, unknown>[])[0]!;
    expect(cand.decision).toBe('DISCOVERED');
    expect(cand.persisted_pre_gate).toBe(true);
    expect(cand.discount_class).toBe('DISCOUNT_REAL_LOW');
    expect(cand.reason_code).toBe('experiment_early_persist');
  });

  it('7. DISCOUNT_UNKNOWN does not become productively rejected', async () => {
    const { client, upserts, inserts } = mockSupabase();
    await earlyPersistDiscoverySightings({
      supabase: client,
      runId: 'run-unk',
      sightings: [
        {
          canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM500',
          source: 'ml_worker',
          salePrice: 150,
          originalPrice: null,
          discountPct: null,
        },
      ],
      minDiscountPercent: 20,
      allowInTests: true,
    });
    const cand = (upserts[0]!.rows as Record<string, unknown>[])[0]!;
    expect(cand.discount_class).toBe('DISCOUNT_UNKNOWN');
    expect(cand.decision).toBe('DISCOVERED');
    expect(String(cand.decision)).not.toMatch(/^REJECTED_/);
    const ev = (
      inserts.find((i) => i.table === HUNTER_DISCOVERY_EVENTS_TABLE)!.rows as Record<
        string,
        unknown
      >[]
    )[0]!;
    expect(ev.discount_class).toBe('DISCOUNT_UNKNOWN');
  });
});

describe('Discovery Experiment — classification + simulation', () => {
  it('8. discount_class classification v2', () => {
    expect(
      classifyDiscountClass({
        salePrice: null,
        originalPrice: 100,
        minDiscountPercent: 20,
      }),
    ).toBe('DISCOUNT_MISSING_PRICE');
    expect(
      classifyDiscountClass({
        salePrice: 80,
        originalPrice: null,
        minDiscountPercent: 20,
      }),
    ).toBe('DISCOUNT_UNKNOWN');
    expect(
      classifyDiscountClass({
        salePrice: 100,
        originalPrice: 100,
        minDiscountPercent: 20,
      }),
    ).toBe('DISCOUNT_REAL_LOW');
    expect(
      classifyDiscountClass({
        salePrice: 90,
        originalPrice: 100,
        discountPct: 10,
        minDiscountPercent: 20,
      }),
    ).toBe('DISCOUNT_REAL_LOW');
    expect(
      classifyDiscountClass({
        salePrice: 50,
        originalPrice: 100,
        discountPct: 50,
        minDiscountPercent: 20,
      }),
    ).toBe('DISCOUNT_REAL_GOOD');
  });

  it('9. topK simulation does not delete event', () => {
    const annotated = applyWouldCutAnnotations(
      [
        {
          runId: 'r',
          candidateKey: 'k',
          source: 'ml_worker',
          retailer: null,
          sourceUrl: 'https://www.mercadolibre.com.mx/x/p/A',
          canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/A',
          title: null,
          description: null,
          imageUrl: null,
          seller: null,
          brand: null,
          category: null,
          subcategory: null,
          originalPrice: null,
          salePrice: null,
          discountPercentage: null,
          coupon: null,
          shippingCost: null,
          currency: 'MXN',
          availability: null,
          sellerRating: null,
          productRating: null,
          reviewCount: null,
          productFingerprint: null,
          duplicateOf: null,
          duplicateClusterId: null,
          hunterScore: null,
          scoreBreakdown: {},
          scoreExplanation: [],
          dqeQualification: null,
          machineQualityDecision: null,
          reasonCodes: [],
          decision: 'DISCOVERED',
          reasonCode: 'x',
          reasonDetail: null,
          rejectionStage: 'discovery',
          evidence: {},
          rawMetadata: {},
          negativeMemoryLevel: null,
          insertedOfferId: null,
          affiliateStatus: null,
          discoveredAt: new Date().toISOString(),
          hunterVersion: 't',
          normalizationVersion: 't',
          scoringVersion: 't',
          decisionPolicyVersion: 't',
        },
      ],
      { topKUrls: new Set(['https://www.mercadolibre.com.mx/x/p/A']) },
    );
    expect(annotated).toHaveLength(1);
    expect(annotated[0]!.wouldTopkCut).toBe(true);
    expect(annotated[0]!.decision).toBe('DISCOVERED');
  });

  it('10. diversity simulation does not delete event', () => {
    const annotated = applyWouldCutAnnotations(
      [
        {
          runId: 'r',
          candidateKey: 'k2',
          source: 'ml_worker',
          retailer: null,
          sourceUrl: 'https://www.mercadolibre.com.mx/x/p/B',
          canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/B',
          title: null,
          description: null,
          imageUrl: null,
          seller: null,
          brand: null,
          category: null,
          subcategory: null,
          originalPrice: null,
          salePrice: null,
          discountPercentage: null,
          coupon: null,
          shippingCost: null,
          currency: 'MXN',
          availability: null,
          sellerRating: null,
          productRating: null,
          reviewCount: null,
          productFingerprint: null,
          duplicateOf: null,
          duplicateClusterId: null,
          hunterScore: null,
          scoreBreakdown: {},
          scoreExplanation: [],
          dqeQualification: null,
          machineQualityDecision: null,
          reasonCodes: [],
          decision: 'DISCOVERED',
          reasonCode: 'x',
          reasonDetail: null,
          rejectionStage: 'discovery',
          evidence: {},
          rawMetadata: {},
          negativeMemoryLevel: null,
          insertedOfferId: null,
          affiliateStatus: null,
          discoveredAt: new Date().toISOString(),
          hunterVersion: 't',
          normalizationVersion: 't',
          scoringVersion: 't',
          decisionPolicyVersion: 't',
        },
      ],
      { diversityUrls: new Set(['https://www.mercadolibre.com.mx/x/p/B']) },
    );
    expect(annotated).toHaveLength(1);
    expect(annotated[0]!.wouldDiversityCut).toBe(true);
    expect(annotated[0]!.canonicalUrl).toBe('https://www.mercadolibre.com.mx/x/p/B');
  });
});

describe('Discovery Experiment — hard wall (no offers / mint)', () => {
  it('11. No experiment path calls insertIngestedOffer (static guard)', () => {
    const callOrImport =
      /(?:from\s+['"][^'"]*insertIngestedOffer['"]|^\s*import\s+[^;]*insertIngestedOffer|insertIngestedOffer\s*\()/m;
    for (const rel of experimentModuleFiles()) {
      const text = src(rel);
      expect(text, rel).not.toMatch(callOrImport);
    }
    const publicApi = src('lib/hunter/candidateIntelligence/discoveryExperimentPublic.ts');
    expect(publicApi).not.toMatch(callOrImport);
    expect(publicApi).not.toMatch(/writePendingViaS7Bridge/);
  });

  it('12. No experiment path writes offers', () => {
    for (const rel of [
      ...experimentModuleFiles(),
      'lib/hunter/candidateIntelligence/discoveryExperimentPublic.ts',
    ]) {
      const text = src(rel);
      expect(text, rel).not.toMatch(/\.from\(\s*['"]offers['"]\s*\)/);
      expect(text, rel).not.toMatch(/offers\.pending/);
      expect(text, rel).not.toMatch(/status:\s*['"]pending['"]/);
    }
    expect(src('lib/hunter/candidateIntelligence/persistDiscoveryEvents.ts')).toContain(
      HUNTER_DISCOVERY_EVENTS_TABLE,
    );
  });
});

describe('Discovery Experiment — metrics + rotation + 403', () => {
  it('13. NOVEL_PRODUCT_RATE fixture', () => {
    const rate = computeNovelProductRate({
      runIdentities: ['a', 'b', 'c', 'a'],
      historicalIdentities: new Set(['a', 'z']),
    });
    expect(rate.uniqueIdentities).toBe(3);
    expect(rate.novelIdentities).toBe(2);
    expect(rate.repeatedIdentities).toBe(1);
    expect(rate.novelProductRate).toBeCloseTo(2 / 3);
    expect(productIdentityKey({ productFingerprint: 'fp1' })).toBe('fp1');
    expect(repeatRate(10, 4)).toBeCloseTo(0.6);
  });

  it('14. Jaccard calculation', () => {
    expect(jaccardOverlap(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccardOverlap(new Set(['x']), new Set(['x']))).toBe(1);
    expect(jaccardOverlap([], [])).toBeNull();
  });

  it('15. axis_bitmap persisted', () => {
    const plan = buildRotationPlan({
      variant: 'multi_axis_rotation',
      runIndex: 1,
      env: {
        HUNTER_DISCOVERY_EXPERIMENT_MAX_PAGES: '3',
        HUNTER_DISCOVERY_EXPERIMENT_MAX_SEEDS: '5',
      } as NodeJS.ProcessEnv,
    });
    expect(plan.axisBitmap.page).toBe(false);
    expect(plan.pages).toEqual([1]);
    expect(plan.axisBitmap.seed).toBe(true);
    const row = toDiscoveryEventRow({
      runId: 'run-axis',
      experimentVariant: 'multi_axis_rotation',
      source: 'ml_worker',
      canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM600',
      axisBitmap: plan.axisBitmap,
      rotPage: 2,
    });
    expect(row.axis_bitmap).toEqual(plan.axisBitmap);
    expect(row.rot_page).toBe(2);
  });

  it('16. 403 circuit breaker', () => {
    const ml = src('lib/bots/ingest/discoverMercadoLibre.ts');
    expect(ml).toMatch(/experiment_403_abort/);
    expect(ml).toMatch(/HUNTER_DISCOVERY_EXPERIMENT_ABORT_403_RATE/);
    expect(ml).toMatch(/experiment403\s*\/\s*experimentCalls\s*>=\s*abort403Rate/);
  });

  it('17. rotation respects configured caps', () => {
    const caps = getDiscoveryExperimentCaps({
      HUNTER_DISCOVERY_EXPERIMENT_MAX_PAGES: '99',
      HUNTER_DISCOVERY_EXPERIMENT_MAX_IDS: '999',
      HUNTER_DISCOVERY_EXPERIMENT_MAX_SEEDS: '50',
      HUNTER_DISCOVERY_EXPERIMENT_ABORT_403_RATE: '2',
    } as NodeJS.ProcessEnv);
    expect(caps.maxPages).toBe(5);
    expect(caps.maxIds).toBe(200);
    expect(caps.maxSeeds).toBe(20);
    expect(caps.abort403Rate).toBe(1);

    const plan = buildRotationPlan({
      variant: 'multi_axis_rotation',
      runIndex: 0,
      env: {
        HUNTER_DISCOVERY_EXPERIMENT_MAX_PAGES: '2',
        HUNTER_DISCOVERY_EXPERIMENT_MAX_SEEDS: '3',
      } as NodeJS.ProcessEnv,
    });
    expect(plan.pages).toEqual([1]);
    expect(plan.axisBitmap.page).toBe(false);
    expect(plan.maxSeeds).toBe(3);
    const planWithPage = buildRotationPlan({
      variant: 'multi_axis_rotation',
      runIndex: 0,
      env: {
        HUNTER_DISCOVERY_EXPERIMENT_MAX_PAGES: '2',
        HUNTER_DISCOVERY_EXPERIMENT_MAX_SEEDS: '3',
        HUNTER_DISCOVERY_ENABLE_PAGE_AXIS: '1',
      } as NodeJS.ProcessEnv,
    });
    expect(planWithPage.pages).toEqual([1, 2]);
    expect(planWithPage.axisBitmap.page).toBe(true);
    expect(rotateSubset(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['b', 'c', 'd']);
  });

  it('18. Human labels remain compatible', () => {
    expect(LAB_PRIMARY_LABELS.GOOD).toBe('GOOD');
    expect(LAB_PRIMARY_LABELS.BAD).toBe('BAD');
    expect(LAB_PRIMARY_LABELS.UNCERTAIN).toBe('UNCERTAIN');
    expect(LAB_PRIMARY_LABELS.FALSE_NEGATIVE).toBe('FN');
    expect(LAB_PRIMARY_LABELS.FALSE_POSITIVE).toBe('FP');
    expect(HUNTER_HUMAN_DECISIONS).toContain('FALSE_POSITIVE');
    expect(
      classifyLabelOutcome({
        hunterDecision: 'REJECTED_SCORE',
        humanDecision: 'FALSE_NEGATIVE',
      }),
    ).toBe('false_negative');
    expect(
      classifyLabelOutcome({
        hunterDecision: 'WOULD_INSERT',
        humanDecision: 'FALSE_POSITIVE',
      }),
    ).toBe('false_positive');
    const f = parseLabListFilters(
      new URLSearchParams({
        run_id: 'r1',
        experiment_id: 'discovery_exp_v2',
        experiment_variant: 'baseline_sticky',
        discount_class: 'DISCOUNT_REAL_LOW',
        novelty: 'novel',
        rotation_axis: 'page',
        human_label: 'GOOD_DEAL',
      }),
    );
    expect(f).toMatchObject({
      experimentId: 'discovery_exp_v2',
      experimentVariant: 'baseline_sticky',
      discountClass: 'DISCOUNT_REAL_LOW',
      novelty: 'novel',
      rotationAxis: 'page',
      humanLabel: 'GOOD_DEAL',
    });
  });
});
