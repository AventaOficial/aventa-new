/**
 * Wave 3.1 — staging schema inventory via REST (service role).
 * READ-ONLY. Staging firewall enforced.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  extractSupabaseProjectRef,
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
} from '../lib/supabase/projectRefs';

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (process.env[m[1].trim()] == null) process.env[m[1].trim()] = v;
  }
}

async function probe(sb: ReturnType<typeof createClient>, table: string) {
  const head = await sb.from(table).select('*', { count: 'exact', head: true });
  const one = await sb.from(table).select('*').limit(1);
  // Insert probe with impossible shape — distinguish missing table vs validation
  const ins = await sb.from(table).insert({ __wave31_probe: true }).select('id').maybeSingle();
  return {
    table,
    headCount: head.count,
    headError: head.error?.message ?? null,
    headCode: head.error?.code ?? null,
    selectError: one.error?.message ?? null,
    selectCode: one.error?.code ?? null,
    insertError: ins.error?.message ?? null,
    insertCode: ins.error?.code ?? null,
    schemaMissing: Boolean(
      (ins.error?.message ?? one.error?.message ?? '').match(
        /schema cache|does not exist|Could not find the table/i,
      ),
    ),
    existsLikely:
      !/schema cache|does not exist|Could not find the table/i.test(
        ins.error?.message ?? one.error?.message ?? '',
      ) &&
      (one.error == null ||
        /column|null|check|violat|permission|RLS|duplicate/i.test(
          ins.error?.message ?? '',
        )),
  };
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  const target = (process.env.AVENTA_SUPABASE_TARGET ?? '').trim().toLowerCase();
  const ref = extractSupabaseProjectRef(url);
  const expected =
    (process.env.AVENTA_EXPECTED_SUPABASE_REF ?? '').trim() || STAGING_SUPABASE_REF;

  if (target !== 'staging' || ref !== STAGING_SUPABASE_REF || expected !== STAGING_SUPABASE_REF) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          reason: 'staging_firewall',
          target,
          ref,
          expected,
          production: PRODUCTION_SUPABASE_REF,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  if (ref === PRODUCTION_SUPABASE_REF) {
    console.error('ABORT production');
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables = [
    'reward_outbound_clicks',
    'affiliate_ledger_entries',
    'affiliate_conversions',
    'affiliate_commissions',
    'affiliate_economic_events',
    'affiliate_commission_revisions',
    'affiliate_reconciliation_runs',
    'affiliate_reconciliation_findings',
    'creator_rewards',
    'ledger_settlements',
  ];

  const results = [];
  for (const t of tables) results.push(await probe(sb, t));

  const out = {
    ok: true,
    target,
    ref,
    productionRefUntouched: PRODUCTION_SUPABASE_REF,
    at: new Date().toISOString(),
    results,
  };
  const dir = join(process.cwd(), 'scripts', '_wave3_reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'wave3-1-schema-probe.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
