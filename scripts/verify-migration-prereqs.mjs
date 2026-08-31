/**
 * Pre-checks for 20260830_beta_security_lockdown.sql (read-only via PostgREST).
 * Usage: node scripts/verify-migration-prereqs.mjs
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

async function fetchAllRows(supabase, table, select, pageSize = 1000) {
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select(select).range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

const ALLOWED = new Set([2, 4, 8, 12, -1, -2, -4, -6]);

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(2);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const report = {
    project: url.replace(/^https:\/\//, '').split('.')[0],
    checks: [],
    ok: true,
  };

  function add(name, ok, detail, blocker = false) {
    report.checks.push({ name, ok, detail, blocker });
    if (!ok && blocker) report.ok = false;
  }

  // --- 1) Duplicados offer_votes ---
  try {
    const votes = await fetchAllRows(supabase, 'offer_votes', 'offer_id,user_id,value');
    const seen = new Map();
    const dups = [];
    for (const v of votes) {
      const k = `${v.offer_id}|${v.user_id}`;
      if (seen.has(k)) dups.push({ offer_id: v.offer_id, user_id: v.user_id, count: 2 });
      else seen.set(k, true);
    }
    add(
      'offer_votes.duplicates',
      dups.length === 0,
      dups.length === 0
        ? `Sin duplicados (${votes.length} filas escaneadas)`
        : `${dups.length} pares duplicados (ej. offer_id=${dups[0].offer_id})`,
      true,
    );

    const legacy1 = votes.filter((v) => v.value === 1).length;
    const invalid = votes.filter((v) => !ALLOWED.has(v.value)).length;
    add(
      'offer_votes.legacy_values',
      true,
      `total=${votes.length}, value=1 legacy=${legacy1}, fuera del CHECK nuevo=${invalid} (NOT VALID no bloquea migración)`,
    );
  } catch (e) {
    add('offer_votes.duplicates', false, String(e.message), true);
  }

  // --- 2) Columna reporter_id en offer_reports ---
  try {
    const { error } = await supabase.from('offer_reports').select('id,reporter_id').limit(1);
    add(
      'offer_reports.reporter_id',
      !error,
      error ? error.message : 'Columna reporter_id accesible',
      true,
    );
  } catch (e) {
    add('offer_reports.reporter_id', false, String(e.message), true);
  }

  // --- 3) Tablas requeridas existen ---
  for (const table of [
    'user_roles',
    'offers',
    'offer_votes',
    'offer_events',
    'comments',
    'offer_reports',
    'moderation_logs',
  ]) {
    try {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      add(`table.${table}`, !error, error ? error.message : 'existe', table !== 'user_roles');
    } catch (e) {
      add(`table.${table}`, false, String(e.message), true);
    }
  }

  // --- 4) comments.status ---
  try {
    const { error: withStatus } = await supabase.from('comments').select('id,status').limit(1);
    add(
      'comments.status_column',
      !withStatus,
      withStatus ? withStatus.message : 'Columna status presente (policy filtrará approved)',
    );
  } catch (e) {
    add('comments.status_column', false, String(e.message));
  }

  // --- 5) offers.deleted_at ---
  try {
    const { error } = await supabase.from('offers').select('id,deleted_at').limit(1);
    add(
      'offers.deleted_at_column',
      !error,
      error ? `Sin deleted_at: policy usará rama sin deleted_at (${error.message})` : 'Columna deleted_at presente',
    );
  } catch (e) {
    add('offers.deleted_at_column', false, String(e.message));
  }

  // --- 6) user_roles sample (no expone secretos) ---
  try {
    const { count, error } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    const { data: owners } = await supabase
      .from('user_roles')
      .select('user_id,role')
      .eq('role', 'owner')
      .limit(5);
    add(
      'user_roles.rows',
      true,
      `filas=${count ?? '?'}, owners visibles=${owners?.length ?? 0}`,
    );
  } catch (e) {
    add('user_roles.rows', false, String(e.message));
  }

  // --- 7) Inferir UNIQUE: intento de insert duplicado en transacción no disponible; duplicados ya cubiertos arriba ---

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
