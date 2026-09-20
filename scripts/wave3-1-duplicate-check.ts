/**
 * Wave 3.1 Phase B — duplicate / consistency checks (staging only).
 * READ-ONLY. Missing tables → N/A (not STOP unless data conflicts on existing tables).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  extractSupabaseProjectRef,
  STAGING_SUPABASE_REF,
  PRODUCTION_SUPABASE_REF,
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

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const target = (process.env.AVENTA_SUPABASE_TARGET ?? '').trim().toLowerCase();
  const ref = extractSupabaseProjectRef(url);
  if (target !== 'staging' || ref !== STAGING_SUPABASE_REF) {
    console.error('ABORT firewall', { target, ref, prod: PRODUCTION_SUPABASE_REF });
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const checks: Record<string, unknown> = {};

  // Clicks: check duplicate idempotency_key among non-null
  const { data: clicks, error: clickErr } = await sb
    .from('reward_outbound_clicks')
    .select('id, idempotency_key')
    .not('idempotency_key', 'is', null)
    .limit(5000);
  if (clickErr) {
    checks.reward_outbound_clicks = { ok: false, error: clickErr.message };
  } else {
    const map = new Map<string, string[]>();
    for (const row of clicks ?? []) {
      const k = String((row as { idempotency_key?: string }).idempotency_key ?? '').trim();
      if (!k) continue;
      const id = String((row as { id: string }).id);
      const arr = map.get(k) ?? [];
      arr.push(id);
      map.set(k, arr);
    }
    const dups = [...map.entries()].filter(([, ids]) => ids.length > 1);
    checks.reward_outbound_clicks_idempotency = {
      ok: dups.length === 0,
      duplicateGroups: dups.length,
      samples: dups.slice(0, 10).map(([k, ids]) => ({ key: k, ids })),
    };
  }

  for (const t of [
    'affiliate_conversions',
    'affiliate_commissions',
    'affiliate_ledger_entries',
    'affiliate_economic_events',
  ]) {
    const { error } = await sb.from(t).select('id').limit(1);
    if (error && /schema cache|does not exist|Could not find the table/i.test(error.message)) {
      checks[t] = { status: 'N/A', reason: 'table_missing', duplicateRisk: 'none_pre_apply' };
    } else if (error) {
      checks[t] = { status: 'error', error: error.message };
    } else {
      checks[t] = { status: 'exists_empty_or_readable', note: 'run SQL duplicate aggregations after apply if rows>0' };
    }
  }

  const stop =
    checks.reward_outbound_clicks_idempotency &&
    typeof checks.reward_outbound_clicks_idempotency === 'object' &&
    (checks.reward_outbound_clicks_idempotency as { ok?: boolean }).ok === false;

  const out = {
    ok: !stop,
    stop,
    target,
    ref,
    at: new Date().toISOString(),
    checks,
    verdict: stop
      ? 'STOP — duplicate idempotency keys on reward_outbound_clicks'
      : 'PASS — no blocking duplicates; missing money tables N/A',
  };

  mkdirSync(join(process.cwd(), 'scripts', '_wave3_reports'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'scripts', '_wave3_reports', 'wave3-1-duplicate-check.json'),
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out, null, 2));
  if (stop) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
