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
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
console.log('root', root);
console.log('urlLen', url?.length ?? 0, 'keyLen', key?.length ?? 0);
if (!url || !key) {
  console.error('Missing SUPABASE env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { error } = await sb
  .from('profiles')
  .select('rewards_terms_accepted_at, rewards_terms_version')
  .limit(1);

if (!error) {
  console.log('COLUMNS_ALREADY_OK');
  process.exit(0);
}

console.log('NEED_SQL', error.code || '', error.message);

// Intento vía SQL HTTP no disponible con solo service role (DDL).
// Fallback: documentar.
const sqlPath = path.join(root, 'docs/supabase-migrations/20260904_rewards_terms_accept.sql');
console.log('SQL_FILE', sqlPath);
console.log('Open Supabase Dashboard → SQL Editor and run that file.');
process.exit(2);
