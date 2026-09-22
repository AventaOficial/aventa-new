/**
 * Hunter Discovery Experiment v2 — controlled A/B (+ shadow C/D dual-label).
 *
 * A = baseline_sticky
 * B = multi_axis_rotation
 * C/D = same runs with shadow taxonomy v2 (dual-labeled on every persist)
 *
 * Observation only. Never enables mint/publish/money.
 *
 * Usage:
 *   npx tsx scripts/hunter-discovery-experiment-v2.ts --env .env.production.local
 *   npx tsx scripts/hunter-discovery-experiment-v2.ts --env .env.production.local --variants A,B
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { runIngestCycleForProfile } from '../lib/bots/ingest/runIngestCycle';
import {
  aggregateDiscountPathStats,
  assertObservationOnlyEnv,
  assertZeroInsertAttempts,
  buildMissionControlReport,
  classifyDiscountEvidence,
  HUNTER_DISCOVERY_EXPERIMENT_ID,
  jaccardOverlap,
  productIdentityKey,
  summarizeOpportunities,
  type OpportunityRow,
} from '../lib/hunter/candidateIntelligence';
import { HUNTER_OFFER_CANDIDATES_TABLE } from '../lib/hunter/candidateIntelligence/persist';
import { HUNTER_DISCOVERY_EVENTS_TABLE } from '../lib/hunter/candidateIntelligence/persistDiscoveryEvents';

function loadEnvFile(path: string) {
  if (!existsSync(path)) throw new Error(`Env file not found: ${path}`);
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val === '[SENSITIVE]') continue;
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1]!;
}

type VariantLetter = 'A' | 'B';

function letterToEnv(letter: VariantLetter): {
  letter: VariantLetter;
  discoveryVariant: 'baseline_sticky' | 'multi_axis_rotation';
  label: string;
} {
  if (letter === 'B') {
    return {
      letter: 'B',
      discoveryVariant: 'multi_axis_rotation',
      label: 'B_rotation (+ shadow C/D labels)',
    };
  }
  return {
    letter: 'A',
    discoveryVariant: 'baseline_sticky',
    label: 'A_baseline (+ shadow C/D labels)',
  };
}

async function analyzeRun(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  letter: VariantLetter,
) {
  const { data: candidates, error: cErr } = await supabase
    .from(HUNTER_OFFER_CANDIDATES_TABLE)
    .select(
      'run_id,candidate_key,canonical_url,title,source,retailer,category,brand,sale_price,original_price,discount_percentage,discount_class,discount_class_v1,discount_confidence,discount_source,historical_price_confidence,price_evidence,decision,current_decision,hypothetical_decision,funnel_stage,funnel_reason,would_topk_cut,would_diversity_cut,rot_page,rot_seed_id,rot_category_id,rot_query,product_fingerprint,product_identifier,reason_detail,reason_code',
    )
    .eq('run_id', runId)
    .eq('experiment_id', HUNTER_DISCOVERY_EXPERIMENT_ID);

  if (cErr) throw new Error(`candidates query: ${cErr.message}`);

  const { data: events, error: eErr } = await supabase
    .from(HUNTER_DISCOVERY_EVENTS_TABLE)
    .select(
      'run_id,canonical_url,title,sale_price,original_price,discount_pct,discount_class,discount_class_v1,rot_page,rot_category_id,rot_seed_id,rot_query,retailer,source',
    )
    .eq('run_id', runId)
    .eq('experiment_id', HUNTER_DISCOVERY_EXPERIMENT_ID);

  if (eErr) throw new Error(`events query: ${eErr.message}`);

  const rows = candidates ?? [];
  const evs = events ?? [];

  const urls = new Set(rows.map((r) => String(r.canonical_url ?? '').toLowerCase()).filter(Boolean));
  const titles = new Set(
    rows.map((r) => String(r.title ?? '').trim().toLowerCase()).filter(Boolean),
  );
  const identities = new Set(
    rows.map((r) =>
      productIdentityKey({
        fingerprint: (r.product_fingerprint as string) ?? null,
        identifier: (r.product_identifier as string) ?? null,
        url: (r.canonical_url as string) ?? null,
        title: (r.title as string) ?? null,
      }),
    ),
  );

  const classCounts: Record<string, number> = {};
  const classV1Counts: Record<string, number> = {};
  const categoryUnknown: Record<string, number> = {};
  const retailerUnknown: Record<string, number> = {};
  const sourceGood: Record<string, number> = {};
  const pageDepth: Record<string, number> = {};
  const decisionCounts: Record<string, number> = {};
  const funnelCounts: Record<string, number> = {};

  const oppRows: OpportunityRow[] = [];
  const pathInputs: Array<{
    reason?: string | null;
    classification: ReturnType<typeof classifyDiscountEvidence>;
  }> = [];

  for (const r of rows) {
    const dc = String(r.discount_class ?? 'null');
    classCounts[dc] = (classCounts[dc] ?? 0) + 1;
    const v1 = String(r.discount_class_v1 ?? 'null');
    classV1Counts[v1] = (classV1Counts[v1] ?? 0) + 1;
    const dec = String(r.decision ?? 'null');
    decisionCounts[dec] = (decisionCounts[dec] ?? 0) + 1;
    const fs = String(r.funnel_stage ?? 'null');
    funnelCounts[fs] = (funnelCounts[fs] ?? 0) + 1;

    const page = r.rot_page == null ? 'page_unset' : `page_${r.rot_page}`;
    pageDepth[page] = (pageDepth[page] ?? 0) + 1;

    if (dc === 'DISCOUNT_UNKNOWN') {
      const cat = String(r.category ?? r.rot_category_id ?? 'unknown_category');
      categoryUnknown[cat] = (categoryUnknown[cat] ?? 0) + 1;
      const ret = String(r.retailer ?? 'unknown_retailer');
      retailerUnknown[ret] = (retailerUnknown[ret] ?? 0) + 1;
    }
    if (dc === 'DISCOUNT_REAL_GOOD') {
      const src = String(r.source ?? 'unknown');
      sourceGood[src] = (sourceGood[src] ?? 0) + 1;
    }

    const classified = classifyDiscountEvidence({
      salePrice: r.sale_price == null ? null : Number(r.sale_price),
      originalPrice: r.original_price == null ? null : Number(r.original_price),
      discountPct: r.discount_percentage == null ? null : Number(r.discount_percentage),
    });
    pathInputs.push({
      reason: (r.reason_detail as string) ?? (r.reason_code as string) ?? null,
      classification: classified,
    });

    const bucket =
      dc === 'DISCOUNT_REAL_LOW'
        ? 'REAL_LOW'
        : dc === 'DISCOUNT_UNKNOWN'
          ? 'UNKNOWN'
          : dc === 'DISCOUNT_INVALID'
            ? 'INVALID'
            : dc === 'DISCOUNT_MISSING_PRICE'
              ? 'MISSING_PRICE'
              : dc === 'DISCOUNT_REAL_GOOD'
                ? 'REAL_GOOD'
                : 'OTHER';

    oppRows.push({
      discountClass: (r.discount_class as OpportunityRow['discountClass']) ?? 'DISCOUNT_UNKNOWN',
      currentDecision: String(r.decision ?? r.current_decision ?? ''),
      hypotheticalDecision:
        (r.hypothetical_decision as OpportunityRow['hypotheticalDecision']) ?? 'SAME_AS_CURRENT',
      discountGateWasKiller:
        String(r.decision ?? '').includes('REJECTED_DISCOUNT') ||
        String(r.decision ?? '').includes('REJECTED_PRICE') ||
        String(r.current_decision ?? '').includes('REJECTED'),
      classBucket: bucket,
      funnelStage: (r.funnel_stage as string) ?? undefined,
    });
  }

  const opportunities = summarizeOpportunities(oppRows);
  const pathTable = aggregateDiscountPathStats(pathInputs);

  const wouldInsert = rows.filter((r) => r.decision === 'WOULD_INSERT').length;
  const topKCuts = rows.filter((r) => r.would_topk_cut === true).length;
  const diversityCuts = rows.filter((r) => r.would_diversity_cut === true).length;
  const page2Plus = rows.filter((r) => typeof r.rot_page === 'number' && r.rot_page >= 2).length;

  return {
    letter,
    shadowLabel: letter === 'A' ? 'C' : 'D',
    runId,
    events: evs.length,
    candidates: rows.length,
    uniqueUrls: urls.size,
    uniqueTitles: titles.size,
    uniqueIdentities: identities.size,
    discountClasses: classCounts,
    discountClassesV1: classV1Counts,
    decisions: decisionCounts,
    funnel: funnelCounts,
    wouldInsertCurrent: wouldInsert,
    topKCuts,
    diversityCuts,
    pageDepth,
    page2PlusCandidates: page2Plus,
    unknownByCategory: categoryUnknown,
    unknownByRetailer: retailerUnknown,
    realGoodBySource: sourceGood,
    opportunities,
    pathAuditTable: pathTable,
    identitySet: [...identities],
  };
}

async function main() {
  const envPath = resolve(process.cwd(), argValue('--env') ?? '.env.production.local');
  loadEnvFile(envPath);

  assertObservationOnlyEnv(process.env);

  process.env.HUNTER_CANDIDATE_INTELLIGENCE = '1';
  process.env.HUNTER_DISCOVERY_EXPERIMENT = '1';
  delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;

  const lettersRaw = (argValue('--variants') ?? 'A,B')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is VariantLetter => s === 'A' || s === 'B');

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const outDir = resolve(process.cwd(), 'tmp/discovery-exp-v2');
  mkdirSync(outDir, { recursive: true });

  const boot = {
    phase: 'discovery_exp_v2_boot',
    experimentId: HUNTER_DISCOVERY_EXPERIMENT_ID,
    envFile: envPath,
    variants: lettersRaw.map(letterToEnv),
    note: 'A/B = discovery variants; C/D = shadow taxonomy v2 dual-labeled on same runs',
    writes: process.env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '(unset=OFF)',
  };
  console.info(JSON.stringify(boot, null, 2));

  const analyses = [];
  for (const letter of lettersRaw) {
    const cfg = letterToEnv(letter);
    process.env.HUNTER_DISCOVERY_EXPERIMENT_VARIANT = cfg.discoveryVariant;
    console.info(`[exp-v2] running ${cfg.label}…`);
    const report = await runIngestCycleForProfile('standard');
    const runId =
      report.summary.candidateIntelligence?.runId ??
      createHash('sha1').update(`${Date.now()}-${letter}`).digest('hex').slice(0, 12);

    const analysis = await analyzeRun(supabase, runId, letter);
    analyses.push({
      ...analysis,
      ingestOk: report.ok,
      skipReasonCounts: report.summary.skipReasonCounts ?? null,
      stageCounts: report.summary.stageCounts ?? null,
      searchErrors: null,
    });
    writeFileSync(
      resolve(outDir, `run-${letter}-${runId}.json`),
      JSON.stringify(analyses[analyses.length - 1], null, 2),
    );
  }

  // Cross-variant identity novelty (A vs B)
  let rotationNovelty: Record<string, unknown> | null = null;
  if (analyses.length >= 2) {
    const a = analyses.find((x) => x.letter === 'A');
    const b = analyses.find((x) => x.letter === 'B');
    if (a && b) {
      const setA = new Set(a.identitySet);
      const setB = new Set(b.identitySet);
      const onlyB = [...setB].filter((id) => !setA.has(id));
      const onlyA = [...setA].filter((id) => !setB.has(id));
      const union = new Set([...setA, ...setB]);
      rotationNovelty = {
        baselineUnion: setA.size,
        rotationUnion: setB.size,
        combined: union.size,
        onlyRotation: onlyB.length,
        onlyBaseline: onlyA.length,
        jaccard: jaccardOverlap(setA, setB),
      };
    }
  }

  // Strip large identity sets from final summary
  const summaryRuns = analyses.map(({ identitySet: _i, ...rest }) => rest);

  const insertedWall = assertZeroInsertAttempts({
    insertedAttempted: 0,
    publishedAttempted: 0,
    rewardTouched: false,
  });
  if (!insertedWall.ok) {
    throw new Error(`[observation_boundary] ABORT mint wall: ${insertedWall.violations.join('; ')}`);
  }

  const missionCandidates = (await Promise.all(
    summaryRuns.map(async (r) => {
      const { data } = await supabase
        .from(HUNTER_OFFER_CANDIDATES_TABLE)
        .select(
          'run_id,canonical_url,source,category,decision,reason_code,reason_detail,discount_class,discount_percentage,funnel_stage,would_topk_cut,would_diversity_cut,diversity_cut,negative_memory_level,price_evidence,product_fingerprint,product_identifier,rot_query,rot_page,rot_seed_id,hunter_score',
        )
        .eq('run_id', r.runId)
        .limit(2000);
      return (data ?? []).map((row) => ({
        runId: row.run_id as string,
        canonicalUrl: row.canonical_url as string,
        source: row.source as string,
        category: row.category as string | null,
        decision: row.decision as string,
        reasonCode: row.reason_code as string | null,
        reasonDetail: row.reason_detail as string | null,
        discountClass: row.discount_class as string | null,
        discountPercentage: row.discount_percentage as number | null,
        funnelStage: row.funnel_stage as string | null,
        wouldTopkCut: row.would_topk_cut as boolean | null,
        wouldDiversityCut: row.would_diversity_cut as boolean | null,
        diversityCut: row.diversity_cut as boolean | null,
        negativeMemoryLevel: row.negative_memory_level as string | null,
        priceEvidence: row.price_evidence as Record<string, unknown> | null,
        productFingerprint: row.product_fingerprint as string | null,
        productIdentifier: row.product_identifier as string | null,
        rotQuery: row.rot_query as string | null,
        rotPage: row.rot_page as number | null,
        rotSeedId: row.rot_seed_id as string | null,
        hunterScore: row.hunter_score as number | null,
      }));
    }),
  )).flat();

  const missionControl = buildMissionControlReport({
    candidates: missionCandidates,
  });

  const final = {
    phase: 'discovery_exp_v2_done',
    experimentId: HUNTER_DISCOVERY_EXPERIMENT_ID,
    observationBoundary: insertedWall,
    insertedAttempted: 0,
    rotationNovelty,
    missionControl: {
      answers: missionControl.answers,
      novelty: missionControl.novelty,
      lossSeparated: missionControl.lossFunnel.separated,
      reconciliation: missionControl.reconciliation,
    },
    runs: summaryRuns,
    answersDraft: {
      q1_real_low_discarded: summaryRuns.map((r) => ({
        letter: r.letter,
        realLow: r.opportunities.realLow,
        wouldContinueIfGateOff: r.opportunities.wouldContinueByClass.REAL_LOW,
      })),
      q2_unknown_discarded: summaryRuns.map((r) => ({
        letter: r.letter,
        unknown: r.opportunities.unknown,
        wouldInsertIfUnknownPreserved: r.opportunities.wouldInsertIfUnknownPreserved,
      })),
      q3_better_price_evidence: summaryRuns.map((r) => ({
        letter: r.letter,
        unknown: r.opportunities.unknown,
        note: 'UNKNOWN count = universe discarded for lack of discount evidence (not good deals)',
      })),
      q4_topk_after_discount: summaryRuns.map((r) => ({
        letter: r.letter,
        topKCuts: r.topKCuts,
        funnelTopK: r.funnel.TOP_K ?? 0,
        funnelScore: r.funnel.SCORE ?? 0,
      })),
      q5_unknown_categories: summaryRuns.map((r) => r.unknownByCategory),
      q6_unknown_retailers: summaryRuns.map((r) => r.unknownByRetailer),
      q7_real_good_sources: summaryRuns.map((r) => r.realGoodBySource),
      q8_rotation_new_identities: rotationNovelty,
      q9_deep_pages: summaryRuns.map((r) => ({
        letter: r.letter,
        pageDepth: r.pageDepth,
        page2Plus: r.page2PlusCandidates,
      })),
      q10_bottleneck_hint: summaryRuns.map((r) => ({
        letter: r.letter,
        funnel: r.funnel,
        discountClasses: r.discountClasses,
        wouldInsert: r.wouldInsertCurrent,
      })),
    },
  };

  writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(final, null, 2));
  console.info(JSON.stringify(final, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
