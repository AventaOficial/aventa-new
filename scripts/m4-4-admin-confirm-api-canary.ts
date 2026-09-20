/**
 * M4.4 — Admin confirmation API boundary staging canary.
 * Uses adminConfirmPayoutIntent (same function as HTTP route).
 * No real SPEI. No production writes.
 *
 *   npx tsx scripts/m4-4-admin-confirm-api-canary.ts
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
  createManualSpeiProvider,
  adminConfirmPayoutIntent,
} from '@/lib/rewards/payoutIntent';

const M31_REWARD = '0e12ab0d-a285-46eb-90e4-e7ff7dac6146';
const CREATOR = 'fd392640-64f7-4daa-b2d6-1c85a9fa36e1';
const OUT = join(process.cwd(), 'scripts', '_m44_reports');
const TAG = `m44_canary_${Date.now()}`;
const PROVIDER_REF = `SPEI-M44-${TAG}`;

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

async function resolveAdminActor(sb: SupabaseClient): Promise<string> {
  const { data } = await sb
    .from('user_roles')
    .select('user_id, role')
    .in('role', ['owner', 'admin'])
    .limit(10);
  const rows = (data ?? []) as Array<{ user_id: string; role: string }>;
  const other = rows.find((r) => r.user_id !== CREATOR);
  if (other?.user_id) return other.user_id;
  // Fallback: any non-creator profile
  const { data: profiles } = await sb.from('profiles').select('id').neq('id', CREATOR).limit(1);
  const pid = (profiles as Array<{ id: string }> | null)?.[0]?.id;
  if (!pid) throw new Error('no admin/non-creator actor for canary');
  return pid;
}

async function seedEligibleReward(
  sb: SupabaseClient,
  label: string,
): Promise<{ rewardId: string }> {
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
      notes: `M4.4 canary ${label}`,
      source: 'manual',
      meta: { m44_canary: true, label, tag: TAG },
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
      meta: { m44_canary: true, label, tag: TAG },
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (rErr || !reward?.id) throw new Error(`reward ${label}: ${rErr?.message}`);
  if (reward.id === M31_REWARD) throw new Error('ABORT: touched M3.1');
  return { rewardId: reward.id };
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
  const outPath = join(OUT, 'm4-4-admin-confirm-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M4.4_admin_confirm_api',
    tag: TAG,
    flagsBefore: snapshotWave3Flags(),
    httpRoute: '/api/admin/rewards/payouts/confirm',
    domainFn: 'adminConfirmPayoutIntent',
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

    const adminActor = await resolveAdminActor(sb);
    steps.adminActor = adminActor;
    if (adminActor === CREATOR) throw new Error('admin actor must not be creator');

    const { data: m31 } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', M31_REWARD)
      .maybeSingle();
    steps.m31Pre = m31;

    // Self-confirm reject
    const selfSeed = await seedEligibleReward(sb, 'self');
    const rSelf = await reservePayoutIntent(sb, { rewardId: selfSeed.rewardId });
    if (!rSelf.ok) throw new Error(rSelf.reason);
    await submitPayoutIntent(sb, {
      intentId: rSelf.intent.id,
      provider: createManualSpeiProvider({
        submit: 'initiated',
        providerReference: `${PROVIDER_REF}-SELF`,
      }),
    });
    const self = await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: rSelf.intent.id,
      provider: 'manual_spei',
      providerReference: `${PROVIDER_REF}-SELF`,
      idempotencyKey: rSelf.intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: CREATOR,
    });
    steps.selfReject = self;
    if (self.ok || self.code !== 'FORBIDDEN_SELF') throw new Error('self confirm must fail');

    // Main confirm path
    const main = await seedEligibleReward(sb, 'main');
    const reserved = await reservePayoutIntent(sb, { rewardId: main.rewardId });
    if (!reserved.ok) throw new Error(reserved.reason);
    const initiated = await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createManualSpeiProvider({
        submit: 'initiated',
        providerReference: PROVIDER_REF,
      }),
    });
    if (!initiated.ok || initiated.intent.status !== 'SUBMITTED') {
      throw new Error('initiate failed');
    }

    const confirm = await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: reserved.intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: reserved.intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: adminActor,
    });
    steps.confirm = confirm;
    if (!confirm.ok || confirm.intent.status !== 'SUCCEEDED') {
      throw new Error(`confirm failed: ${JSON.stringify(confirm)}`);
    }

    const { data: paid } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', main.rewardId)
      .maybeSingle();
    steps.paid = paid;
    if ((paid as { status?: string })?.status !== 'PAID') throw new Error('not PAID');

    // Replay
    const replay = await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: reserved.intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: reserved.intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: adminActor,
    });
    steps.replay = replay;
    if (!replay.ok || replay.code !== 'ALREADY_APPLIED') throw new Error('replay not idempotent');

    // Concurrent
    const concurrent = await Promise.all(
      [1, 2, 3].map(() =>
        adminConfirmPayoutIntent(sb, {
          operation: 'confirm',
          payoutIntentId: reserved.intent.id,
          provider: 'manual_spei',
          providerReference: PROVIDER_REF,
          idempotencyKey: reserved.intent.idempotency_key,
          amountCents: REWARDS_MIN_PAYOUT_CENTS,
          currency: 'MXN',
          outcome: 'confirmed_success',
          actorId: adminActor,
        }),
      ),
    );
    steps.concurrent = {
      allOk: concurrent.every((r) => r.ok),
      codes: concurrent.map((r) => (r.ok ? r.code : r.code)),
    };
    if (!concurrent.every((r) => r.ok)) throw new Error('concurrent failed');

    // Invalid evidence
    const bad = await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: reserved.intent.id,
      provider: 'manual_spei',
      providerReference: 'WRONG-REF',
      idempotencyKey: reserved.intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: adminActor,
    });
    steps.invalidEvidence = bad;
    if (bad.ok) throw new Error('invalid evidence should fail');

    // UNKNOWN → reconcile
    const unk = await seedEligibleReward(sb, 'unknown');
    const rUnk = await reservePayoutIntent(sb, { rewardId: unk.rewardId });
    if (!rUnk.ok) throw new Error(rUnk.reason);
    const sUnk = await submitPayoutIntent(sb, {
      intentId: rUnk.intent.id,
      provider: createManualSpeiProvider({
        submit: 'unknown',
        providerReference: `${PROVIDER_REF}-UNK`,
      }),
    });
    if (!sUnk.ok || sUnk.intent.status !== 'UNKNOWN') throw new Error('not UNKNOWN');
    const rec = await adminConfirmPayoutIntent(sb, {
      operation: 'reconcile',
      payoutIntentId: rUnk.intent.id,
      provider: 'manual_spei',
      providerReference: `${PROVIDER_REF}-UNK`,
      idempotencyKey: rUnk.intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: adminActor,
    });
    steps.reconcile = rec;
    if (!rec.ok || rec.intent.status !== 'SUCCEEDED') throw new Error('reconcile failed');

    const { count: intentRows } = await sb
      .from('payout_intents')
      .select('*', { count: 'exact', head: true })
      .eq('reward_id', main.rewardId);
    steps.mainIntentRows = intentRows;
    if (intentRows !== 1) throw new Error('second intent');

    // Audit actor
    const { data: audits } = await sb
      .from('reward_audit_log')
      .select('event_type, actor_id, entity_id')
      .eq('entity_id', reserved.intent.id)
      .eq('event_type', 'admin_payout_confirm')
      .limit(5);
    steps.audit = audits;
    const hasAdminAudit = (audits ?? []).some(
      (a) => (a as { actor_id?: string }).actor_id === adminActor,
    );
    if (!hasAdminAudit) throw new Error('missing admin audit');

    const rpAfter = await countTable(sb, 'reward_payouts');
    steps.rpAfter = rpAfter;
    if (rpAfter !== rpBefore) throw new Error('reward_payouts wrote');

    const { data: m31After } = await sb
      .from('creator_rewards')
      .select('id, status')
      .eq('id', M31_REWARD)
      .maybeSingle();
    steps.m31Post = m31After;

    steps.productionReadonly = { ref: PRODUCTION_SUPABASE_REF, note: 'CLI RO separately' };

    report.evidence = {
      seam: 'ADMIN_AUTH→adminConfirmPayoutIntent→applyProviderConfirmation→PAID',
      mainReward: main.rewardId,
      mainIntent: reserved.intent.id,
      adminActor,
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
      join(OUT, `m4-4-admin-confirm-canary-${Date.now()}.json`),
      JSON.stringify(report, null, 2),
    );
    console.error(JSON.stringify(report, null, 2));
  }

  process.exit(report.ok ? 0 : 1);
}

main();
