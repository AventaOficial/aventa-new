/**
 * Parse Gate 0 prod catalog JSON dumps into a compact summary (no secrets).
 * Usage: node scripts/parse-gate0-prod-catalog.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';

function loadRows(path) {
  const raw = readFileSync(path, 'utf8');
  const start = raw.indexOf('{');
  if (start < 0) return { error: 'no_json', rows: [] };
  const json = JSON.parse(raw.slice(start));
  return { rows: json.rows || [], warning: json.warning };
}

const schemas = loadRows('tmp/g0_prod_g0_01_schemas.json');
const tables = loadRows('tmp/g0_prod_g0_02_tables.json');
const columns = loadRows('tmp/g0_prod_g0_03_columns.json');
const pks = loadRows('tmp/g0_prod_g0_04_pks.json');
const fks = loadRows('tmp/g0_prod_g0_05_fks.json');
const uniques = loadRows('tmp/g0_prod_g0_06_uniques.json');
const indexes = loadRows('tmp/g0_prod_g0_07_indexes.json');
const rls = loadRows('tmp/g0_prod_g0_08_rls.json');
const policies = loadRows('tmp/g0_prod_g0_09_policies.json');
const triggers = loadRows('tmp/g0_prod_g0_10_triggers.json');
const functions = loadRows('tmp/g0_prod_g0_11_functions.json');
const views = loadRows('tmp/g0_prod_g0_12_views.json');

const baseTables = tables.rows.filter((r) => r.table_type === 'BASE TABLE').map((r) => r.table_name);
const viewNames = tables.rows.filter((r) => r.table_type === 'VIEW').map((r) => r.table_name);

const colsByTable = {};
for (const c of columns.rows) {
  (colsByTable[c.table_name] ||= []).push({
    name: c.column_name,
    data_type: c.data_type,
    udt: c.udt_name,
    nullable: c.is_nullable,
    default: c.column_default,
    generated: c.is_generated,
    generation: c.generation_expression,
    position: c.ordinal_position,
  });
}

const pkByTable = {};
for (const p of pks.rows) {
  (pkByTable[p.table_name] ||= []).push(p.column_name);
}

const fkByTable = {};
for (const f of fks.rows) {
  (fkByTable[f.from_table] ||= []).push({
    column: f.from_column,
    to: `${f.to_table}.${f.to_column}`,
    name: f.constraint_name,
  });
}

const uniqueByTable = {};
for (const u of uniques.rows) {
  (uniqueByTable[u.table_name] ||= []).push({ name: u.constraint_name, columns: u.columns });
}

const idxByTable = {};
for (const i of indexes.rows) {
  (idxByTable[i.tablename] ||= []).push({ name: i.indexname, def: i.indexdef });
}

const rlsByTable = {};
for (const r of rls.rows) {
  rlsByTable[r.table_name] = { enabled: r.rls_enabled, forced: r.rls_forced };
}

const polByTable = {};
for (const p of policies.rows) {
  (polByTable[p.tablename] ||= []).push({
    name: p.policyname,
    cmd: p.cmd,
    roles: p.roles,
    permissive: p.permissive,
    using: p.qual,
    with_check: p.with_check,
  });
}

const trigByTable = {};
for (const t of triggers.rows) {
  (trigByTable[t.table_name] ||= []).push({
    name: t.trigger_name,
    event: t.event_manipulation,
    timing: t.action_timing,
    action: t.action_statement,
  });
}

const foundationCandidates = [
  'offers',
  'profiles',
  'offer_votes',
  'offer_events',
  'offer_favorites',
  'comments',
  'comment_likes',
  'moderation_logs',
  'user_roles',
  'user_bans',
  'notifications',
  'user_email_preferences',
  'offer_reports',
  'write_jobs_queue',
  'app_config',
  'announcements',
  'plaza_requests',
  'plaza_discussions',
  'community_offers',
];

const objects = {};
for (const name of [...new Set([...baseTables, ...viewNames])].sort()) {
  objects[name] = {
    kind: baseTables.includes(name) ? 'BASE TABLE' : viewNames.includes(name) ? 'VIEW' : 'UNKNOWN',
    columns: colsByTable[name] || [],
    primary_key: pkByTable[name] || [],
    foreign_keys: fkByTable[name] || [],
    uniques: uniqueByTable[name] || [],
    indexes: (idxByTable[name] || []).map((i) => ({ name: i.name, def: i.def })),
    rls: rlsByTable[name] || null,
    policies: polByTable[name] || [],
    triggers: trigByTable[name] || [],
    view_definition: (views.rows.find((v) => v.table_name === name) || {}).view_definition || null,
  };
}

const summary = {
  audited_at: new Date().toISOString(),
  source: 'supabase db query --linked (mkgsrpsuvedwwlzmzmzh) READ-ONLY SELECT',
  schemas: schemas.rows.map((r) => r.schema_name),
  base_table_count: baseTables.length,
  view_count: viewNames.length,
  base_tables: baseTables.sort(),
  views: viewNames.sort(),
  function_count: functions.rows.length,
  functions: functions.rows.map((f) => ({
    name: f.function_name,
    args: f.args,
    result: f.result_type,
  })),
  rls_disabled_tables: baseTables.filter((t) => rlsByTable[t] && rlsByTable[t].enabled === false),
  rls_enabled_tables: baseTables.filter((t) => rlsByTable[t] && rlsByTable[t].enabled === true),
  foundation_candidates_present: foundationCandidates.filter((t) => baseTables.includes(t)),
  foundation_candidates_missing: foundationCandidates.filter((t) => !baseTables.includes(t)),
  objects,
};

writeFileSync('tmp/gate0_prod_catalog_summary.json', JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify(
    {
      schemas: summary.schemas,
      base_tables: summary.base_table_count,
      views: summary.view_count,
      functions: summary.function_count,
      rls_off: summary.rls_disabled_tables,
      foundation_missing: summary.foundation_candidates_missing,
      sample_offers_cols: (summary.objects.offers?.columns || []).map((c) => c.name),
      sample_offers_pk: summary.objects.offers?.primary_key,
      sample_offers_rls: summary.objects.offers?.rls,
    },
    null,
    2,
  ),
);
