/**
 * M4.1 — Payout Intent staging canary (stub provider only).
 * No real money. No execute_reward_payout. No deploy/push/cron.
 *
 *   npx tsx scripts/m4-1-payout-intent-staging-canary.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertWave3StagingOnly,
  restoreWave3FailClosedFlags,
  snapshotWave3Flags,
} from '@/lib/wave3';
import {
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
} from '@/lib/supabase/projectRefs';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import {
  reservePayoutIntent,
  submitPayoutIntent,
  reconcilePayoutIntent,
  confirmPayoutIntentSuccess,
  createStubPayoutProvider,
  buildPayoutIntentIdempotencyKey,
  PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN,
} from '@/lib/rewards/payoutIntent';

const M31_REWARD = '0e12ab0d-a285-46eb-90e4-e7ff7dac6146';
const CREATOR = 'fd392640-64f7-4daa-b2d6-1c85a9fa36e1';
const OUT = join(process.cwd(), 'scripts', '_m41_reports');
const TAG = `m41_canary_${Date.now()}`;

function loadEnv(path: string) {
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
    if (process.env[m[1].trim()] == null) process.env[m[1].trim()] = v;
  }
}

function client(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function countTable(sb: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    if (/does not exist|Could not find the table/i.test(error.message)) return null;
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function seedEligibleReward(
  sb: SupabaseClient,
  label: string,
): Promise<{ rewardId: string; ledgerId: string }> {
  const externalRef = `${TAG}_${label}`;
  const now = new Date().toISOString();
  const { data: ledger, error: lErr } = await sb
    .from('affiliate_ledger_entries')
    .insert({
      network: 'other',
      amount_cents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      status: 'accrued',
      external_ref: externalRef,
      notes: `M4.1 canary seed ${label}`,
      source: 'manual',
      meta: { m41_canary: true, label, tag: TAG },
      creator_id: CREATOR,
      attributable: true,
      attribution_method: 'manual',
      attribution_confidence: 'high',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (lErr || !ledger?.id) throw new Error(`ledger seed ${label}: ${lErr?.message}`);

  const { data: reward, error: rErr } = await sb
    .from('creator_rewards')
    .insert({
      creator_id: CREATOR,
      ledger_entry_id: ledger.id,
      network: 'other',
      gross_commission_cents: REWARDS_MIN_PAYOUT_CENTS,
      creator_share_cents: REWARDS_MIN_PAYOUT_CENTS,
      platform_share_cents: 0,
      creator_share_bps: 10000,
      currency: 'MXN',
      attribution_method: 'manual',
      attribution_confidence: 'high',
      status: 'AVAILABLE',
      hold_until: new Date(Date.now() - 86_400_000).toISOString(),
      available_at: now,
      meta: { m41_canary: true, label, tag: TAG },
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (rErr || !reward?.id) throw new Error(`reward seed ${label}: ${rErr?.message}`);
  if (reward.id === M31_REWARD) throw new Error('ABORT: accidentally touched M3.1 reward');
  return { rewardId: reward.id, ledgerId: ledger.id };
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';
  process.env.SUPPLY_AUTOMATION_ENABLED = 'false';
  process.env.BOT_INGEST_MACHINE_PENDING_WRITES = 'false';
  // Process-scoped unfreeze for canary only
  process.env.MONEY_PATH_FROZEN = 'false';

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'm4-1-payout-intent-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M4.1_payout_intent_foundation',
    tag: TAG,
    flagsBefore: snapshotWave3Flags(),
    doNotTouchReward: M31_REWARD,
  };

  const guard = assertWave3StagingOnly(process.env);
  report.guard = guard;
  if (!guard.ok) {
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  if (!url.includes(STAGING_SUPABASE_REF) || !key) {
    report.reason = 'staging_credentials_missing';
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const sb = client(url, key);

  const prodUrl =
    process.env.PRODUCTION_SUPABASE_URL ??
    process.env.AVENTA_PRODUCTION_SUPABASE_URL ??
    `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
  const prodKey =
    process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.AVENTA_PRODUCTION_SERVICE_ROLE_KEY ??
    '';

  const steps: Record<string, unknown> = {};
  report.steps = steps;

  try {
    const rpBefore = await countTable(sb, 'reward_payouts');
    steps.rpBefore = rpBefore;

    const { data: m31 } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', M31_REWARD)
      .maybeSingle();
    steps.m31UntouchedPre = m31;

    // Seed four eligible rewards (never M3.1)
    const successSeed = await seedEligibleReward(sb, 'success');
    const failureSeed = await seedEligibleReward(sb, 'failure');
    const timeoutSeed = await seedEligibleReward(sb, 'timeout');
    const concurrentSeed = await seedEligibleReward(sb, 'concurrent');
    steps.seeds = { successSeed, failureSeed, timeoutSeed, concurrentSeed };

    // —— SUCCESS path: AVAILABLE → RESERVED → SUBMITTED → SUCCEEDED → PAID ——
    const r1 = await reservePayoutIntent(sb, { rewardId: successSeed.rewardId });
    steps.successReserve = r1.ok
      ? { ok: true, status: r1.intent.status, key: r1.intent.idempotency_key, id: r1.intent.id }
      : r1;
    if (!r1.ok) throw new Error(`success reserve failed: ${r1.reason}`);

    const replay = await reservePayoutIntent(sb, { rewardId: successSeed.rewardId });
    steps.successReplay = replay.ok
      ? { ok: true, reused: replay.reused, id: replay.intent.id }
      : replay;
    if (!replay.ok || !replay.reused || replay.intent.id !== r1.intent.id) {
      throw new Error('replay did not reuse same intent');
    }

    const s1 = await submitPayoutIntent(sb, {
      intentId: r1.intent.id,
      provider: createStubPayoutProvider({ submit: 'success' }),
    });
    steps.successSubmit = s1.ok
      ? { ok: true, status: s1.intent.status, key: s1.intent.idempotency_key }
      : s1;
    if (!s1.ok || s1.intent.status !== 'SUCCEEDED') {
      throw new Error(`success submit failed: ${JSON.stringify(s1)}`);
    }
    if (s1.intent.idempotency_key !== buildPayoutIntentIdempotencyKey(successSeed.rewardId)) {
      throw new Error('idempotency key changed');
    }

    const { data: paidReward } = await sb
      .from('creator_rewards')
      .select('id, status, paid_at')
      .eq('id', successSeed.rewardId)
      .maybeSingle();
    steps.successReward = paidReward;
    if ((paidReward as { status?: string } | null)?.status !== 'PAID') {
      throw new Error('reward not PAID after success');
    }

    // Duplicate callback
    const dup = await confirmPayoutIntentSuccess(sb, { intentId: r1.intent.id });
    steps.dupCallback = dup.ok
      ? { ok: true, reused: dup.reused, status: dup.intent.status }
      : dup;
    if (!dup.ok || dup.intent.status !== 'SUCCEEDED') {
      throw new Error('dup callback failed');
    }

    // —— FAILURE path ——
    const r2 = await reservePayoutIntent(sb, { rewardId: failureSeed.rewardId });
    if (!r2.ok) throw new Error(`failure reserve: ${r2.reason}`);
    const s2 = await submitPayoutIntent(sb, {
      intentId: r2.intent.id,
      provider: createStubPayoutProvider({ submit: 'failure' }),
    });
    steps.failureSubmit = s2.ok
      ? { ok: true, status: s2.intent.status }
      : s2;
    if (!s2.ok || s2.intent.status !== 'FAILED') throw new Error('failure path failed');
    const { data: failReward } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', failureSeed.rewardId)
      .maybeSingle();
    steps.failureReward = failReward;
    if ((failReward as { status?: string } | null)?.status !== 'AVAILABLE') {
      throw new Error('failure must leave reward AVAILABLE');
    }

    // —— TIMEOUT → UNKNOWN → reconcile SUCCESS ——
    const r3 = await reservePayoutIntent(sb, { rewardId: timeoutSeed.rewardId });
    if (!r3.ok) throw new Error(`timeout reserve: ${r3.reason}`);
    const key3 = r3.intent.idempotency_key;
    const s3 = await submitPayoutIntent(sb, {
      intentId: r3.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout' }),
    });
    steps.timeoutSubmit = s3.ok
      ? { ok: true, status: s3.intent.status, key: s3.intent.idempotency_key }
      : s3;
    if (!s3.ok || s3.intent.status !== 'UNKNOWN') throw new Error('timeout not UNKNOWN');
    if (s3.intent.idempotency_key !== key3) throw new Error('key changed on timeout');

    // UNKNOWN must not create second intent
    const r3b = await reservePayoutIntent(sb, { rewardId: timeoutSeed.rewardId });
    steps.unknownNoSecondIntent = r3b.ok
      ? { ok: true, reused: r3b.reused, id: r3b.intent.id, same: r3b.intent.id === r3.intent.id }
      : r3b;
    if (!r3b.ok || !r3b.reused || r3b.intent.id !== r3.intent.id) {
      throw new Error('UNKNOWN created second intent');
    }

    const rec = await reconcilePayoutIntent(sb, {
      intentId: r3.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout', reconcile: 'success' }),
    });
    steps.reconcileSuccess = rec.ok
      ? { ok: true, status: rec.intent.status, key: rec.intent.idempotency_key }
      : rec;
    if (!rec.ok || rec.intent.status !== 'SUCCEEDED') throw new Error('reconcile success failed');
    if (rec.intent.idempotency_key !== key3) throw new Error('key changed on reconcile');

    const { data: recReward } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', timeoutSeed.rewardId)
      .maybeSingle();
    steps.reconcileReward = recReward;
    if ((recReward as { status?: string } | null)?.status !== 'PAID') {
      throw new Error('reconcile did not PAID');
    }

    // —— Concurrent reserve ×3 ——
    const concurrent = await Promise.all([
      reservePayoutIntent(sb, { rewardId: concurrentSeed.rewardId }),
      reservePayoutIntent(sb, { rewardId: concurrentSeed.rewardId }),
      reservePayoutIntent(sb, { rewardId: concurrentSeed.rewardId }),
    ]);
    const okC = concurrent.filter((r) => r.ok);
    const failC = concurrent.filter((r) => !r.ok);
    const ids = new Set(okC.map((r) => (r.ok ? r.intent.id : '')));
    const { count: intentCount } = await sb
      .from('payout_intents')
      .select('*', { count: 'exact', head: true })
      .eq('reward_id', concurrentSeed.rewardId);
    steps.concurrent = {
      okCount: okC.length,
      failCount: failC.length,
      failReasons: failC.map((r) => (!r.ok ? r.reason : null)),
      uniqueIds: ids.size,
      intentRows: intentCount,
    };
    if (okC.length < 1 || ids.size !== 1 || intentCount !== 1) {
      throw new Error('concurrent reserve not single intent');
    }

    // —— FAILURE reconcile path (separate seed) ——
    const failRecSeed = await seedEligibleReward(sb, 'fail_reconcile');
    const r4 = await reservePayoutIntent(sb, { rewardId: failRecSeed.rewardId });
    if (!r4.ok) throw new Error(`failRec reserve: ${r4.reason}`);
    const s4 = await submitPayoutIntent(sb, {
      intentId: r4.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout' }),
    });
    if (!s4.ok || s4.intent.status !== 'UNKNOWN') throw new Error('failRec not UNKNOWN');
    const recFail = await reconcilePayoutIntent(sb, {
      intentId: r4.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout', reconcile: 'failure' }),
    });
    steps.reconcileFailure = recFail.ok
      ? { ok: true, status: recFail.intent.status, key: recFail.intent.idempotency_key }
      : recFail;
    if (!recFail.ok || recFail.intent.status !== 'FAILED') {
      throw new Error('reconcile failure path failed');
    }
    const { data: failRecReward } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', failRecSeed.rewardId)
      .maybeSingle();
    steps.reconcileFailureReward = failRecReward;
    if ((failRecReward as { status?: string } | null)?.status !== 'AVAILABLE') {
      throw new Error('reconcile failure must leave AVAILABLE');
    }

    // —— SAFETY ——
    const rpAfter = await countTable(sb, 'reward_payouts');
    steps.rpAfter = rpAfter;
    if (rpAfter !== rpBefore) throw new Error(`reward_payouts changed ${rpBefore}→${rpAfter}`);

    const { data: m31After } = await sb
      .from('creator_rewards')
      .select('id, status, creator_share_cents')
      .eq('id', M31_REWARD)
      .maybeSingle();
    steps.m31UntouchedPost = m31After;
    if (
      (m31After as { status?: string } | null)?.status !==
      (m31 as { status?: string } | null)?.status
    ) {
      throw new Error('M3.1 reward mutated');
    }

    // Intent counts for success seed = 1
    const { count: successIntents } = await sb
      .from('payout_intents')
      .select('*', { count: 'exact', head: true })
      .eq('reward_id', successSeed.rewardId);
    steps.successIntentRows = successIntents;
    if (successIntents !== 1) throw new Error('success second intent');

    steps.legacyRpcForbidden = PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN;
    steps.realMoneyMoved = false;
    steps.provider = 'stub';

    // Production READ-ONLY: payout_intents must not exist (or we only SELECT)
    if (prodKey) {
      const prod = client(prodUrl, prodKey);
      const { error: prodErr } = await prod
        .from('payout_intents')
        .select('id', { count: 'exact', head: true });
      steps.productionReadonly = {
        ref: PRODUCTION_SUPABASE_REF,
        payout_intents_exists: !prodErr,
        error: prodErr?.message ?? null,
        note: 'read-only probe; no writes',
      };
    } else {
      steps.productionReadonly = { skipped: true, reason: 'no_prod_key' };
    }

    // Evidence chain
    const { data: successIntent } = await sb
      .from('payout_intents')
      .select('id, status, idempotency_key, submitted_at, resolved_at')
      .eq('reward_id', successSeed.rewardId)
      .maybeSingle();
    const { data: timeoutIntent } = await sb
      .from('payout_intents')
      .select('id, status, idempotency_key, submitted_at, resolved_at')
      .eq('reward_id', timeoutSeed.rewardId)
      .maybeSingle();

    report.evidence = {
      successChain:
        'AVAILABLE → RESERVED → SUBMITTED → SUCCESS → SUCCEEDED → PAID',
      successIntent,
      successReward: paidReward,
      unknownChain:
        'SUBMITTED → UNKNOWN → reconciliation → SUCCEEDED → PAID',
      timeoutIntent,
      reconcileReward: recReward,
      secondIntent: false,
      secondKey: false,
      doublePaid: false,
    };

    report.ok = true;
    report.pass = true;
  } catch (err) {
    report.ok = false;
    report.pass = false;
    report.error = err instanceof Error ? err.message : String(err);
  } finally {
    restoreWave3FailClosedFlags();
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
    process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
    process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';
    report.flagsAfter = snapshotWave3Flags();
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    writeFileSync(
      join(OUT, `m4-1-payout-intent-canary-${Date.now()}.json`),
      JSON.stringify(report, null, 2),
    );
    // Prefer stderr so PowerShell doesn't swallow
    console.error(JSON.stringify(report, null, 2));
  }

  process.exit(report.ok ? 0 : 1);
}

main();
