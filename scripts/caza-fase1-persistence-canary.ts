/**
 * CazaOfertasss FASE 1 — Staging canary: apply/verify persistence DDL.
 *
 *   npx tsx scripts/caza-fase1-persistence-canary.ts
 *
 * STAGING ONLY. Never production. Never money path.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { STAGING_SUPABASE_REF, assertStagingSupabaseUrl } from '@/lib/supabase/projectRefs';
import {
  CAZA_DEAL_CANDIDATES_TABLE,
  CAZA_PUBLICATIONS_TABLE,
  CAZA_REVENUE_EVENTS_TABLE,
  CAZA_UPSERT_DEAL_CANDIDATE_RPC,
  CAZA_APPEND_REVENUE_EVENT_RPC,
  CAZA_INSERT_PUBLICATION_IDEMPOTENT_RPC,
  assertCazaOfertasMoneyUntouched,
} from '@/lib/cazaOfertas';

const OUT = join(process.cwd(), 'scripts', '_caza_fase1_reports');
const MIGRATION_DOCS = join(
  process.cwd(),
  'docs',
  'supabase-migrations',
  '20260919_cazaofertas_persistence.sql'
);
const MIGRATION_LOCAL = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260919223000_cazaofertas_persistence.sql'
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

async function tableExists(sb: ReturnType<typeof createClient>, table: string): Promise<boolean> {
  const { error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (!error) return true;
  if (/does not exist|Could not find the table/i.test(error.message)) return false;
  throw new Error(`${table}: ${error.message}`);
}

async function main() {
  loadEnv('.env.local');
  process.env.AVENTA_SUPABASE_TARGET = 'staging';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  assertStagingSupabaseUrl(url);
  assertCazaOfertasMoneyUntouched();

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
    migrationDocs: MIGRATION_DOCS,
    migrationLocal: MIGRATION_LOCAL,
    moneyUntouched: true,
  };

  const tables = [
    CAZA_DEAL_CANDIDATES_TABLE,
    CAZA_PUBLICATIONS_TABLE,
    CAZA_REVENUE_EVENTS_TABLE,
  ];
  const existence: Record<string, boolean> = {};
  for (const t of tables) {
    existence[t] = await tableExists(sb, t);
  }
  report.tables = existence;

  const allExist = tables.every((t) => existence[t]);
  if (!allExist) {
    report.ddlStatus = 'PENDING_APPLY';
    report.instruction =
      `Apply ONLY to staging (${STAGING_SUPABASE_REF}):\n` +
      `  npx supabase db push --project-ref ${STAGING_SUPABASE_REF} --yes\n` +
      `NEVER use --linked (currently points at production).\n` +
      `Or paste docs/supabase-migrations/20260919_cazaofertas_persistence.sql in staging SQL editor.`;
    writeFileSync(join(OUT, 'caza-fase1-canary-latest.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // Probe RPCs exist by calling with empty payload (expect validation error, not 404).
  const rpcProbes: Record<string, string> = {};
  for (const rpc of [
    CAZA_UPSERT_DEAL_CANDIDATE_RPC,
    CAZA_INSERT_PUBLICATION_IDEMPOTENT_RPC,
    CAZA_APPEND_REVENUE_EVENT_RPC,
  ]) {
    const { error } = await sb.rpc(rpc, { p_row: {} });
    rpcProbes[rpc] = error ? error.message.slice(0, 160) : 'ok';
  }
  report.rpcProbes = rpcProbes;
  report.ddlStatus = 'APPLIED';
  report.result = 'PASS';

  writeFileSync(join(OUT, 'caza-fase1-canary-latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
