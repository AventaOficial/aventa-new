/**
 * M2 — Settlement staging canary (dry-run default, --execute for live settle).
 *
 * Usage:
 *   npx tsx scripts/m2-settlement-staging-canary.ts --commissionId=<uuid>
 *   npx tsx scripts/m2-settlement-staging-canary.ts --commissionId=<uuid> --execute
 *
 * Safety:
 * - Requires SETTLEMENT_BRIDGE_ENABLED=true (runtime only — never commit)
 * - Requires MONEY_PATH_FROZEN=false
 * - Blocks production runtime + production Supabase ref
 * - Requires AVENTA_SUPABASE_TARGET=staging + staging ref (.env.local)
 * - Dry-run: no settleCommission / no ledger writes
 * - Execute: calls settleCommission (ledger only — no rewards/payouts)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  runSettlementStagingCanary,
  SETTLEMENT_STAGING_CANARY_BOUNDARY,
} from '../lib/economy/settlement';

function loadEnvFile(path: string, { override = false } = {}) {
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
    if (override || process.env[key] == null) process.env[key] = v;
  }
}

function parseArgs(argv: string[]) {
  let commissionId = '';
  let execute = false;
  for (const arg of argv) {
    if (arg === '--execute') execute = true;
    else if (arg.startsWith('--commissionId=')) {
      commissionId = arg.slice('--commissionId='.length).trim();
    } else if (arg === '--help' || arg === '-h') {
      return { help: true as const, commissionId: '', execute: false };
    }
  }
  return { help: false as const, commissionId, execute };
}

function printHelp() {
  console.log(`M2 settlement staging canary

  npx tsx scripts/m2-settlement-staging-canary.ts --commissionId=<uuid>
  npx tsx scripts/m2-settlement-staging-canary.ts --commissionId=<uuid> --execute

Boundary: ${JSON.stringify(SETTLEMENT_STAGING_CANARY_BOUNDARY, null, 2)}
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  loadEnvFile(join(process.cwd(), '.env.local'));
  loadEnvFile(join(process.cwd(), '.env'));

  if (!args.commissionId) {
    console.error('ABORT: --commissionId=<uuid> required');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    '';
  if (!url || !key) {
    console.error('ABORT: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }

  const mode = args.execute ? 'execute' : 'dry_run';
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await runSettlementStagingCanary(supabase, {
    commissionId: args.commissionId,
    mode,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }

  if (result.mode === 'execute' && !result.settlement.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL', err instanceof Error ? err.message : err);
  process.exit(1);
});
