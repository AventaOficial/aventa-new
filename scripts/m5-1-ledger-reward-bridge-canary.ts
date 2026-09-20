/**
 * M5.1 — Controlled staging canary for Ledger → Reward bridge.
 * No production. No deploy. Leaves money flags fail-closed at exit.
 *
 *   npx tsx scripts/m5-1-ledger-reward-bridge-canary.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertWave3StagingOnly,
  restoreWave3FailClosedFlags,
  snapshotWave3Flags,
} from '@/lib/wave3';
import { STAGING_SUPABASE_REF } from '@/lib/supabase/projectRefs';
import {
  scheduleLedgerRewardAttempt,
  processLedgerRewardAttempt,
  reconcileLedgerRewardBridge,
  readLedgerRewardOutcome,
} from '@/lib/rewards/ledgerRewardBridge';

const TAG = `m51_canary_${Date.now()}`;

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

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  loadEnv(join(process.cwd(), '.env.staging.local'));

  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET ?? 'staging';
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';
  // Process-scoped unfreeze only for schedule/process path under rewards OFF.
  process.env.MONEY_PATH_FROZEN = 'false';

  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M5.1',
    stagingRef: STAGING_SUPABASE_REF,
    realMoney: false,
    tag: TAG,
    flagsBefore: snapshotWave3Flags(),
  };

  const guard = assertWave3StagingOnly(process.env);
  report.guard = guard;
  if (!guard.ok) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  if (!url.includes(STAGING_SUPABASE_REF) || !key) {
    report.error = 'staging_credentials_missing';
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const sb: SupabaseClient = client(url, key);

  try {
    const { data: ledger, error: lErr } = await sb
      .from('affiliate_ledger_entries')
      .insert({
        network: 'other',
        amount_cents: 100,
        currency: 'MXN',
        status: 'accrued',
        external_ref: `${TAG}_ledger`,
        notes: 'settlement_bridge_m1',
        source: 'api',
        meta: {
          settlement: {
            bridgeVersion: 'm1',
            commissionId: `canary-${TAG}`,
            rewardBoundary: 'future_createRewardFromLedgerEntry',
          },
        },
      })
      .select('id, meta')
      .maybeSingle();

    if (lErr || !ledger?.id) {
      report.error = lErr?.message ?? 'ledger_insert_failed';
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const ledgerId = String(ledger.id);
    report.ledgerEntryId = ledgerId;

    const scheduled = await scheduleLedgerRewardAttempt(sb, {
      ledgerEntryId: ledgerId,
      commissionId: `canary-${TAG}`,
    });
    report.scheduled = scheduled;

    const processed = await processLedgerRewardAttempt(sb, ledgerId);
    report.processed = processed;

    if (processed.outcome !== 'deferred' || processed.reason !== 'program_inactive') {
      report.error = 'expected_deferred_program_inactive';
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const { count: rewardCount } = await sb
      .from('creator_rewards')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_entry_id', ledgerId);
    report.rewardCount = rewardCount ?? 0;
    if ((rewardCount ?? 0) !== 0) {
      report.error = 'unexpected_reward_created';
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const recon = await reconcileLedgerRewardBridge(sb, {
      limit: 5,
      lookbackHours: 1,
    });
    report.reconcile = {
      scanned: recon.scanned,
      attempted: recon.attempted,
      deferred: recon.deferred,
      created: recon.created,
    };

    const { data: refreshed } = await sb
      .from('affiliate_ledger_entries')
      .select('meta')
      .eq('id', ledgerId)
      .maybeSingle();
    report.durableOutcome = readLedgerRewardOutcome(
      (refreshed?.meta ?? {}) as Record<string, unknown>,
    );

    await sb.from('affiliate_ledger_entries').delete().eq('id', ledgerId);

    report.ok = true;
    report.flagsAfter = restoreWave3FailClosedFlags();
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    report.flagsAfter = restoreWave3FailClosedFlags();
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

main().catch((e) => {
  restoreWave3FailClosedFlags();
  console.error(e);
  process.exit(1);
});
