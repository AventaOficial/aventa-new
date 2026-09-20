/**
 * M4.6 — Real provider adapter boundary staging canary.
 * No real money. If credentials missing → REAL_PROVIDER_NOT_CONFIGURED (not a fake PASS).
 *
 *   npx tsx scripts/m4-6-real-provider-boundary-canary.ts
 */

import { existsSync, readFileSync } from 'node:fs';
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
  loadRealProviderConfig,
  createRealPayoutProvider,
  type RealProviderTransport,
} from '@/lib/rewards/payoutIntent';

const M31_REWARD = '0e12ab0d-a285-46eb-90e4-e7ff7dac6146';
const CREATOR = 'fd392640-64f7-4daa-b2d6-1c85a9fa36e1';
const TAG = `m46_canary_${Date.now()}`;
const REF = `sandbox:M46-${TAG}`;

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
      notes: `M4.6 ${label}`,
      source: 'manual',
      meta: { m46_canary: true, label, tag: TAG },
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
      meta: { m46_canary: true, label, tag: TAG },
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

  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M4.6_real_provider_boundary',
    tag: TAG,
    flagsBefore: snapshotWave3Flags(),
    realMoney: false,
  };

  const guard = assertWave3StagingOnly(process.env);
  report.guard = guard;
  if (!guard.ok) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const realCfg = loadRealProviderConfig(process.env);
  const realResolve = resolvePayoutProvider({
    ...process.env,
    PAYOUT_PROVIDER: 'real',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV ?? 'preview',
  });

  report.realProvider = {
    configOk: realCfg.ok,
    resolveOk: realResolve.ok,
    resolveReason: realResolve.ok ? null : realResolve.reason,
    status: realCfg.ok && realResolve.ok ? 'CONFIGURED' : 'REAL_PROVIDER_NOT_CONFIGURED',
  };

  // Explicit: do not claim real-provider live PASS without credentials.
  if (!realCfg.ok || !realResolve.ok) {
    report.mode = 'adapter_contract_via_sandbox';
    report.note =
      'REAL_PROVIDER_NOT_CONFIGURED — validating adapter contract with sandbox only; not manufacturing real PASS';
  } else {
    report.mode = 'real_adapter_with_credentials';
  }

  process.env.PAYOUT_PROVIDER = realCfg.ok ? 'real' : 'sandbox';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  if (!url.includes(STAGING_SUPABASE_REF) || !key) {
    report.reason = 'staging_credentials_missing';
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const sb = client(url, key);
  const steps: Record<string, unknown> = {};
  report.steps = steps;

  try {
    const rpBefore = await countTable(sb, 'reward_payouts');
    steps.rpBefore = rpBefore;

    // Contract path: AVAILABLE → intent → provider → confirm → PAID
    const mainId = await seed(sb, 'main');
    const reserved = await reservePayoutIntent(sb, { rewardId: mainId });
    if (!reserved.ok) throw new Error(reserved.reason);

    let provider;
    if (realCfg.ok && realResolve.ok) {
      // Credentials exist — still use injectable emulator unless live URL is a known staging harness.
      // Never invent success against unknown remote. Prefer deterministic local transport for canary safety.
      const transport: RealProviderTransport = {
        async submit() {
          return {
            ok: true,
            status: 200,
            body: { status: 'initiated', provider_reference: REF },
          };
        },
        async reconcile() {
          return {
            ok: true,
            status: 200,
            body: { status: 'success', provider_reference: REF },
          };
        },
      };
      provider = createRealPayoutProvider(realCfg.config, transport);
      steps.providerMode = 'real_adapter_emulator_transport';
    } else {
      provider = createSandboxPayoutProvider({
        submit: 'initiated',
        providerReference: REF,
      });
      steps.providerMode = 'sandbox_contract';
    }

    const sub = await executeProviderSubmit(sb, {
      intentId: reserved.intent.id,
      provider,
    });
    steps.submit = {
      ok: sub.ok,
      status: sub.ok ? sub.intentResult.intent.status : sub.reason,
    };
    if (!sub.ok || sub.intentResult.intent.status !== 'SUBMITTED') {
      throw new Error('submit initiated failed');
    }

    const conf = await applyProviderConfirmation(sb, {
      intentId: reserved.intent.id,
      rewardId: mainId,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotencyKey: reserved.intent.idempotency_key,
      provider: provider.id,
      providerReference: REF,
      outcome: 'confirmed_success',
    });
    steps.confirm = conf.ok ? conf.intent.status : conf;
    if (!conf.ok || conf.intent.status !== 'SUCCEEDED') throw new Error('confirm failed');

    // UNKNOWN → reconcile (no second submit)
    const uId = await seed(sb, 'unknown');
    const uRes = await reservePayoutIntent(sb, { rewardId: uId });
    if (!uRes.ok) throw new Error(uRes.reason);
    const uProv =
      realCfg.ok && realResolve.ok
        ? createRealPayoutProvider(realCfg.config, {
            async submit() {
              return { ok: false, status: 0, body: null, uncertain: true };
            },
            async reconcile() {
              return {
                ok: true,
                status: 200,
                body: { status: 'success', provider_reference: `${REF}-U` },
              };
            },
          })
        : createSandboxPayoutProvider({
            submit: 'timeout',
            reconcile: 'success',
            providerReference: `${REF}-U`,
          });
    await executeProviderSubmit(sb, { intentId: uRes.intent.id, provider: uProv });
    const uRec = await executeProviderReconcile(sb, {
      intentId: uRes.intent.id,
      provider: uProv,
    });
    steps.unknownReconcile = uRec.ok ? uRec.intentResult.intent.status : uRec;
    if (!uRec.ok || uRec.intentResult.intent.status !== 'SUCCEEDED') {
      throw new Error('unknown reconcile failed');
    }

    // Fail-closed: real without creds must not resolve to sandbox
    const noFallback = resolvePayoutProvider({
      NODE_ENV: 'test',
      VERCEL_ENV: 'preview',
      PAYOUT_PROVIDER: 'real',
    });
    steps.noSilentFallback = {
      ok: !noFallback.ok,
      reason: noFallback.ok ? 'UNEXPECTED_OK' : noFallback.reason,
    };
    if (noFallback.ok) throw new Error('real silently resolved');

    const prodBlock = resolvePayoutProvider({
      ...process.env,
      PAYOUT_PROVIDER: 'sandbox',
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    });
    steps.productionBlocked = !prodBlock.ok;
    if (prodBlock.ok) throw new Error('production not blocked');

    const rpAfter = await countTable(sb, 'reward_payouts');
    steps.reward_payouts = { before: rpBefore, after: rpAfter };
    if (rpAfter !== rpBefore) throw new Error('reward_payouts wrote');

    const { count: intentCount } = await sb
      .from('payout_intents')
      .select('*', { count: 'exact', head: true })
      .eq('reward_id', mainId);
    steps.intentCount = intentCount;
    if (intentCount !== 1) throw new Error('intent not 1:1');

    steps.productionReadonly = { ref: PRODUCTION_SUPABASE_REF };

    report.ok = true;
    report.pass = true;
    report.realProviderLive = false;
    report.architectureClosed = true;
    if (!realCfg.ok || !realResolve.ok) {
      report.verdict = 'REAL_PROVIDER_NOT_CONFIGURED';
      report.boundaryPass = true;
      report.liveProviderPass = false;
    } else {
      report.verdict = 'REAL_ADAPTER_BOUNDARY_WITH_LOCAL_TRANSPORT';
      report.boundaryPass = true;
      report.liveProviderPass = false;
      report.note =
        'Credentials present but canary used local transport — no remote money movement';
    }
  } catch (err) {
    report.ok = false;
    report.pass = false;
    report.error = err instanceof Error ? err.message : String(err);
  } finally {
    restoreWave3FailClosedFlags();
    process.env.MONEY_PATH_FROZEN = 'true';
    delete process.env.PAYOUT_PROVIDER;
    report.flagsAfter = snapshotWave3Flags();
    console.error(JSON.stringify(report, null, 2));
  }

  process.exit(report.ok ? 0 : 1);
}

main();
