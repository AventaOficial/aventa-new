/**
 * M4.2 — Manual SPEI behind payout_intents (staging stub only).
 * No real SPEI. No execute_reward_payout authority. No touch M3.1 reward.
 *
 *   npx tsx scripts/m4-2-legacy-spei-intent-canary.ts
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
import { createManualRewardPayout } from '@/lib/rewards/payout';
import {
  createManualSpeiProvider,
  loadPayoutIntentByReward,
} from '@/lib/rewards/payoutIntent';

const M31_REWARD = '0e12ab0d-a285-46eb-90e4-e7ff7dac6146';
const CREATOR = 'fd392640-64f7-4daa-b2d6-1c85a9fa36e1';
const ACTOR = CREATOR;
const OUT = join(process.cwd(), 'scripts', '_m42_reports');
const TAG = `m42_canary_${Date.now()}`;

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
      notes: `M4.2 canary ${label}`,
      source: 'manual',
      meta: { m42_canary: true, label, tag: TAG },
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
      meta: { m42_canary: true, label, tag: TAG },
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
  const outPath = join(OUT, 'm4-2-legacy-spei-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M4.2_legacy_spei_behind_intent',
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
      .select('id, status, payout_id')
      .eq('id', M31_REWARD)
      .maybeSingle();
    steps.m31Pre = m31;

    // Prove legacy RPC cannot bypass
    const { data: rpcData, error: rpcErr } = await sb.rpc('execute_reward_payout', {
      p_user_id: CREATOR,
      p_amount_cents: REWARDS_MIN_PAYOUT_CENTS,
      p_spei_reference: 'SHOULD-FAIL',
      p_created_by: ACTOR,
      p_reward_ids: [M31_REWARD],
      p_notes: 'm42 bypass probe',
    });
    steps.legacyRpcBypass = {
      data: rpcData,
      error: rpcErr?.message ?? null,
      blocked: /legacy_rpc_disabled_use_payout_intent/i.test(rpcErr?.message ?? ''),
    };
    if (!steps.legacyRpcBypass || !(steps.legacyRpcBypass as { blocked?: boolean }).blocked) {
      throw new Error('legacy RPC was not fail-closed');
    }

    const successSeed = await seedEligibleReward(sb, 'success');
    const unknownSeed = await seedEligibleReward(sb, 'unknown_block');
    const failSeed = await seedEligibleReward(sb, 'failure');
    steps.seeds = { successSeed, unknownSeed, failSeed };

    // Success path via createManualRewardPayout
    const pay = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'STUB-SPEI-M42-OK',
      createdBy: ACTOR,
      rewardIds: [successSeed.rewardId],
      provider: createManualSpeiProvider({ submit: 'success', recordsHistoricalPayout: false }),
      writeHistoricalPayoutRow: false,
    });
    steps.manualSuccess = pay;
    if (!pay.ok) throw new Error(`manual success failed: ${JSON.stringify(pay)}`);

    const intent = await loadPayoutIntentByReward(sb, successSeed.rewardId);
    steps.successIntent = intent;
    if (!intent || intent.status !== 'SUCCEEDED') throw new Error('intent not SUCCEEDED');

    const { data: paidReward } = await sb
      .from('creator_rewards')
      .select('id, status, payout_id')
      .eq('id', successSeed.rewardId)
      .maybeSingle();
    steps.successReward = paidReward;
    if ((paidReward as { status?: string })?.status !== 'PAID') throw new Error('not PAID');

    // Replay / second claim blocked
    const replay = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'STUB-SPEI-M42-REPLAY',
      createdBy: ACTOR,
      rewardIds: [successSeed.rewardId],
      stubScenario: 'success',
    });
    steps.replayReject = replay;
    if (replay.ok) throw new Error('replay should reject');

    // UNKNOWN blocks second manual
    const unk = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'STUB-SPEI-M42-UNK',
      createdBy: ACTOR,
      rewardIds: [unknownSeed.rewardId],
      provider: createManualSpeiProvider({ submit: 'unknown' }),
    });
    steps.unknownFirst = unk;
    if (unk.ok || (unk as { code?: string }).code !== 'intent_unknown') {
      // first call itself returns unknown
      if (!unk.ok && (unk as { code?: string }).code === 'intent_unknown') {
        // ok
      } else {
        throw new Error(`expected intent_unknown got ${JSON.stringify(unk)}`);
      }
    }
    const unk2 = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'STUB-SPEI-M42-UNK2',
      createdBy: ACTOR,
      rewardIds: [unknownSeed.rewardId],
      stubScenario: 'success',
    });
    steps.unknownSecondBlocked = unk2;
    if (unk2.ok || (unk2 as { code?: string }).code !== 'intent_unknown') {
      throw new Error('UNKNOWN must block second manual');
    }
    const { count: unkIntents } = await sb
      .from('payout_intents')
      .select('*', { count: 'exact', head: true })
      .eq('reward_id', unknownSeed.rewardId);
    steps.unknownIntentRows = unkIntents;
    if (unkIntents !== 1) throw new Error('second intent created');

    // FAILED terminal
    const fail = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'STUB-SPEI-M42-FAIL',
      createdBy: ACTOR,
      rewardIds: [failSeed.rewardId],
      stubScenario: 'failure',
    });
    steps.failure = fail;
    if (fail.ok) throw new Error('failure should not ok');
    const fail2 = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'STUB-SPEI-M42-FAIL2',
      createdBy: ACTOR,
      rewardIds: [failSeed.rewardId],
      stubScenario: 'success',
    });
    steps.failureTerminal = fail2;
    if (fail2.ok || (fail2 as { code?: string }).code !== 'intent_failed_terminal') {
      throw new Error('FAILED must be terminal for second claim');
    }

    const rpAfter = await countTable(sb, 'reward_payouts');
    steps.rpAfter = rpAfter;
    if (rpAfter !== rpBefore) throw new Error(`reward_payouts changed ${rpBefore}→${rpAfter}`);

    const { data: m31After } = await sb
      .from('creator_rewards')
      .select('id, status, payout_id')
      .eq('id', M31_REWARD)
      .maybeSingle();
    steps.m31Post = m31After;
    if ((m31After as { status?: string })?.status !== (m31 as { status?: string })?.status) {
      throw new Error('M3.1 mutated');
    }

    // Production RO — payout_intents must not exist / no writes
    steps.productionReadonly = {
      ref: PRODUCTION_SUPABASE_REF,
      note: 'CLI probe separately; no prod key in canary env',
    };

    report.evidence = {
      singleAuthority: 'payout_intents',
      legacyRpcBypassBlocked: true,
      successReward: paidReward,
      successIntent: intent,
      rpUnchanged: rpAfter === rpBefore,
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
      join(OUT, `m4-2-legacy-spei-canary-${Date.now()}.json`),
      JSON.stringify(report, null, 2),
    );
    console.error(JSON.stringify(report, null, 2));
  }

  process.exit(report.ok ? 0 : 1);
}

main();
