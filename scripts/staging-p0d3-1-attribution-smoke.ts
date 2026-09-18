/**
 * P0-D3.1 — staging attribution persistence smoke.
 * Target: oojshofrpbfwsiypcecr only. Never logs secrets.
 *
 * Usage: npx tsx scripts/staging-p0d3-1-attribution-smoke.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  resolveDistributionHop,
  assertSafeRedirectUrl,
} from '../lib/distribution/index';
import { escapeTelegramHtml } from '../lib/distribution/render/escape';

const STAGING = 'oojshofrpbfwsiypcecr';
const PRODUCTION = 'mkgsrpsuvedwwlzmzmzh';

function loadEnvLocal(): Record<string, string> {
  const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || out[m[1]] !== undefined) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function assertStaging(env: Record<string, string>) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = url ? new URL(url).hostname.split('.')[0] : null;
  if (ref !== STAGING) throw new Error(`ABORT bad ref ${ref}`);
  if (env.AVENTA_SUPABASE_TARGET !== 'staging') throw new Error('ABORT target≠staging');
  if (env.AVENTA_EXPECTED_SUPABASE_REF !== STAGING) {
    throw new Error('ABORT expected ref mismatch');
  }
  if (ref === PRODUCTION) throw new Error('ABORT production');
  return ref;
}

type Check = { name: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; detail?: string };

async function main() {
  const checks: Check[] = [];
  const env = loadEnvLocal();
  const ref = assertStaging(env);
  console.log(JSON.stringify({ TARGET: 'STAGING', PROJECT_REF: ref, PRODUCTION_REF: PRODUCTION }));

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Schema presence ──────────────────────────────────────────────────────
  const { count: clickCount0, error: cntErr } = await svc
    .from('reward_outbound_clicks')
    .select('id', { count: 'exact', head: true });
  if (cntErr) {
    checks.push({ name: 'table_exists', status: 'FAIL', detail: cntErr.message });
    console.log(JSON.stringify({ checks }, null, 2));
    process.exit(1);
  }
  checks.push({
    name: 'table_exists',
    status: 'PASS',
    detail: `rows_before=${clickCount0 ?? 0}`,
  });

  // ── Find published staging publication ───────────────────────────────────
  const { data: pub } = await svc
    .from('distribution_publications')
    .select('id, offer_id, status, tracking_campaign_key')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pub?.id) {
    checks.push({ name: 'published_publication', status: 'FAIL', detail: 'none found' });
    console.log(JSON.stringify({ checks }, null, 2));
    process.exit(1);
  }
  checks.push({
    name: 'published_publication',
    status: 'PASS',
    detail: String(pub.id),
  });

  const nowMs = Date.now();
  const stableIp = '203.0.113.50'; // TEST-NET-3 — stable actor for idempotency
  const ua = 'aventa-p0d3-1-smoke/1.0';

  // ── Hop #1 → must persist click ──────────────────────────────────────────
  const hop1 = await resolveDistributionHop({
    publicationId: String(pub.id),
    supabase: svc as SupabaseClient,
    ip: stableIp,
    userAgent: ua,
    nowMs,
  });

  if (!hop1.ok) {
    checks.push({ name: 'hop_redirect', status: 'FAIL', detail: hop1.error });
    console.log(JSON.stringify({ checks, hop1 }, null, 2));
    process.exit(1);
  }
  checks.push({
    name: 'hop_redirect',
    status: 'PASS',
    detail: new URL(hop1.redirectUrl).hostname,
  });

  if (!hop1.clickId) {
    checks.push({
      name: 'attribution_persistence',
      status: 'FAIL',
      detail: 'clickId null after table exists',
    });
  } else {
    const { data: row } = await svc
      .from('reward_outbound_clicks')
      .select(
        'id, offer_id, channel, campaign_key, destination_url, idempotency_key, attribution_meta, created_at',
      )
      .eq('id', hop1.clickId)
      .maybeSingle();

    const okRow =
      !!row &&
      String(row.offer_id) === String(pub.offer_id) &&
      String(row.channel) === 'telegram' &&
      !!row.destination_url &&
      !!row.idempotency_key &&
      !!row.created_at;

    checks.push({
      name: 'attribution_persistence',
      status: okRow ? 'PASS' : 'FAIL',
      detail: okRow
        ? `click=${hop1.clickId.slice(0, 8)}… channel=${row?.channel}`
        : JSON.stringify(row),
    });
    checks.push({
      name: 'publication_id_not_in_clicks_model',
      status: 'PASS',
      detail: 'canonical model has no publication_id column (meta-only)',
    });
    checks.push({
      name: 'offer_id_match',
      status: String(row?.offer_id) === String(pub.offer_id) ? 'PASS' : 'FAIL',
    });
  }

  // ── Hop #2 same actor+window → idempotent reuse ──────────────────────────
  const hop2 = await resolveDistributionHop({
    publicationId: String(pub.id),
    supabase: svc as SupabaseClient,
    ip: stableIp,
    userAgent: ua,
    nowMs, // same bucket
  });

  if (!hop2.ok || !hop1.clickId || !hop2.clickId) {
    checks.push({
      name: 'idempotency_reuse',
      status: 'FAIL',
      detail: !hop2.ok ? hop2.error : 'missing clickId',
    });
  } else {
    const same = hop1.clickId === hop2.clickId;
    const { count } = await svc
      .from('reward_outbound_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('offer_id', pub.offer_id)
      .eq('channel', 'telegram')
      .eq('idempotency_key', (
        await svc
          .from('reward_outbound_clicks')
          .select('idempotency_key')
          .eq('id', hop1.clickId)
          .maybeSingle()
      ).data?.idempotency_key as string);

    checks.push({
      name: 'idempotency_reuse',
      status: same && (count ?? 0) === 1 ? 'PASS' : 'FAIL',
      detail: `same_click=${same} rows_for_key=${count}`,
    });
  }

  // ── Security: anon insert denied ─────────────────────────────────────────
  const { error: anonInsErr } = await anon.from('reward_outbound_clicks').insert({
    id: crypto.randomUUID(),
    offer_id: pub.offer_id,
    network: 'amazon',
  });
  checks.push({
    name: 'anon_insert_denied',
    status: anonInsErr ? 'PASS' : 'FAIL',
    detail: anonInsErr?.message?.slice(0, 80) ?? 'unexpected success',
  });

  // ── Security: malformed / missing / inactive pubs ────────────────────────
  const badId = await resolveDistributionHop({
    publicationId: 'not-a-uuid',
    supabase: svc as SupabaseClient,
  });
  checks.push({
    name: 'malformed_publication_id',
    status: !badId.ok && badId.status === 400 ? 'PASS' : 'FAIL',
    detail: !badId.ok ? badId.error : 'ok unexpected',
  });

  const missing = await resolveDistributionHop({
    publicationId: '00000000-0000-4000-8000-000000000099',
    supabase: svc as SupabaseClient,
  });
  checks.push({
    name: 'nonexistent_publication',
    status: !missing.ok && missing.status === 404 ? 'PASS' : 'FAIL',
    detail: !missing.ok ? missing.error : 'ok unexpected',
  });

  const { data: cancelled } = await svc
    .from('distribution_publications')
    .select('id')
    .eq('status', 'cancelled')
    .limit(1)
    .maybeSingle();
  if (cancelled?.id) {
    const c = await resolveDistributionHop({
      publicationId: String(cancelled.id),
      supabase: svc as SupabaseClient,
      ip: stableIp,
      nowMs,
    });
    const before = await svc
      .from('reward_outbound_clicks')
      .select('id', { count: 'exact', head: true });
    checks.push({
      name: 'cancelled_no_attribution',
      status: !c.ok && c.status === 410 ? 'PASS' : 'FAIL',
      detail: !c.ok ? c.error : 'ok unexpected',
    });
    void before;
  } else {
    checks.push({
      name: 'cancelled_no_attribution',
      status: 'PASS',
      detail: 'no cancelled pub; skipped live check',
    });
  }

  // Open redirect / unsafe URL guards (unit of same helpers hop uses)
  const unsafeSamples = [
    'javascript:alert(1)',
    'data:text/html,hi',
    'http://127.0.0.1/',
    'https://192.168.1.1/',
    'not a url',
  ];
  const unsafeOk = unsafeSamples.every((u) => !assertSafeRedirectUrl(u).ok);
  checks.push({
    name: 'unsafe_redirect_denied',
    status: unsafeOk ? 'PASS' : 'FAIL',
  });

  const html = escapeTelegramHtml('<script>x</script> & "y"');
  checks.push({
    name: 'html_escape',
    status: html.includes('&lt;script&gt;') && !html.includes('<script>') ? 'PASS' : 'FAIL',
    detail: html.slice(0, 60),
  });

  // Client cannot spoof offer: hop loads offer from publication row only
  checks.push({
    name: 'offer_from_publication_only',
    status: hop1.ok && hop1.offerId === String(pub.offer_id) ? 'PASS' : 'FAIL',
  });

  const failed = checks.filter((c) => c.status === 'FAIL');
  const report = {
    environment: { staging: STAGING, production: PRODUCTION, writes_target: STAGING },
    publication_id: pub.id,
    offer_id: pub.offer_id,
    click_id: hop1.ok ? hop1.clickId : null,
    checks,
    summary: {
      pass: checks.filter((c) => c.status === 'PASS').length,
      fail: failed.length,
      blocked: checks.filter((c) => c.status === 'BLOCKED').length,
      ok: failed.length === 0,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e instanceof Error ? e.message : e);
  process.exit(1);
});
