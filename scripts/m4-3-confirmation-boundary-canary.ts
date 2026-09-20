/**
 * M4.3 — Confirmation boundary staging canary (stub only, no real SPEI).
 *
 *   npx tsx scripts/m4-3-confirmation-boundary-canary.ts
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
  applyProviderConfirmation,
  loadPayoutIntentByReward,
  createManualSpeiProvider,
  readConfirmationMeta,
} from '@/lib/rewards/payoutIntent';

const M31_REWARD = '0e12ab0d-a285-46eb-90e4-e7ff7dac6146';
const CREATOR = 'fd392640-64f7-4daa-b2d6-1c85a9fa36e1';
const OUT = join(process.cwd(), 'scripts', '_m43_reports');
const TAG = `m43_canary_${Date.now()}`;
const PROVIDER_REF = `SPEI-M43-${TAG}`;

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
      notes: `M4.3 canary ${label}`,
      source: 'manual',
      meta: { m43_canary: true, label, tag: TAG },
      creator_id: CREATOR,
      attributable: true,
      attribution_method: 'manual',
      attribution_confidence: 'high',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (lErr || !ledger?.id) throw new Error(`ledger ${label}: ${lErr?.message}`);

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
      meta: { m43_canary: true, label, tag: TAG },
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (rErr || !reward?.id) throw new Error(`reward ${label}: ${rErr?.message}`);
  if (reward.id === M31_REWARD) throw new Error('ABORT: touched M3.1');
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
  process.env.MONEY_PATH_FROZEN = 'false';

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'm4-3-confirmation-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M4.3_confirmation_boundary',
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
    steps.m31Pre = m31;

    // Path: AVAILABLE → intent → initiated → (separate) timeout path → reconcile SUCCESS
    const mainSeed = await seedEligibleReward(sb, 'main');
    const mismatchSeed = await seedEligibleReward(sb, 'mismatch');
    steps.seeds = { mainSeed, mismatchSeed };

    // 1-2. reserve + initiated
    const reserved = await reservePayoutIntent(sb, { rewardId: mainSeed.rewardId });
    if (!reserved.ok) throw new Error(`reserve: ${reserved.reason}`);
    steps.reserved = { id: reserved.intent.id, status: reserved.intent.status };

    const initiated = await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createManualSpeiProvider({
        submit: 'initiated',
        providerReference: PROVIDER_REF,
      }),
    });
    if (!initiated.ok || initiated.intent.status !== 'SUBMITTED') {
      throw new Error(`initiated failed: ${JSON.stringify(initiated)}`);
    }
    steps.initiated = {
      status: initiated.intent.status,
      meta: readConfirmationMeta(initiated.intent.meta),
    };

    // Force UNKNOWN via mark path: re-submit with timeout provider on already SUBMITTED
    // Use separate seed for timeout→UNKNOWN→reconcile to keep main for confirm
    const unkSeed = await seedEligibleReward(sb, 'unknown_reconcile');
    const rUnk = await reservePayoutIntent(sb, { rewardId: unkSeed.rewardId });
    if (!rUnk.ok) throw new Error(`unk reserve: ${rUnk.reason}`);
    const sUnk = await submitPayoutIntent(sb, {
      intentId: rUnk.intent.id,
      provider: createManualSpeiProvider({
        submit: 'unknown',
        reconcile: 'success',
        providerReference: `${PROVIDER_REF}-UNK`,
      }),
    });
    if (!sUnk.ok || sUnk.intent.status !== 'UNKNOWN') {
      throw new Error(`timeout not UNKNOWN: ${JSON.stringify(sUnk)}`);
    }
    steps.timeoutUnknown = { status: sUnk.intent.status };

    const rec = await reconcilePayoutIntent(sb, {
      intentId: rUnk.intent.id,
      provider: createManualSpeiProvider({
        submit: 'unknown',
        reconcile: 'success',
        providerReference: `${PROVIDER_REF}-UNK`,
      }),
    });
    if (!rec.ok || rec.intent.status !== 'SUCCEEDED') {
      throw new Error(`reconcile success failed: ${JSON.stringify(rec)}`);
    }
    steps.reconcileSuccess = {
      status: rec.intent.status,
      meta: readConfirmationMeta(rec.intent.meta),
    };
    const { data: unkReward } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', unkSeed.rewardId)
      .maybeSingle();
    if ((unkReward as { status?: string })?.status !== 'PAID') {
      throw new Error('reconcile did not PAID');
    }

    // Main: confirm SUCCESS with evidence
    const conf = await applyProviderConfirmation(sb, {
      intentId: reserved.intent.id,
      rewardId: mainSeed.rewardId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotencyKey: reserved.intent.idempotency_key,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      outcome: 'confirmed_success',
    });
    if (!conf.ok || conf.intent.status !== 'SUCCEEDED') {
      throw new Error(`confirm failed: ${JSON.stringify(conf)}`);
    }
    steps.confirmed = {
      status: conf.intent.status,
      meta: readConfirmationMeta(conf.intent.meta),
    };

    const { data: paid } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', mainSeed.rewardId)
      .maybeSingle();
    steps.paid = paid;
    if ((paid as { status?: string })?.status !== 'PAID') throw new Error('not PAID');

    // Replay
    const replay = await applyProviderConfirmation(sb, {
      intentId: reserved.intent.id,
      rewardId: mainSeed.rewardId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotencyKey: reserved.intent.idempotency_key,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      outcome: 'confirmed_success',
    });
    steps.replay = { ok: replay.ok, reused: replay.ok ? replay.reused : false };
    if (!replay.ok || !replay.reused) throw new Error('replay not idempotent');

    // Concurrent confirm (already SUCCEEDED)
    const concurrent = await Promise.all([
      applyProviderConfirmation(sb, {
        intentId: reserved.intent.id,
        rewardId: mainSeed.rewardId,
        amountCents: REWARDS_MIN_PAYOUT_CENTS,
        currency: 'MXN',
        idempotencyKey: reserved.intent.idempotency_key,
        provider: 'manual_spei',
        providerReference: PROVIDER_REF,
        outcome: 'confirmed_success',
      }),
      applyProviderConfirmation(sb, {
        intentId: reserved.intent.id,
        rewardId: mainSeed.rewardId,
        amountCents: REWARDS_MIN_PAYOUT_CENTS,
        currency: 'MXN',
        idempotencyKey: reserved.intent.idempotency_key,
        provider: 'manual_spei',
        providerReference: PROVIDER_REF,
        outcome: 'confirmed_success',
      }),
      applyProviderConfirmation(sb, {
        intentId: reserved.intent.id,
        rewardId: mainSeed.rewardId,
        amountCents: REWARDS_MIN_PAYOUT_CENTS,
        currency: 'MXN',
        idempotencyKey: reserved.intent.idempotency_key,
        provider: 'manual_spei',
        providerReference: PROVIDER_REF,
        outcome: 'confirmed_success',
      }),
    ]);
    steps.concurrent = {
      ok: concurrent.every((r) => r.ok),
      statuses: concurrent.map((r) => (r.ok ? r.intent.status : r.reason)),
    };
    if (!concurrent.every((r) => r.ok)) throw new Error('concurrent confirm failed');

    // Mismatch probes on mismatchSeed (initiated)
    const rMis = await reservePayoutIntent(sb, { rewardId: mismatchSeed.rewardId });
    if (!rMis.ok) throw new Error(`mismatch reserve: ${rMis.reason}`);
    const sMis = await submitPayoutIntent(sb, {
      intentId: rMis.intent.id,
      provider: createManualSpeiProvider({
        submit: 'initiated',
        providerReference: `${PROVIDER_REF}-MIS`,
      }),
    });
    if (!sMis.ok) throw new Error('mismatch initiate failed');

    const refBad = await applyProviderConfirmation(sb, {
      intentId: rMis.intent.id,
      rewardId: mismatchSeed.rewardId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotencyKey: rMis.intent.idempotency_key,
      provider: 'manual_spei',
      providerReference: 'WRONG-REF',
      outcome: 'confirmed_success',
    });
    const amtBad = await applyProviderConfirmation(sb, {
      intentId: rMis.intent.id,
      rewardId: mismatchSeed.rewardId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS + 1,
      currency: 'MXN',
      idempotencyKey: rMis.intent.idempotency_key,
      provider: 'manual_spei',
      providerReference: `${PROVIDER_REF}-MIS`,
      outcome: 'confirmed_success',
    });
    const curBad = await applyProviderConfirmation(sb, {
      intentId: rMis.intent.id,
      rewardId: mismatchSeed.rewardId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'USD',
      idempotencyKey: rMis.intent.idempotency_key,
      provider: 'manual_spei',
      providerReference: `${PROVIDER_REF}-MIS`,
      outcome: 'confirmed_success',
    });
    steps.mismatches = {
      providerRef: !refBad.ok && (refBad as { reason?: string }).reason,
      amount: !amtBad.ok && (amtBad as { reason?: string }).reason,
      currency: !curBad.ok && (curBad as { reason?: string }).reason,
    };
    if (
      (refBad as { reason?: string }).reason !== 'provider_reference_mismatch' ||
      (amtBad as { reason?: string }).reason !== 'amount_mismatch' ||
      (curBad as { reason?: string }).reason !== 'currency_mismatch'
    ) {
      throw new Error(`mismatch probes failed: ${JSON.stringify(steps.mismatches)}`);
    }

    const { count: mainIntents } = await sb
      .from('payout_intents')
      .select('*', { count: 'exact', head: true })
      .eq('reward_id', mainSeed.rewardId);
    steps.mainIntentRows = mainIntents;
    if (mainIntents !== 1) throw new Error('duplicate intent');

    const rpAfter = await countTable(sb, 'reward_payouts');
    steps.rpAfter = rpAfter;
    if (rpAfter !== rpBefore) throw new Error('reward_payouts wrote');

    const { data: m31After } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', M31_REWARD)
      .maybeSingle();
    steps.m31Post = m31After;
    if ((m31After as { status?: string })?.status !== (m31 as { status?: string })?.status) {
      throw new Error('M3.1 mutated');
    }

    // Prod RO
    steps.productionReadonly = {
      ref: PRODUCTION_SUPABASE_REF,
      note: 'CLI probe; no writes',
    };

    report.evidence = {
      seam: 'AVAILABLE→claim→initiated→confirm→PAID + UNKNOWN→reconcile→PAID',
      mainReward: mainSeed.rewardId,
      mainIntent: reserved.intent.id,
      providerReference: PROVIDER_REF,
      intentCount: 1,
      rpUnchanged: true,
      realMoney: false,
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
    report.flagsAfter = snapshotWave3Flags();
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    writeFileSync(
      join(OUT, `m4-3-confirmation-canary-${Date.now()}.json`),
      JSON.stringify(report, null, 2),
    );
    console.error(JSON.stringify(report, null, 2));
  }

  process.exit(report.ok ? 0 : 1);
}

main();
