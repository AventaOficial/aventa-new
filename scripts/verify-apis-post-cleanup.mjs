/**
 * Smoke test APIs post-migración RLS (service_role + endpoints públicos).
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

const env = loadEnvLocal();
const base = (env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com').replace(/\/$/, '');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const checks = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
  } catch (e) {
    checks.push({ name, ok: false, detail: String(e.message ?? e) });
  }
}

await check('db.user_roles', async () => {
  const { data, error } = await supabase.from('user_roles').select('user_id, role');
  if (error) throw error;
  const owners = (data ?? []).filter((r) => r.role === 'owner');
  return `filas=${data?.length ?? 0}, owners=${owners.length}`;
});

await check('db.offers.approved', async () => {
  const { count, error } = await supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved');
  if (error) throw error;
  return `approved=${count ?? 0}`;
});

await check('db.offer_votes', async () => {
  const { count, error } = await supabase.from('offer_votes').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return `votes=${count ?? 0}`;
});

await check('db.offer_events.insert', async () => {
  const { data: offer } = await supabase.from('offers').select('id').eq('status', 'approved').limit(1).maybeSingle();
  if (!offer?.id) return 'sin oferta approved para probe';
  const { error } = await supabase.from('offer_events').insert({
    offer_id: offer.id,
    event_type: 'view',
    user_id: null,
  });
  if (error) throw error;
  return 'insert ok (service_role)';
});

for (const path of ['/api/health', '/api/feed/home', '/api/app-config']) {
  await check(`http${path}`, async () => {
    const res = await fetch(`${base}${path}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return `HTTP ${res.status}`;
  });
}

await check('commission_program.inactive', async () => {
  const raw = (process.env.COMMISSION_PROGRAM_ACTIVE ?? env.COMMISSION_PROGRAM_ACTIVE ?? 'false').toLowerCase();
  const active = raw === 'true' || raw === '1';
  if (active) throw new Error('COMMISSION_PROGRAM_ACTIVE está activo');
  return 'COMMISSION_PROGRAM_ACTIVE=false (default)';
});

const ok = checks.every((c) => c.ok);
console.log(JSON.stringify({ checks, ok }, null, 2));
process.exit(ok ? 0 : 1);
