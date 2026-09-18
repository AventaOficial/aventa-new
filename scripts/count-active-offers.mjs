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
const { count: active } = await sb
  .from('offers')
  .select('id', { count: 'exact', head: true })
  .in('status', ['approved', 'published'])
  .or(`expires_at.is.null,expires_at.gte.${now}`);

const { count: approvedAll } = await sb
  .from('offers')
  .select('id', { count: 'exact', head: true })
  .in('status', ['approved', 'published']);

const { data: live } = await sb
  .from('offers')
  .select('id, title, expires_at, created_by')
  .in('status', ['approved', 'published'])
  .or(`expires_at.is.null,expires_at.gte.${now}`)
  .order('created_at', { ascending: false })
  .limit(10);

console.log({ active, approvedAll, liveCount: live?.length ?? 0 });
console.log(live);
