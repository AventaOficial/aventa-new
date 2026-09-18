import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const t = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
const env = {};
for (const raw of t.split(/\n/)) {
  const line = raw.replace(/\r$/, '').trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[line.slice(0, eq).trim()] = v;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { count, error } = await sb.from('profiles').select('id', { count: 'exact', head: true });
if (error) {
  console.error('ERR', error.message);
  process.exit(1);
}
console.log('profiles_count', count);

const { data, error: e2 } = await sb
  .from('profiles')
  .select('id, display_name, slug, created_at, avatar_url')
  .order('created_at', { ascending: true })
  .limit(20);
if (e2) {
  console.error('ERR2', e2.message);
  process.exit(1);
}
for (const p of data ?? []) {
  console.log(
    JSON.stringify({
      display_name: p.display_name,
      slug: p.slug,
      created_at: p.created_at,
      has_avatar: Boolean(p.avatar_url),
      avatar_host: p.avatar_url ? new URL(p.avatar_url).host : null,
    }),
  );
}
