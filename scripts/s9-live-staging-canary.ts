/**
 * S9 LIVE STAGING CANARY — one-shot N≤5.
 *
 * Usage:
 *   npx tsx scripts/s9-live-staging-canary.ts           # dry only
 *   npx tsx scripts/s9-live-staging-canary.ts --execute # live writes
 *
 * Process-scoped flags only. Never leave SUPPLY_AUTOMATION / MACHINE_WRITES ON.
 * Never production. Never Distribution/Rewards/Settlement/Money unfreeze.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  automationCandidatesFromHunterResult,
  runSupplyAutomation,
  type SupplyAutomationCandidate,
  type SupplyAutomationResult,
} from '@/lib/supply/automation';
import { normalizeHunterResult } from '@/lib/supply/hunterBenchmark';
import {
  extractSupabaseProjectRef,
  isProductionSupabaseRef,
  isStagingSupabaseRef,
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
} from '@/lib/supabase/projectRefs';
import {
  isMoneyPathFrozen,
  isProductionRuntime,
} from '@/lib/server/moneyPathFreeze';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import {
  S71_SEED_AUTHOR_ID,
  assertDedicatedMachineAuthor,
} from '@/lib/bots/ingest/stagingSupplyWindow';
import { isDistributionEngineEnabled } from '@/lib/distribution/constants';
import { isSettlementBridgeEnabled } from '@/lib/economy/settlement/isSettlementBridgeEnabled';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { isSupplyAutomationEnabled } from '@/lib/supply/policy';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { evaluateSupplyPolicy } from '@/lib/supply/policy';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'scripts', '_s9_reports');
const AUTHOR_PATH = join(ROOT, 'scripts', '_s72_reports', 's72-author-latest.json');
const HARD_CAP = 5;

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const key = m[1].trim();
    if (process.env[key] == null) process.env[key] = v;
  }
}

function parseArgs(argv: string[]) {
  let execute = false;
  let cap = 2;
  for (const a of argv) {
    if (a === '--execute') execute = true;
    if (a.startsWith('--cap=')) {
      const n = Number(a.slice('--cap='.length));
      if (Number.isFinite(n)) cap = Math.max(1, Math.floor(n));
    }
  }
  return { execute, cap: Math.min(cap, HARD_CAP) };
}

function loadDedicatedAuthorId(): string | null {
  const fromEnv =
    process.env.S9_MACHINE_AUTHOR_ID?.trim() ||
    process.env.S72_MACHINE_AUTHOR_ID?.trim() ||
    process.env.BOT_INGEST_USER_ID?.trim() ||
    null;
  if (fromEnv) return fromEnv;
  if (!existsSync(AUTHOR_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(AUTHOR_PATH, 'utf8')) as {
      author?: { id?: string };
    };
    return raw.author?.id?.trim() || null;
  } catch {
    return null;
  }
}

type SurfaceCounts = {
  offersTotal: number | null;
  offersPending: number | null;
  offersApproved: number | null;
  offersRejected: number | null;
  distributionPublications: number | null;
  distributionEvents: number | null;
  creatorRewards: number | null;
  rewardOutboundClicks: number | null;
  economicLedger: number | null;
  affiliateLedger: number | null;
  attributionEvents: number | null;
  affiliateConversions: number | null;
  affiliateCommissions: number | null;
  errors: string[];
  na: string[];
};

async function countTable(
  sb: SupabaseClient,
  table: string,
): Promise<{ count: number | null; error: string | null; missing: boolean }> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    const msg = error.message ?? '';
    const missing =
      /does not exist|relation|schema cache|Could not find/i.test(msg) ||
      error.code === '42P01' ||
      error.code === 'PGRST205';
    return { count: null, error: msg, missing };
  }
  return { count: count ?? 0, error: null, missing: false };
}

async function countOffersByStatus(sb: SupabaseClient, status: string) {
  const { count, error } = await sb
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)
    .is('deleted_at', null);
  return { count: count ?? null, error: error?.message ?? null };
}

async function snapshotSurfaces(sb: SupabaseClient): Promise<SurfaceCounts> {
  const errors: string[] = [];
  const na: string[] = [];
  const take = async (label: string) => {
    const r = await countTable(sb, label);
    if (r.missing) {
      na.push(label);
      return null;
    }
    if (r.error) errors.push(`${label}:${r.error}`);
    return r.count;
  };

  const pending = await countOffersByStatus(sb, 'pending');
  const approved = await countOffersByStatus(sb, 'approved');
  const rejected = await countOffersByStatus(sb, 'rejected');
  if (pending.error) errors.push(`pending:${pending.error}`);
  if (approved.error) errors.push(`approved:${approved.error}`);
  if (rejected.error) errors.push(`rejected:${rejected.error}`);

  return {
    offersTotal: await take('offers'),
    offersPending: pending.count,
    offersApproved: approved.count,
    offersRejected: rejected.count,
    distributionPublications: await take('distribution_publications'),
    distributionEvents: await take('distribution_events'),
    creatorRewards: await take('creator_rewards'),
    rewardOutboundClicks: await take('reward_outbound_clicks'),
    economicLedger: await take('economic_ledger'),
    affiliateLedger: await take('affiliate_ledger'),
    attributionEvents: await take('attribution_events'),
    affiliateConversions: await take('affiliate_conversions'),
    affiliateCommissions: await take('affiliate_commissions'),
    errors,
    na,
  };
}

function deltaCounts(before: SurfaceCounts, after: SurfaceCounts) {
  const keys = [
    'offersTotal',
    'offersPending',
    'offersApproved',
    'offersRejected',
    'distributionPublications',
    'distributionEvents',
    'creatorRewards',
    'rewardOutboundClicks',
    'economicLedger',
    'affiliateLedger',
    'attributionEvents',
    'affiliateConversions',
    'affiliateCommissions',
  ] as const;
  const out: Record<string, number | null> = {};
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    out[k] = a != null && b != null ? b - a : null;
  }
  return out;
}

function buildHunterCandidates(cap: number, stamp: string): SupplyAutomationCandidate[] {
  const now = new Date().toISOString();
  // Unique numeric-looking ML ids per run to avoid fingerprint collisions
  const base = Number(stamp.slice(-8)) % 900000000;
  const rawCandidates = Array.from({ length: cap }, (_, i) => {
    const mlm = `MLM${base + i + 1}`;
    const url = `https://articulo.mercadolibre.com.mx/${mlm}-s9-live-canary-${stamp}-${i + 1}`;
    return {
      id: `s9-live-${stamp}-${i + 1}`,
      url,
      title: `S9 Live Canary Item ${i + 1} Bluetooth Headphones Premium`,
      price: { amount: 700 + i * 50, currency: 'MXN', provenance: 'listing_card' },
      originalPrice: {
        amount: 1800 + i * 100,
        currency: 'MXN',
        provenance: 'listing_card',
      },
      discoveredAt: now,
      metadata: {
        imageUrl: `https://http2.mlstatic.com/D_NQ_NP_2X_S9LIVE${i + 1}.jpg`,
      },
    };
  });

  const normalized = normalizeHunterResult({
    hunterId: 's9_live_canary_fixture',
    runId: `s9-live-${stamp}`,
    sourceId: 'aventa_supply',
    collectedAt: now,
    completedAt: now,
    payload: { ok: true, candidates: rawCandidates },
  });
  if (!normalized.ok) {
    throw new Error(`hunter_normalize_failed:${normalized.errors.join(',')}`);
  }

  return automationCandidatesFromHunterResult(normalized.result, { max: cap }).map(
    (c) => ({
      ...c,
      opportunity: {
        ...c.opportunity,
        imageUrl:
          c.opportunity.imageUrl ??
          'https://http2.mlstatic.com/D_NQ_NP_2X_S9LIVE.jpg',
        signals: {
          ...(c.opportunity.signals ?? {}),
          originalPriceProvenance: 'listing_card' as const,
          cardDiscountSource: 'card_strikethrough' as const,
          historyReady: true,
        },
      },
    }),
  );
}

function summarizeResult(r: SupplyAutomationResult) {
  return {
    runId: r.runId,
    mode: r.mode,
    metrics: r.metrics,
    decisionFingerprint: r.decisionFingerprint,
    outcomes: r.outcomes.map((o) => ({
      key: o.candidateKey,
      url: o.url,
      policyCode: o.policyDecision.code,
      policyReasons: o.policyDecision.reasons,
      finalCode: o.decision.code,
      s8Decision: o.policyDecision.s8Decision,
      s8Score: o.policyDecision.s8Score,
      s8Confidence: o.policyDecision.s8Confidence,
      writeAttempted: o.writeAttempted,
      writeSuccess: o.writeSuccess,
      offerId: o.offerId,
      writeError: o.writeError,
      duplicateKind: o.duplicateKind,
      fingerprint: o.evaluation?.productFingerprint ?? null,
      provenance: o.evaluation
        ? {
            sale: o.evaluation.evidence.salePrice,
            reference: o.evaluation.evidence.referencePrice,
            hasImage: o.evaluation.evidence.hasImage,
            evidenceLevel: o.evaluation.evidence.evidenceLevel,
          }
        : null,
    })),
  };
}

function flagSnapshot() {
  return {
    SUPPLY_AUTOMATION_ENABLED: process.env.SUPPLY_AUTOMATION_ENABLED ?? '(unset)',
    BOT_INGEST_MACHINE_PENDING_WRITES:
      process.env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '(unset)',
    machinePendingWritesEnabled: isMachinePendingWriteEnabled(),
    supplyAutomationEnabled: isSupplyAutomationEnabled(),
    DISTRIBUTION_ENGINE_ENABLED: process.env.DISTRIBUTION_ENGINE_ENABLED ?? '(unset)',
    distributionEngineEnabled: isDistributionEngineEnabled(),
    SETTLEMENT_BRIDGE_ENABLED: process.env.SETTLEMENT_BRIDGE_ENABLED ?? '(unset)',
    settlementBridgeEnabled: isSettlementBridgeEnabled(),
    MONEY_PATH_FROZEN: process.env.MONEY_PATH_FROZEN ?? '(unset)',
    moneyPathFrozen: isMoneyPathFrozen(),
    REWARDS_PROGRAM_ACTIVE: process.env.REWARDS_PROGRAM_ACTIVE ?? '(unset)',
    rewardsActive: isRewardsProgramActive(),
    COMMISSION_PROGRAM_ACTIVE: process.env.COMMISSION_PROGRAM_ACTIVE ?? '(unset)',
    commissionActive: isCommissionProgramPubliclyActive(),
  };
}

async function main() {
  const { execute, cap } = parseArgs(process.argv.slice(2));
  const stamp = String(Date.now());
  const runId = `s9-live-${stamp}`;

  loadEnvFile(join(ROOT, '.env.local'));
  loadEnvFile(join(ROOT, '.env'));

  // Fail-closed money freeze for this process (do not unfreeze)
  if (!process.env.MONEY_PATH_FROZEN) {
    process.env.MONEY_PATH_FROZEN = 'true';
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    '';
  const ref = extractSupabaseProjectRef(url);
  const target = (process.env.AVENTA_SUPABASE_TARGET ?? '').trim().toLowerCase();
  const expected =
    (process.env.AVENTA_EXPECTED_SUPABASE_REF ?? '').trim() || STAGING_SUPABASE_REF;

  const authorId = loadDedicatedAuthorId();
  const authorCheck = authorId
    ? assertDedicatedMachineAuthor(authorId)
    : { ok: false, reason: 'missing_dedicated_author' };

  mkdirSync(OUT_DIR, { recursive: true });

  const phase0 = {
    branch: 'staging', // verified externally
    target,
    supabaseRef: ref,
    expectedRef: expected,
    stagingRefOk: isStagingSupabaseRef(ref) && ref === expected,
    productionRefForbidden: PRODUCTION_SUPABASE_REF,
    isProductionRef: isProductionSupabaseRef(ref),
    productionRuntime: isProductionRuntime(),
    hasServiceRole: Boolean(key),
    authorId,
    authorIdPrefix: authorId?.slice(0, 8) ?? null,
    authorOk: authorCheck.ok,
    authorReason: authorCheck.reason,
    seedAuthor: S71_SEED_AUTHOR_ID,
    isSeedAuthor: authorId === S71_SEED_AUTHOR_ID,
    flagsBeforeEnable: flagSnapshot(),
    machineWritesAlreadyOn: isMachinePendingWriteEnabled(),
    distributionAlreadyOn: isDistributionEngineEnabled(),
    settlementAlreadyOn: isSettlementBridgeEnabled(),
    rewardsAlreadyOn: isRewardsProgramActive(),
    commissionAlreadyOn: isCommissionProgramPubliclyActive(),
    moneyFrozen: isMoneyPathFrozen(),
  };

  const abort = (reason: string, extra?: Record<string, unknown>) => {
    const report = {
      ok: false,
      phase: 'phase0_abort',
      reason,
      phase0,
      ...extra,
      at: new Date().toISOString(),
    };
    writeFileSync(
      join(OUT_DIR, 's9-live-staging-canary-latest.json'),
      JSON.stringify(report, null, 2),
    );
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  };

  if (phase0.productionRuntime) abort('production_runtime_forbidden');
  if (target !== 'staging') abort('target_not_staging');
  if (!phase0.stagingRefOk) abort('supabase_ref_not_staging');
  if (phase0.isProductionRef) abort('production_supabase_ref_forbidden');
  if (!url || !key) abort('missing_supabase_credentials');
  if (phase0.machineWritesAlreadyOn) abort('machine_writes_already_on');
  if (phase0.distributionAlreadyOn) abort('distribution_already_on');
  if (phase0.settlementAlreadyOn) abort('settlement_already_on');
  if (phase0.rewardsAlreadyOn) abort('rewards_already_on');
  if (phase0.commissionAlreadyOn) abort('commission_already_on');
  if (!phase0.moneyFrozen) abort('money_path_not_frozen');
  if (!authorCheck.ok || !authorId) abort('dedicated_author_required', { authorCheck });
  if (phase0.isSeedAuthor) abort('seed_admin_author_forbidden');

  // Process-scoped author (never persist to .env.local from this script)
  process.env.BOT_INGEST_USER_ID = authorId;

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authUser, error: authErr } = await sb.auth.admin.getUserById(authorId);
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('id, display_name, username, role')
    .eq('id', authorId)
    .maybeSingle();

  if (authErr || !authUser?.user) {
    abort('author_auth_lookup_failed', {
      authErr: authErr?.message ?? null,
    });
  }
  if (profileErr || !profile) {
    abort('author_profile_missing', { profileErr: profileErr?.message ?? null });
  }
  const role = String((profile as { role?: string }).role ?? '');
  if (role !== 'user') {
    abort('author_role_not_user', { role });
  }

  const authorVerified = {
    id: authorId,
    idPrefix: authorId.slice(0, 8),
    role,
    display_name: (profile as { display_name?: string }).display_name ?? null,
    username: (profile as { username?: string }).username ?? null,
    distinctFromSeed: authorId !== S71_SEED_AUTHOR_ID,
  };

  // PHASE 1 — baseline
  const baseline = await snapshotSurfaces(sb);

  // PHASE 2 — candidates via HunterResult → S8 (orchestrator evaluates)
  const candidates = buildHunterCandidates(cap, stamp);

  // Process-scoped S9 enable for dry + live of this canary only
  const prevS9 = process.env.SUPPLY_AUTOMATION_ENABLED;
  process.env.SUPPLY_AUTOMATION_ENABLED = 'true';

  let dry: SupplyAutomationResult | null = null;
  let live: SupplyAutomationResult | null = null;
  let retry: SupplyAutomationResult | null = null;
  let afterLive: SurfaceCounts | null = null;
  let afterRetry: SurfaceCounts | null = null;
  let offerVerifications: unknown[] = [];
  let failureTests: unknown = null;
  let anomaly: string | null = null;

  try {
    // PHASE 3 — dry-run
    dry = await runSupplyAutomation({
      runId: `${runId}-dry`,
      mode: 'dry_run',
      candidates,
      cliCap: cap,
      skipAdapterFetch: true,
    });

    const eligibleDry = dry.outcomes.filter((o) => o.policyDecision.code === 'ELIGIBLE');
    if (eligibleDry.length === 0) {
      abort('dry_run_zero_eligible', { dry: summarizeResult(dry) });
    }
    if (eligibleDry.length > HARD_CAP) {
      abort('dry_run_exceeds_hard_cap', { dry: summarizeResult(dry) });
    }

    if (!execute) {
      const report = {
        ok: true,
        mode: 'dry_run_only',
        phase0,
        authorVerified,
        baseline,
        candidates: candidates.map((c) => ({
          key: c.candidateKey,
          url: c.opportunity.url,
          sourceId: c.sourceId,
        })),
        dry: summarizeResult(dry),
        note: 'Re-run with --execute for live writes',
        flagsFinal: flagSnapshot(),
        at: new Date().toISOString(),
      };
      writeFileSync(
        join(OUT_DIR, 's9-live-staging-canary-latest.json'),
        JSON.stringify(report, null, 2),
      );
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // PHASE 5 — live write (S7 flag only inside withMachinePendingWritesEnabled)
    live = await runSupplyAutomation({
      runId: `${runId}-live`,
      mode: 'execute',
      candidates,
      cliCap: cap,
      skipAdapterFetch: true,
    });

    // PHASE 4 equivalence
    const dryLiveMatch =
      dry.decisionFingerprint === live.decisionFingerprint;

    if (!dryLiveMatch) {
      anomaly = 'dry_live_fingerprint_mismatch';
    }

    const writeSuccess = live.outcomes.filter((o) => o.writeSuccess);
    const n = writeSuccess.length;

    if (n === 0) {
      anomaly = anomaly ?? 'zero_successful_writes';
    }
    if (n > HARD_CAP) {
      anomaly = 'writes_exceed_hard_cap';
    }

    // PHASE 6 — verify each insert
    for (const o of writeSuccess) {
      if (!o.offerId) continue;
      const { data: row, error } = await sb
        .from('offers')
        .select(
          'id, status, created_by, offer_url, original_offer_url, image_url, product_fingerprint, bot_meta, locked_by, moderator_comment',
        )
        .eq('id', o.offerId)
        .maybeSingle();
      offerVerifications.push({
        offerId: o.offerId,
        lookupError: error?.message ?? null,
        row,
        expectedCreatedBy: authorId,
        createdByOk: row?.created_by === authorId,
        statusOk: row?.status === 'pending',
        notSeed: row?.created_by !== S71_SEED_AUTHOR_ID,
        hasImage: Boolean(row?.image_url),
        hasUrl: Boolean(row?.offer_url),
        fingerprint: row?.product_fingerprint ?? null,
        policyCode: o.policyDecision.code,
        s8Decision: o.policyDecision.s8Decision,
        s8Score: o.policyDecision.s8Score,
      });
      if (!row || row.status !== 'pending' || row.created_by !== authorId) {
        anomaly = anomaly ?? 'offer_verification_failed';
      }
    }

    // PHASE 7 — deltas
    afterLive = await snapshotSurfaces(sb);
    const deltas = deltaCounts(baseline, afterLive);
    if (deltas.offersTotal != null && deltas.offersTotal !== n) {
      anomaly = anomaly ?? `offers_delta_mismatch:expected=${n}:got=${deltas.offersTotal}`;
    }
    if (deltas.offersPending != null && deltas.offersPending !== n) {
      anomaly = anomaly ?? `pending_delta_mismatch:expected=${n}:got=${deltas.offersPending}`;
    }
    const downstreamKeys = [
      'distributionPublications',
      'distributionEvents',
      'creatorRewards',
      'rewardOutboundClicks',
      'economicLedger',
      'affiliateLedger',
      'attributionEvents',
      'affiliateConversions',
      'affiliateCommissions',
    ] as const;
    for (const k of downstreamKeys) {
      if (deltas[k] != null && deltas[k] !== 0) {
        anomaly = anomaly ?? `unexpected_downstream_delta:${k}=${deltas[k]}`;
      }
    }

    // PHASE 8 — idempotency retry (one candidate)
    const retryCand = candidates.find((c) =>
      writeSuccess.some((w) => w.candidateKey === c.candidateKey),
    );
    if (retryCand && !anomaly) {
      retry = await runSupplyAutomation({
        runId: `${runId}-retry`,
        mode: 'execute',
        candidates: [retryCand],
        cliCap: 1,
        skipAdapterFetch: true,
      });
      const secondWrite = retry.outcomes.some((o) => o.writeSuccess);
      const fp =
        writeSuccess[0]?.evaluation?.productFingerprint ||
        strongProductFingerprintForUrl(retryCand.opportunity.url);
      let rowsForFingerprint: number | null = null;
      if (fp) {
        const { count } = await sb
          .from('offers')
          .select('id', { count: 'exact', head: true })
          .eq('product_fingerprint', fp)
          .is('deleted_at', null);
        rowsForFingerprint = count ?? null;
      }
      afterRetry = await snapshotSurfaces(sb);
      if (secondWrite) anomaly = 'idempotency_second_insert_created';
      if (rowsForFingerprint != null && rowsForFingerprint !== 1) {
        anomaly = anomaly ?? `fingerprint_row_count:${rowsForFingerprint}`;
      }
      (offerVerifications as unknown[]).push({
        idempotency: {
          candidateKey: retryCand.candidateKey,
          policyCode: retry.outcomes[0]?.policyDecision.code,
          finalCode: retry.outcomes[0]?.decision.code,
          writeSuccess: secondWrite,
          secondInsertCreated: secondWrite,
          rowsForFingerprint,
          fingerprint: fp,
        },
      });
    }

    // PHASE 9 — failure injection (no extra write window)
    const prevS9Fail = process.env.SUPPLY_AUTOMATION_ENABLED;
    process.env.SUPPLY_AUTOMATION_ENABLED = 'false';
    const failS9Off = evaluateSupplyPolicy({
      evaluation: dry.outcomes[0]?.evaluation ?? null,
      mode: 'execute',
      machinePendingWritesEnabled: true,
      env: process.env,
    });
    process.env.SUPPLY_AUTOMATION_ENABLED = 'true';
    const failS7Off = evaluateSupplyPolicy({
      evaluation: dry.outcomes[0]?.evaluation ?? null,
      mode: 'execute',
      machinePendingWritesEnabled: false,
      env: process.env,
    });
    const failInvalid = evaluateSupplyPolicy({
      evaluation: null,
      evaluationError: null,
      mode: 'dry_run',
      env: process.env,
    });
    // Cap: pretend writes already at cap
    const failCap = evaluateSupplyPolicy({
      evaluation: dry.outcomes[0]?.evaluation ?? null,
      mode: 'dry_run',
      writesUsedThisRun: HARD_CAP,
      env: process.env,
      cliCap: HARD_CAP,
    });
    process.env.SUPPLY_AUTOMATION_ENABLED = prevS9Fail ?? 'true';

    failureTests = {
      s9Off: failS9Off.code,
      s7Off: failS7Off.code,
      invalidCandidate: failInvalid.code,
      capExceeded: failCap.code,
      ok:
        failS9Off.code === 'S9_DISABLED' &&
        failS7Off.code === 'S7_WRITES_DISABLED' &&
        failInvalid.code === 'MALFORMED_INPUT' &&
        failCap.code === 'BUDGET_REJECTED',
    };

    const report = {
      ok: anomaly == null && dryLiveMatch && n > 0 && n <= HARD_CAP,
      campaign: 'S9_LIVE_STAGING_CANARY',
      runId,
      target: 'staging',
      supabaseRef: ref,
      productionRefUntouched: PRODUCTION_SUPABASE_REF,
      author: authorVerified,
      cap,
      hardCap: HARD_CAP,
      phase0,
      baseline,
      afterLive,
      afterRetry,
      deltas: afterLive ? deltaCounts(baseline, afterLive) : null,
      deltasAfterRetry:
        afterRetry && afterLive ? deltaCounts(afterLive, afterRetry) : null,
      candidates: candidates.map((c) => ({
        key: c.candidateKey,
        url: c.opportunity.url,
        sourceId: c.sourceId,
        hunterId: c.hunterId,
      })),
      dry: summarizeResult(dry),
      live: summarizeResult(live),
      dryLiveFingerprintMatch: dryLiveMatch,
      writeCount: n,
      offerVerifications,
      retry: retry ? summarizeResult(retry) : null,
      failureTests,
      anomaly,
      productionFirewall: {
        productionRuntime: false,
        productionRef: PRODUCTION_SUPABASE_REF,
        connectedRef: ref,
        productionUntouched: ref !== PRODUCTION_SUPABASE_REF,
      },
      at: new Date().toISOString(),
    };

    writeFileSync(
      join(OUT_DIR, 's9-live-staging-canary-latest.json'),
      JSON.stringify(report, null, 2),
    );
    writeFileSync(
      join(OUT_DIR, `s9-live-staging-canary-${stamp}.json`),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));

    if (anomaly) {
      process.exit(1);
    }
  } finally {
    // PHASE 10 — flag reset (physical)
    if (prevS9 === undefined) delete process.env.SUPPLY_AUTOMATION_ENABLED;
    else process.env.SUPPLY_AUTOMATION_ENABLED = prevS9;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    // Ensure downstream stay off
    process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';
    process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
    process.env.MONEY_PATH_FROZEN = 'true';

    const flagsFinal = flagSnapshot();
    const resetReport = {
      flagsFinal,
      supplyOff: !isSupplyAutomationEnabled(),
      machineWritesOff: !isMachinePendingWriteEnabled(),
      distributionOff: !isDistributionEngineEnabled(),
      settlementOff: !isSettlementBridgeEnabled(),
      rewardsOff: !isRewardsProgramActive(),
      commissionOff: !isCommissionProgramPubliclyActive(),
      moneyFrozen: isMoneyPathFrozen(),
    };
    writeFileSync(
      join(OUT_DIR, 's9-live-staging-canary-flags-final.json'),
      JSON.stringify(resetReport, null, 2),
    );
    console.error('\n[FLAG RESET]', JSON.stringify(resetReport, null, 2));

    if (
      !resetReport.supplyOff ||
      !resetReport.machineWritesOff ||
      !resetReport.distributionOff ||
      !resetReport.settlementOff ||
      !resetReport.rewardsOff ||
      !resetReport.commissionOff ||
      !resetReport.moneyFrozen
    ) {
      console.error('ABORT: flags not fully OFF/frozen after canary');
      process.exit(2);
    }
  }
}

main().catch((err) => {
  console.error('FATAL', err instanceof Error ? err.message : err);
  // Best-effort flag reset
  delete process.env.SUPPLY_AUTOMATION_ENABLED;
  delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
  process.exit(1);
});
