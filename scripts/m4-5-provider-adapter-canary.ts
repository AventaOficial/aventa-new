/**
 * M4.5 — Provider adapter staging canary (sandbox only, no real money).
 *
 *   npx tsx scripts/m4-5-provider-adapter-canary.ts
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
  applyProviderConfirmation,
  createSandboxPayoutProvider,
  resolvePayoutProvider,
  executeProviderSubmit,
  executeProviderReconcile,
} from '@/lib/rewards/payoutIntent';

const M31_REWARD = '0e12ab0d-a285-46eb-90e4-e7ff7dac6146';
const CREATOR = 'fd392640-64f7-4daa-b2d6-1c85a9fa36e1';
const OUT = join(process.cwd(), 'scripts', '_m45_reports');
const TAG = `m45_canary_${Date.now()}`;
const REF = `sandbox:M45-${TAG}`;

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

async function seed(sb: SupabaseClient, label: string): Promise<string> {
  const now = new Date().toISOString();
  const { data: ledger, error: lErr } = await sb
    .from('affiliate_ledger_entries')
    .insert({
      network: 'other',
      amount_cents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      status: 'accrued',
      external_ref: `${TAG}_${label}`,
      notes: `M4.5 ${label}`,
      source: 'manual',
      meta: { m45_canary: true, label, tag: TAG },
      creator_id: CREATOR,
      attributable: true,
      attribution_method: 'manual',
      attribution_confidence: 'high',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (lErr || !ledger?.id) throw new Error(`ledger: ${lErr?.message}`);
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
      meta: { m45_canary: true, label, tag: TAG },
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (rErr || !reward?.id) throw new Error(`reward: ${rErr?.message}`);
  if (reward.id === M31_REWARD) throw new Error('ABORT M3.1');
  return reward.id;
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
  process.env.PAYOUT_PROVIDER = 'sandbox';

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'm4-5-provider-adapter-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M4.5_provider_adapter',
    tag: TAG,
    flagsBefore: snapshotWave3Flags(),
  };

  const guard = assertWave3StagingOnly(process.env);
  report.guard = guard;
  if (!guard.ok) {
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const resolved = resolvePayoutProvider(process.env, {
    submit: 'initiated',
    providerReference: REF,
  });
  report.providerResolve = resolved.ok
    ? { ok: true, providerId: resolved.providerId }
    : resolved;
  if (!resolved.ok) {
    writeFileSync(outPath, JSON.stringify(report, null, 2));
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

    // A. initiated
    const mainId = await seed(sb, 'initiated');
    const reserved = await reservePayoutIntent(sb, { rewardId: mainId });
    if (!reserved.ok) throw new Error(reserved.reason);
    const sub = await executeProviderSubmit(sb, {
      intentId: reserved.intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'initiated',
        providerReference: REF,
      }),
    });
    steps.A_initiated = {
      ok: sub.ok,
      status: sub.ok ? sub.intentResult.intent.status : sub.reason,
      normalized: sub.ok ? sub.normalized.status : null,
    };
    if (!sub.ok || sub.intentResult.intent.status !== 'SUBMITTED') {
      throw new Error('A initiated failed');
    }

    // Confirm main → PAID (provider confirmation path)
    const conf = await applyProviderConfirmation(sb, {
      intentId: reserved.intent.id,
      rewardId: mainId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotencyKey: reserved.intent.idempotency_key,
      provider: 'sandbox',
      providerReference: REF,
      outcome: 'confirmed_success',
    });
    steps.A_confirm = conf.ok ? conf.intent.status : conf;
    if (!conf.ok || conf.intent.status !== 'SUCCEEDED') throw new Error('A confirm failed');

    // B. UNKNOWN → SUCCESS
    const bId = await seed(sb, 'unk_success');
    const bRes = await reservePayoutIntent(sb, { rewardId: bId });
    if (!bRes.ok) throw new Error(bRes.reason);
    await executeProviderSubmit(sb, {
      intentId: bRes.intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'success',
        providerReference: `${REF}-B`,
      }),
    });
    const bRec = await executeProviderReconcile(sb, {
      intentId: bRes.intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'success',
        providerReference: `${REF}-B`,
      }),
    });
    steps.B_unk_success = bRec.ok ? bRec.intentResult.intent.status : bRec;
    if (!bRec.ok || bRec.intentResult.intent.status !== 'SUCCEEDED') {
      throw new Error('B failed');
    }

    // C. UNKNOWN → FAILURE
    const cId = await seed(sb, 'unk_fail');
    const cRes = await reservePayoutIntent(sb, { rewardId: cId });
    if (!cRes.ok) throw new Error(cRes.reason);
    await executeProviderSubmit(sb, {
      intentId: cRes.intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'failure',
        providerReference: `${REF}-C`,
      }),
    });
    const cRec = await executeProviderReconcile(sb, {
      intentId: cRes.intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'failure',
        providerReference: `${REF}-C`,
      }),
    });
    steps.C_unk_fail = cRec.ok ? cRec.intentResult.intent.status : cRec;
    if (!cRec.ok || cRec.intentResult.intent.status !== 'FAILED') throw new Error('C failed');

    // D. UNKNOWN → UNKNOWN
    const dId = await seed(sb, 'unk_unk');
    const dRes = await reservePayoutIntent(sb, { rewardId: dId });
    if (!dRes.ok) throw new Error(dRes.reason);
    await executeProviderSubmit(sb, {
      intentId: dRes.intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'unknown',
        providerReference: `${REF}-D`,
      }),
    });
    const dRec = await executeProviderReconcile(sb, {
      intentId: dRes.intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'unknown',
        providerReference: `${REF}-D`,
      }),
    });
    steps.D_unk_unk = dRec.ok ? dRec.intentResult.intent.status : dRec;
    if (!dRec.ok || dRec.intentResult.intent.status !== 'UNKNOWN') throw new Error('D failed');

    // E. replay same idempotency key (while claim still open — not after PAID)
    const eId = await seed(sb, 'replay_key');
    const eFirst = await reservePayoutIntent(sb, { rewardId: eId });
    if (!eFirst.ok) throw new Error(eFirst.reason);
    const eReplay = await reservePayoutIntent(sb, { rewardId: eId });
    steps.E_replay = {
      ok: eReplay.ok,
      reused: eReplay.ok ? eReplay.reused : false,
      sameId: eReplay.ok && eReplay.intent.id === eFirst.intent.id,
      sameKey:
        eReplay.ok &&
        eReplay.intent.idempotency_key === eFirst.intent.idempotency_key,
    };
    if (
      !eReplay.ok ||
      !eReplay.reused ||
      eReplay.intent.id !== eFirst.intent.id ||
      eReplay.intent.idempotency_key !== eFirst.intent.idempotency_key
    ) {
      throw new Error('E replay failed');
    }

    // F. concurrent submit on fresh reward
    const fId = await seed(sb, 'concurrent');
    const fRes = await reservePayoutIntent(sb, { rewardId: fId });
    if (!fRes.ok) throw new Error(fRes.reason);
    const fProv = createSandboxPayoutProvider({
      submit: 'immediate_success',
      providerReference: `${REF}-F`,
    });
    const fConc = await Promise.all([
      executeProviderSubmit(sb, { intentId: fRes.intent.id, provider: fProv }),
      executeProviderSubmit(sb, { intentId: fRes.intent.id, provider: fProv }),
      executeProviderSubmit(sb, { intentId: fRes.intent.id, provider: fProv }),
    ]);
    const { count: fIntents } = await sb
      .from('payout_intents')
      .select('*', { count: 'exact', head: true })
      .eq('reward_id', fId);
    steps.F_concurrent = {
      okCount: fConc.filter((x) => x.ok).length,
      intentRows: fIntents,
    };
    if (fIntents !== 1) throw new Error('F duplicate intent');

    // G. duplicate confirmation
    const gDup = await applyProviderConfirmation(sb, {
      intentId: reserved.intent.id,
      rewardId: mainId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotencyKey: reserved.intent.idempotency_key,
      provider: 'sandbox',
      providerReference: REF,
      outcome: 'confirmed_success',
    });
    steps.G_dup = gDup.ok ? { ok: true, reused: gDup.reused } : gDup;
    if (!gDup.ok || !gDup.reused) throw new Error('G dup failed');

    // H-J mismatches
    const mId = await seed(sb, 'mismatch');
    const mRes = await reservePayoutIntent(sb, { rewardId: mId });
    if (!mRes.ok) throw new Error(mRes.reason);
    await executeProviderSubmit(sb, {
      intentId: mRes.intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'initiated',
        providerReference: `${REF}-M`,
      }),
    });
    const h = await applyProviderConfirmation(sb, {
      intentId: mRes.intent.id,
      rewardId: mId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS + 1,
      currency: 'MXN',
      idempotencyKey: mRes.intent.idempotency_key,
      provider: 'sandbox',
      providerReference: `${REF}-M`,
      outcome: 'confirmed_success',
    });
    const i = await applyProviderConfirmation(sb, {
      intentId: mRes.intent.id,
      rewardId: mId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'USD',
      idempotencyKey: mRes.intent.idempotency_key,
      provider: 'sandbox',
      providerReference: `${REF}-M`,
      outcome: 'confirmed_success',
    });
    const j = await applyProviderConfirmation(sb, {
      intentId: mRes.intent.id,
      rewardId: mId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotencyKey: mRes.intent.idempotency_key,
      provider: 'sandbox',
      providerReference: 'WRONG-REF',
      outcome: 'confirmed_success',
    });
    steps.HIJ_mismatches = {
      amount: !h.ok && (h as { reason?: string }).reason,
      currency: !i.ok && (i as { reason?: string }).reason,
      providerRef: !j.ok && (j as { reason?: string }).reason,
    };
    if (
      (h as { reason?: string }).reason !== 'amount_mismatch' ||
      (i as { reason?: string }).reason !== 'currency_mismatch' ||
      (j as { reason?: string }).reason !== 'provider_reference_mismatch'
    ) {
      throw new Error('H/I/J mismatch probes failed');
    }

    const { count: mainIntents } = await sb
      .from('payout_intents')
      .select('*', { count: 'exact', head: true })
      .eq('reward_id', mainId);
    steps.L_intentCount = mainIntents;
    if (mainIntents !== 1) throw new Error('L second intent');

    const rpAfter = await countTable(sb, 'reward_payouts');
    steps.K_rp = { before: rpBefore, after: rpAfter };
    if (rpAfter !== rpBefore) throw new Error('K reward_payouts wrote');

    const { data: m31 } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', M31_REWARD)
      .maybeSingle();
    steps.m31 = m31;

    steps.productionReadonly = { ref: PRODUCTION_SUPABASE_REF };
    report.evidence = {
      seam: 'payout_intent→sandbox adapter→normalized→confirm/reconcile→applyProviderConfirmation→PAID',
      mainReward: mainId,
      mainIntent: reserved.intent.id,
      provider: 'sandbox',
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
    delete process.env.PAYOUT_PROVIDER;
    report.flagsAfter = snapshotWave3Flags();
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    writeFileSync(
      join(OUT, `m4-5-provider-adapter-canary-${Date.now()}.json`),
      JSON.stringify(report, null, 2),
    );
    console.error(JSON.stringify(report, null, 2));
  }

  process.exit(report.ok ? 0 : 1);
}

main();
