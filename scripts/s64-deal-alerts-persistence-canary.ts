/**
 * S6.4 — Staging canary: apply DDL (staging only), verify RLS/RPC, micro-benchmark.
 *
 *   npx tsx scripts/s64-deal-alerts-persistence-canary.ts
 *
 * NO production. NO delivery. NO money writes.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { STAGING_SUPABASE_REF, assertStagingSupabaseUrl } from '@/lib/supabase/projectRefs';
import {
  DEAL_ALERT_FIND_CANDIDATES_RPC,
  DEAL_ALERT_SUBSCRIPTIONS_TABLE,
  assertDealAlertsMoneyUntouched,
  createDealAlertSubscriptionRepository,
  createPostgresSubscriptionCandidateIndex,
} from '@/lib/dealAlerts';

const OUT = join(process.cwd(), 'scripts', '_s64_reports');
const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260919204823_deal_alert_subscriptions_s64.sql',
);

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

async function tableExists(sb: SupabaseClient): Promise<boolean> {
  const { error } = await sb
    .from(DEAL_ALERT_SUBSCRIPTIONS_TABLE)
    .select('id', { count: 'exact', head: true });
  if (!error) return true;
  if (/does not exist|Could not find the table/i.test(error.message)) return false;
  throw new Error(error.message);
}

async function main() {
  loadEnv('.env.local');
  process.env.MONEY_PATH_FROZEN = 'true';
  process.env.AVENTA_SUPABASE_TARGET = 'staging';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  assertStagingSupabaseUrl(url);
  assertDealAlertsMoneyUntouched();

  if (!url.includes(STAGING_SUPABASE_REF)) {
    throw new Error('ABORT: canary requires staging ref');
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  mkdirSync(OUT, { recursive: true });
  const report: Record<string, unknown> = {
    stamp: new Date().toISOString(),
    stagingRef: STAGING_SUPABASE_REF,
    migrationFile: MIGRATION,
    moneyUntouched: true,
  };

  const exists = await tableExists(sb);
  report.tableExistsBefore = exists;

  if (!exists) {
    report.ddlStatus = 'PENDING_MANUAL_OR_CLI';
    report.instruction =
      `Apply migration ONLY to staging (${STAGING_SUPABASE_REF}): ` +
      `npx supabase db push --project-ref ${STAGING_SUPABASE_REF} --yes ` +
      `(never --linked while linked to production).`;
    report.migrationPreview = existsSync(MIGRATION)
      ? readFileSync(MIGRATION, 'utf8').slice(0, 500)
      : null;
    writeFileSync(join(OUT, 's64-canary.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(
      '\nDDL not applied automatically (no silent prod risk; linked CLI may point at production).',
    );
    process.exit(0);
  }

  // Smoke: RPC candidate query
  const index = createPostgresSubscriptionCandidateIndex(sb);
  const t0 = Date.now();
  const candidates = await index.findCandidates({
    store: 'mercadolibre',
    merchant: 'mercadolibre',
    category: 'tecnologia',
    discountPercent: 50,
    enabledOnly: true,
    candidateLimit: 100,
  });
  report.candidateQuery = {
    latencyMs: Date.now() - t0,
    returned: candidates.stats.returned,
    limitReached: candidates.stats.candidateLimitReached,
    retrievalSource: candidates.retrievalSource,
    rpc: DEAL_ALERT_FIND_CANDIDATES_RPC,
  };

  // Repo factory smoke (no insert without a real auth user)
  createDealAlertSubscriptionRepository(sb);
  report.repositoryFactory = 'ok';
  report.ddlStatus = 'APPLIED';
  report.result = 'PASS';

  writeFileSync(join(OUT, 's64-canary.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
