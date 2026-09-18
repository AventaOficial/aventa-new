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

const now = new Date().toISOString();

const { data: sample } = await sb
  .from('offers')
  .select('id, status, expires_at, title')
  .in('status', ['approved', 'published'])
  .order('created_at', { ascending: false })
  .limit(5);

console.log('sample', sample);

for (const o of sample ?? []) {
  const { data: a, error: ea } = await sb
    .from('offers')
    .select('id')
    .eq('id', o.id)
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .maybeSingle();

  const { data: b, error: eb } = await sb
    .from('offers')
    .select('id, status, expires_at')
    .eq('id', o.id)
    .in('status', ['approved', 'published'])
    .maybeSingle();

  const expired = b?.expires_at && new Date(b.expires_at).getTime() < Date.now();
  console.log({
    id: o.id.slice(0, 8),
    dualOr: Boolean(a),
    dualOrErr: ea?.message ?? null,
    inStatus: Boolean(b),
    expired: Boolean(expired),
  });
}
