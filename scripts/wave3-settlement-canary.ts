/**
 * WAVE 3 Settlement Canary — SEPARATE from E2E.
 * Process-scoped: SETTLEMENT_BRIDGE_ENABLED=true + MONEY_PATH_FROZEN=false
 * Rewards stay OFF. Restore all flags after.
 *
 *   npx tsx scripts/wave3-settlement-canary.ts --commissionId=<uuid>
 *   npx tsx scripts/wave3-settlement-canary.ts --commissionId=<uuid> --execute
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  assertWave3StagingOnly,
  restoreWave3FailClosedFlags,
  snapshotWave3Flags,
  seamCommissionToSettlement,
} from '@/lib/wave3';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { runSettlementStagingCanary } from '@/lib/economy/settlement';

const ROOT = process.cwd();
const OUT = join(ROOT, 'scripts', '_wave3_reports');

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
  let commissionId = '';
  let execute = false;
  for (const a of argv) {
    if (a === '--execute') execute = true;
    if (a.startsWith('--commissionId=')) commissionId = a.slice('--commissionId='.length).trim();
  }
  return { commissionId, execute };
}

async function main() {
  const { commissionId, execute } = parseArgs(process.argv.slice(2));
  loadEnvFile(join(ROOT, '.env.local'));
  mkdirSync(OUT, { recursive: true });

  const flagsBefore = snapshotWave3Flags();
  const guard = assertWave3StagingOnly(process.env);
  if (!guard.ok) {
    const abort = { ok: false, reason: guard.reason };
    writeFileSync(join(OUT, 'wave3-settlement-canary-latest.json'), JSON.stringify(abort, null, 2));
    console.error(JSON.stringify(abort, null, 2));
    process.exit(1);
  }
  if (!commissionId) {
    console.error('ABORT: --commissionId=<uuid> required');
    process.exit(1);
  }
  if (isRewardsProgramActive()) {
    console.error('ABORT: rewards must stay OFF');
    process.exit(1);
  }

  // Process-scoped settlement window
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'true';
  process.env.MONEY_PATH_FROZEN = 'false';
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let report: Record<string, unknown> = {
    ok: false,
    mode: execute ? 'execute' : 'dry_run',
    guard,
    commissionId,
    flagsBefore,
  };

  try {
    if (!execute) {
      const canary = await runSettlementStagingCanary(sb, {
        commissionId,
        mode: 'dry_run',
      });
      report.canary = canary;
      report.ok = canary.ok === true;
    } else {
      // First settle via seam contract
      const first = await seamCommissionToSettlement(sb, { commissionId });
      const second = await seamCommissionToSettlement(sb, { commissionId });
      report.first = first.diagnostic;
      report.replay = second.diagnostic;
      report.ledgerEntryId = first.ledgerEntryId;
      report.replayReused =
        second.diagnostic.code === 'SETTLED_REUSED' ||
        (second.ledgerEntryId != null &&
          second.ledgerEntryId === first.ledgerEntryId);
      report.createdRewardForbidden =
        first.diagnostic.identity.createdReward === 'false';
      report.ok =
        first.diagnostic.ok &&
        Boolean(first.ledgerEntryId) &&
        report.replayReused === true &&
        report.createdRewardForbidden === true;
    }
  } finally {
    report.flagsAfter = restoreWave3FailClosedFlags();
  }

  writeFileSync(
    join(OUT, 'wave3-settlement-canary-latest.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL', err instanceof Error ? err.message : err);
  restoreWave3FailClosedFlags();
  process.exit(1);
});
