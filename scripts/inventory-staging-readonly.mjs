/**
 * READ-ONLY staging inventory (accurate via REST status codes).
 * supabase-js head+count can false-positive on missing tables — do not use for existence.
 * Usage: node scripts/inventory-staging-readonly.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import {
  assertStagingSupabaseUrl,
  STAGING_SUPABASE_REF,
  PRODUCTION_SUPABASE_REF,
} from './lib/supabaseProjectRefs.mjs';

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i)] = v;
  }
  return env;
}

async function restProbe(baseUrl, key, table) {
  const res = await fetch(
    `${baseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
    },
  );
  const bodyText = await res.text();
  let body = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText.slice(0, 80);
  }
  const cr = res.headers.get('content-range');
  let count = null;
  if (cr && cr.includes('/')) {
    const total = cr.split('/')[1];
    if (total && total !== '*') count = Number(total);
    else if (total === '*') count = 0;
  }
  const missing = res.status === 404 || body?.code === 'PGRST205';
  return {
    table,
    status: res.status,
    exists: missing ? false : res.status >= 200 && res.status < 300,
    count: missing ? null : count,
    code: body?.code ?? null,
    message: body?.message ? String(body.message).slice(0, 160) : null,
    hint: body?.hint ? String(body.hint).slice(0, 120) : null,
  };
}

const fileEnv = { ...loadEnv('.env.local'), ...loadEnv('.env.staging.local') };
const env = { ...fileEnv, ...process.env };
const url = String(env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const ref = assertStagingSupabaseUrl(url, env);
if (ref !== STAGING_SUPABASE_REF) {
  console.error('ABORT: unexpected ref', ref);
  process.exit(2);
}

const oaRes = await fetch(`${url}/rest/v1/`, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/openapi+json',
  },
});
const openapiOk = oaRes.ok;
const openapi = openapiOk ? await oaRes.json() : null;
const openapiTables = openapiOk
  ? Object.keys(openapi.paths || {})
      .filter((p) => p.startsWith('/') && !p.includes('{') && !p.startsWith('/rpc'))
      .map((p) => p.slice(1))
      .filter(Boolean)
      .sort()
  : [];
const openapiRpcs = openapiOk
  ? Object.keys(openapi.paths || {})
      .filter((p) => p.startsWith('/rpc/'))
      .map((p) => p.slice(1))
      .sort()
  : [];

const checklist = [
  'offers',
  'ofertas',
  'profiles',
  'offer_votes',
  'votos',
  'communities',
  'community_members',
  'moderation_log',
  'moderation_logs',
  'moderation_outcomes',
  'affiliate_configs',
  'affiliate_programs',
  'affiliate_events',
  'affiliate_clicks',
  'affiliate_ledger_entries',
  'affiliate_conversions',
  'affiliate_commissions',
  'affiliate_economic_events',
  'reward_outbound_clicks',
  'creator_rewards',
  'reward_payouts',
  'reward_audit_log',
  'ledger_settlements',
  'payouts',
  'stores',
  'merchants',
  'promotion_requests',
  'offer_fingerprints',
  'offer_interactions',
  'push_subscriptions',
  'site_settings',
  'user_roles',
  'user_roles_tbl',
  'admin_kpi_daily',
  'offer_events',
  'notifications',
  'write_jobs_queue',
  'app_config',
  'announcements',
  'plaza_requests',
  'plaza_discussions',
  'comments',
  'comment_likes',
  'user_bans',
  'hunter_supply_runs',
  'hunter_shadow_cycles',
  'hunter_shadow_outcomes',
  'product_price_snapshots',
  'distribution_brands',
  'distribution_destinations',
  'distribution_publications',
  'distribution_events',
  'zz_fake_table_xyz',
];

const toProbe = [...new Set([...checklist, ...openapiTables])];
const probes = [];
for (const table of toProbe) {
  probes.push(await restProbe(url, key, table));
}

const existing = probes.filter((p) => p.exists).sort((a, b) => a.table.localeCompare(b.table));
const missingChecklist = checklist
  .filter((t) => t !== 'zz_fake_table_xyz')
  .map((t) => probes.find((p) => p.table === t))
  .filter((p) => p && !p.exists)
  .map((p) => p.table)
  .sort();

// Auth users via GoTrue admin API (read-only list)
let authUsers = null;
{
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    authUsers = { error: `status_${res.status}` };
  } else {
    const data = await res.json();
    const users = data.users || data || [];
    authUsers = {
      listed: Array.isArray(users) ? users.length : null,
      note: 'admin users list per_page=1000',
    };
  }
}

let buckets = null;
{
  const res = await fetch(`${url}/storage/v1/bucket`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) buckets = { error: `status_${res.status}` };
  else {
    const data = await res.json();
    buckets = {
      count: Array.isArray(data) ? data.length : 0,
      names: Array.isArray(data) ? data.map((b) => b.name) : [],
      public_flags: Array.isArray(data)
        ? data.map((b) => ({ name: b.name, public: !!b.public }))
        : [],
    };
  }
}

const fake = probes.find((p) => p.table === 'zz_fake_table_xyz');
if (fake?.exists) {
  console.error('ABORT: false-positive detector failed (fake table exists)');
  process.exit(2);
}

const out = {
  audited_at: new Date().toISOString(),
  staging_ref: ref,
  production_ref_never_queried: PRODUCTION_SUPABASE_REF,
  openapi_ok: openapiOk,
  openapi_table_count: openapiTables.length,
  openapi_tables: openapiTables,
  openapi_rpc_count: openapiRpcs.length,
  openapi_rpcs_sample: openapiRpcs.slice(0, 40),
  auth_users: authUsers,
  storage_buckets: buckets,
  existing_relations: existing.map((p) => ({
    table: p.table,
    count: p.count,
    status: p.status,
  })),
  missing_aventa_checklist: missingChecklist,
  method_limits: [
    'REST/OpenAPI only — no information_schema (no DATABASE_URL)',
    'RLS/policies/indexes/FKs/triggers/functions bodies: UNKNOWN',
    'supabase CLI linked to PRODUCTION — unused on purpose',
    'Production live compare: NOT RUN (no prod credentials in local env)',
  ],
  false_positive_control: {
    zz_fake_table_xyz_exists: fake?.exists ?? null,
    zz_fake_status: fake?.status ?? null,
  },
};

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/staging-readonly-inventory.json', JSON.stringify(out, null, 2));

console.log(
  JSON.stringify(
    {
      ok: true,
      staging_ref: ref,
      openapi_tables: openapiTables.length,
      existing: existing.length,
      missing_checklist: missingChecklist.length,
      missing_checklist_names: missingChecklist,
      auth_users: authUsers,
      buckets: buckets?.names ?? buckets,
      legacy_signal: {
        ofertas: existing.find((e) => e.table === 'ofertas') || null,
        votos: existing.find((e) => e.table === 'votos') || null,
        offers: existing.find((e) => e.table === 'offers') || null,
        moderation_log: existing.find((e) => e.table === 'moderation_log') || null,
      },
      distribution: {
        brands: existing.find((e) => e.table === 'distribution_brands') || 'MISSING',
        destinations:
          existing.find((e) => e.table === 'distribution_destinations') || 'MISSING',
        publications:
          existing.find((e) => e.table === 'distribution_publications') || 'MISSING',
        events: existing.find((e) => e.table === 'distribution_events') || 'MISSING',
      },
    },
    null,
    2,
  ),
);
