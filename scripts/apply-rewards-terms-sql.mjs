import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.local');
const t = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const raw of t.split(/\n/)) {
  const line = raw.replace(/\r$/, '').trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Check first
{
  const { error } = await sb
    .from('profiles')
    .select('rewards_terms_accepted_at, rewards_terms_version')
    .limit(1);
  if (!error) {
    console.log('ALREADY_APPLIED');
    process.exit(0);
  }
  console.log('before:', error.message);
}

// Try via postgres REST isn't available. Attempt rpc if exists.
const sql = `
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rewards_terms_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rewards_terms_version text NULL;
COMMENT ON COLUMN public.profiles.rewards_terms_accepted_at IS
  'Momento en que el usuario aceptó los términos del Programa de Recompensas (sección 8) al elegir Oferta de Bienvenida.';
COMMENT ON COLUMN public.profiles.rewards_terms_version IS
  'Versión de términos aceptada (alineada con REWARDS_TERMS_VERSION en lib/rewards/config.ts).';
`;

for (const fn of ['exec_sql', 'execute_sql', 'run_sql', 'admin_exec_sql']) {
  const { error } = await sb.rpc(fn, { query: sql });
  if (!error) {
    console.log('APPLIED_VIA_RPC', fn);
    process.exit(0);
  }
  const { error: e2 } = await sb.rpc(fn, { sql });
  if (!e2) {
    console.log('APPLIED_VIA_RPC_SQL', fn);
    process.exit(0);
  }
}

console.log('NO_RPC_DDL');
process.exit(3);
