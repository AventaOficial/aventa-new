/**
 * STAGING W1.5 smoke — oojshofrpbfwsiypcecr only.
 * Does not print secrets. Aborts if URL ref is production.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && out[m[1]] === undefined) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const env = loadEnv(path.join(process.cwd(), '.env.local'));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    console.log(JSON.stringify({ ok: false, error: 'missing_env_keys' }));
    process.exit(1);
  }
  const ref = new URL(url).hostname.split('.')[0];
  if (ref === 'mkgsrpsuvedwwlzmzmzh') {
    console.log(JSON.stringify({ ok: false, error: 'ABORT_production_target' }));
    process.exit(2);
  }
  if (ref !== 'oojshofrpbfwsiypcecr') {
    console.log(JSON.stringify({ ok: false, error: 'ABORT_unexpected_ref', ref }));
    process.exit(2);
  }

  const svc = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const results = { target_ref: ref, production_writes: 0, checks: {} };

  {
    const { data, error } = await svc.from('profiles').select('id, display_name, role').limit(1);
    results.checks.profile = { ok: !error && (data?.length ?? 0) >= 1, n: data?.length ?? 0, err: error?.message ?? null };
  }

  {
    const { data, error } = await svc.from('ofertas_ranked_general').select('id, title, status').limit(10);
    const seeded = (data || []).filter((r) => String(r.title || '').includes('[STAGING_W15_SEED]'));
    results.checks.feed = { ok: !error && seeded.length >= 1, n: data?.length ?? 0, seeded: seeded.length, err: error?.message ?? null };
  }

  {
    const id = 'a1111111-1111-4111-8111-111111111101';
    const { data, error } = await svc.from('offers').select('id, title, status, offer_url').eq('id', id).maybeSingle();
    results.checks.detail = {
      ok: !error && data?.status === 'approved' && String(data.offer_url || '').includes('example.com'),
      status: data?.status ?? null,
      err: error?.message ?? null,
    };
  }

  {
    const { data, error } = await svc.from('offers').select('id, status').eq('status', 'pending').limit(5);
    results.checks.moderation_pending = { ok: !error && (data?.length ?? 0) >= 1, n: data?.length ?? 0, err: error?.message ?? null };
  }

  {
    const { data, error } = await svc
      .from('comments')
      .select('id, content, status')
      .eq('offer_id', 'a1111111-1111-4111-8111-111111111101')
      .limit(5);
    results.checks.comments = { ok: !error && (data?.length ?? 0) >= 1, n: data?.length ?? 0, err: error?.message ?? null };
  }

  {
    const offerId = 'a1111111-1111-4111-8111-111111111101';
    const userId = '6aa733d4-02cb-4c64-92fc-cf45fdcee344';
    await svc.from('offer_votes').delete().eq('offer_id', offerId).eq('user_id', userId);
    const { error: insErr } = await svc.from('offer_votes').insert({ offer_id: offerId, user_id: userId, value: 2 });
    const { data: voteRow } = await svc.from('offer_votes').select('id, value').eq('offer_id', offerId).eq('user_id', userId).maybeSingle();
    await svc.from('offer_votes').delete().eq('offer_id', offerId).eq('user_id', userId);
    results.checks.vote = { ok: !insErr && voteRow?.value === 2, err: insErr?.message ?? null };
  }

  {
    const { error } = await svc.from('offer_events').insert({
      offer_id: 'a1111111-1111-4111-8111-111111111101',
      user_id: '6aa733d4-02cb-4c64-92fc-cf45fdcee344',
      event_type: 'outbound',
    });
    results.checks.cta_track_event = { ok: !error, err: error?.message ?? null };
  }

  {
    const key = 'staging_w15_smoke_probe';
    const { error: upErr } = await svc.from('app_config').upsert({ key, value: true }, { onConflict: 'key' });
    const { data, error: rdErr } = await svc.from('app_config').select('key, value').eq('key', key).maybeSingle();
    await svc.from('app_config').delete().eq('key', key);
    results.checks.app_config_service = { ok: !upErr && !rdErr && data?.key === key, err: upErr?.message || rdErr?.message || null };
  }

  {
    const { data, error } = await svc
      .from('write_jobs_queue')
      .insert({ job_type: 'staging_w15_smoke', payload: { safe: true }, status: 'pending' })
      .select('id')
      .single();
    if (data?.id) await svc.from('write_jobs_queue').delete().eq('id', data.id);
    results.checks.write_jobs_queue = { ok: !error && !!data?.id, err: error?.message ?? null };
  }

  {
    const { data: ev, error: evErr } = await anon.from('offer_events').select('id').limit(1);
    const { data: cfg, error: cfgErr } = await anon.from('app_config').select('key').limit(1);
    const deniedEvents = Array.isArray(ev) ? ev.length === 0 : true;
    const deniedCfg = Array.isArray(cfg) ? cfg.length === 0 : true;
    results.checks.anon_denied_sensitive = {
      ok: deniedEvents && deniedCfg,
      offer_events: { n: ev?.length ?? null, err: evErr?.message ?? null },
      app_config: { n: cfg?.length ?? null, err: cfgErr?.message ?? null },
    };
  }

  {
    const { data, error } = await svc.from('user_roles').select('user_id, role').eq('role', 'admin').limit(1);
    results.checks.admin_role = { ok: !error && (data?.length ?? 0) >= 1, err: error?.message ?? null };
  }

  {
    const { data, error } = await svc.from('communities').select('id').limit(1);
    results.checks.communities = {
      ok: !error,
      n: data?.length ?? 0,
      note: 'bigint deferred; not required for offers smoke',
      err: error?.message ?? null,
    };
  }

  // create offer path (insert then delete synthetic)
  {
    const { data, error } = await svc
      .from('offers')
      .insert({
        title: '[STAGING_W15_SEED] create-smoke ephemeral',
        price: 10,
        image_url: 'https://placehold.co/100x100/png?text=TMP',
        store: 'Amazon',
        status: 'pending',
        created_by: '6aa733d4-02cb-4c64-92fc-cf45fdcee344',
        offer_url: 'https://example.com/aventa-staging-create-smoke',
      })
      .select('id')
      .single();
    if (data?.id) await svc.from('offers').delete().eq('id', data.id);
    results.checks.create_offer = { ok: !error && !!data?.id, err: error?.message ?? null };
  }

  const failed = Object.entries(results.checks).filter(([, v]) => !v.ok).map(([k]) => k);
  results.ok = failed.length === 0;
  results.failed = failed;
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.ok ? 0 : 1);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
  process.exit(1);
});
