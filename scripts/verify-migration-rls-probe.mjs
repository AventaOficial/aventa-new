import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i <= 0) continue;
  env[t.slice(0, i)] = t.slice(i + 1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const checks = [];

const { data: voteRows } = await admin.from('offer_votes').select('value,offer_id');
const distinct = [...new Set((voteRows ?? []).map((v) => v.value))].sort((a, b) => a - b);
checks.push({
  name: 'offer_votes.distinct_values',
  ok: true,
  detail: distinct.length ? distinct.join(', ') : '(sin votos)',
});

const anonRoles = await anon.from('user_roles').select('user_id,role').limit(5);
checks.push({
  name: 'anon.user_roles.select',
  ok: !anonRoles.error,
  detail: anonRoles.error?.message ?? 'filas=' + (anonRoles.data?.length ?? 0),
});

const fakeId = '00000000-0000-4000-8000-000000000000';
const anonInsert = await anon.from('user_roles').insert({ user_id: fakeId, role: 'owner' }).select();
checks.push({
  name: 'anon.user_roles.insert_blocked',
  ok: Boolean(anonInsert.error),
  detail: anonInsert.error?.message ?? 'PELIGRO: insert anon permitido sin error',
  blocker: !anonInsert.error,
});

const sampleOfferId = voteRows?.[0]?.offer_id;
if (sampleOfferId) {
  const ev = await anon
    .from('offer_events')
    .insert({ offer_id: sampleOfferId, event_type: 'view', user_id: null });
  checks.push({
    name: 'anon.offer_events.insert_blocked',
    ok: Boolean(ev.error),
    detail: ev.error?.message ?? 'PELIGRO: insert anon permitido',
    blocker: !ev.error,
  });
}

const pub = await anon.from('offers').select('id,status').eq('status', 'approved').limit(3);
checks.push({
  name: 'anon.offers.select_approved',
  ok: !pub.error,
  detail: pub.error?.message ?? 'approved visibles=' + (pub.data?.length ?? 0),
});

const voteInsert = await anon
  .from('offer_votes')
  .insert({ offer_id: sampleOfferId, user_id: fakeId, value: 2 });
checks.push({
  name: 'anon.offer_votes.insert_blocked',
  ok: Boolean(voteInsert.error),
  detail: voteInsert.error?.message ?? 'PELIGRO: insert anon permitido',
  blocker: !voteInsert.error,
});

console.log(
  JSON.stringify(
    { checks, ok: checks.every((c) => c.ok && !c.blocker) },
    null,
    2,
  ),
);
