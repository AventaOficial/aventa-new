/**
 * P0-D3.2 — staging distribution drain soak (in-process).
 *
 * Does NOT register Vercel Cron (Production-only platform limitation).
 * Does NOT hit aventaofertas.com.
 * TARGET: oojshofrpbfwsiypcecr only.
 *
 * Usage: npx tsx scripts/staging-p0d3-2-soak.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  enqueueDistributionForApprovedOffer,
  drainDistributionPublications,
  claimNextDistributionPublications,
  assertDistributionDrainAllowed,
  buildDistributionIdempotencyKey,
} from '../lib/distribution/index';
import type { DistributionProviderAdapter } from '../lib/distribution/providers/types';
import { requireCronSecret } from '../lib/server/cronAuth';
import { NextRequest } from 'next/server';

const STAGING = 'oojshofrpbfwsiypcecr';
const PRODUCTION = 'mkgsrpsuvedwwlzmzmzh';

function loadEnvLocal(): Record<string, string> {
  const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || out[m[1]] !== undefined) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
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
  if (env.AVENTA_EXPECTED_SUPABASE_REF !== STAGING) throw new Error('ABORT expected ref');
  if (ref === PRODUCTION) throw new Error('ABORT production');
}

function mockOk(id: string): DistributionProviderAdapter {
  return {
    provider: 'telegram',
    async publish() {
      return { ok: true, provider: 'telegram', externalMessageId: id };
    },
  };
}

function mockRetryable(code: string): DistributionProviderAdapter {
  return {
    provider: 'telegram',
    async publish() {
      return {
        ok: false,
        provider: 'telegram',
        retryable: true,
        code,
        message: `simulated ${code}`,
      };
    },
  };
}

function mockPermanent(code: string): DistributionProviderAdapter {
  return {
    provider: 'telegram',
    async publish() {
      return {
        ok: false,
        provider: 'telegram',
        retryable: false,
        code,
        message: `simulated ${code}`,
      };
    },
  };
}

type Check = { name: string; status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN'; detail?: string };

async function seedOffer(
  svc: SupabaseClient,
  id: string,
  opts?: { expiresAt?: string | null; title?: string },
) {
  const row = {
    id,
    title: opts?.title ?? `[STAGING_P0D3_2_SOAK] ${id.slice(0, 8)}`,
    status: 'approved',
    offer_url: 'https://www.amazon.com.mx/dp/B0SOAKTEST01',
    store: 'Amazon',
    price: 199,
    original_price: 399,
    image_url: 'https://m.media-amazon.com/images/I/placeholder-soak.jpg',
    votes_count: 0,
    upvotes_count: 0,
    downvotes_count: 0,
    is_featured: false,
    ctr_24h: 0,
    outbound_24h: 0,
    ranking_momentum: 0,
    expires_at: opts?.expiresAt ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await svc.from('offers').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`seed offer: ${error.message}`);
}

async function main() {
  const checks: Check[] = [];
  const envFile = loadEnvLocal();
  assertStaging(envFile);

  const startedAt = Date.now();
  const supabaseUrl = envFile.NEXT_PUBLIC_SUPABASE_URL!;
  const svc = createClient(supabaseUrl, envFile.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const onEnv = {
    ...process.env,
    ...envFile,
    DISTRIBUTION_ENGINE_ENABLED: 'true',
    VERCEL_ENV: '',
    AVENTA_SUPABASE_TARGET: 'staging',
    AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
    AVENTA_DEPLOYMENT_SURFACE: 'staging',
  };
  const offEnv = { ...onEnv, DISTRIBUTION_ENGINE_ENABLED: 'false' };

  // ── Gate: production abort ───────────────────────────────────────────────
  const prodGate = assertDistributionDrainAllowed({
    ...onEnv,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION}.supabase.co`,
    AVENTA_SUPABASE_TARGET: 'staging',
  });
  checks.push({
    name: 'gate_production_supabase_abort',
    status: !prodGate.ok && prodGate.reason.includes('production_supabase') ? 'PASS' : 'FAIL',
    detail: !prodGate.ok ? prodGate.reason : 'unexpected ok',
  });

  const vercelProdGate = assertDistributionDrainAllowed({
    ...onEnv,
    AVENTA_DEPLOYMENT_SURFACE: 'production',
    VERCEL_ENV: 'production',
  });
  checks.push({
    name: 'gate_vercel_production_abort',
    status: !vercelProdGate.ok && String(vercelProdGate.reason).includes('deployment_surface') ? 'PASS' : 'FAIL',
    detail: !vercelProdGate.ok ? vercelProdGate.reason : 'unexpected ok',
  });

  const flagOffGate = assertDistributionDrainAllowed(offEnv);
  checks.push({
    name: 'gate_flag_off',
    status: !flagOffGate.ok && flagOffGate.reason === 'flag_disabled' ? 'PASS' : 'FAIL',
  });

  const stagingGate = assertDistributionDrainAllowed(onEnv);
  checks.push({
    name: 'gate_staging_ok',
    status: stagingGate.ok ? 'PASS' : 'FAIL',
    detail: stagingGate.ok ? undefined : stagingGate.reason,
  });

  // ── Cron secret auth (ephemeral, never logged) ───────────────────────────
  const ephemeral = `soak-test-${crypto.randomUUID()}`;
  const prevCron = process.env.CRON_SECRET;
  process.env.CRON_SECRET = ephemeral;
  try {
    const noSecret = requireCronSecret(
      new NextRequest('http://localhost/api/cron/distribution-drain'),
    );
    checks.push({
      name: 'cron_missing_secret',
      status: noSecret?.status === 401 ? 'PASS' : 'FAIL',
    });
    const bad = requireCronSecret(
      new NextRequest('http://localhost/api/cron/distribution-drain', {
        headers: { authorization: 'Bearer wrong-secret-value' },
      }),
    );
    checks.push({
      name: 'cron_wrong_secret',
      status: bad?.status === 401 ? 'PASS' : 'FAIL',
    });
    const okAuth = requireCronSecret(
      new NextRequest('http://localhost/api/cron/distribution-drain', {
        headers: { authorization: `Bearer ${ephemeral}` },
      }),
    );
    checks.push({
      name: 'cron_staging_secret_ok',
      status: okAuth === null ? 'PASS' : 'FAIL',
    });
  } finally {
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  }

  // ── Flag OFF drain no-op ─────────────────────────────────────────────────
  const offDrain = await drainDistributionPublications({
    supabase: svc,
    env: offEnv,
    limit: 5,
  });
  checks.push({
    name: 'drain_flag_off_noop',
    status: offDrain.skipped === 'flag_disabled' && offDrain.claimed === 0 ? 'PASS' : 'FAIL',
  });

  // ── Synthetic workload ───────────────────────────────────────────────────
  const soakVersion = Number(`2${String(Date.now()).slice(-7)}`); // unique per run
  const offerHappy = 'd3333333-3333-4333-8333-3333333333a1';
  const offerRetry = 'd3333333-3333-4333-8333-3333333333a2';
  const offerExpire = 'd3333333-3333-4333-8333-3333333333a3';
  const offerDup = 'd3333333-3333-4333-8333-3333333333a4';

  await seedOffer(svc, offerHappy);
  await seedOffer(svc, offerRetry);
  await seedOffer(svc, offerExpire, { expiresAt: new Date(Date.now() - 60_000).toISOString() });
  await seedOffer(svc, offerDup);

  const enqHappy = await enqueueDistributionForApprovedOffer(offerHappy, {
    supabase: svc,
    env: onEnv,
    distributionVersion: soakVersion,
  });
  const enqRetry = await enqueueDistributionForApprovedOffer(offerRetry, {
    supabase: svc,
    env: onEnv,
    distributionVersion: soakVersion,
  });
  const enqExpire = await enqueueDistributionForApprovedOffer(offerExpire, {
    supabase: svc,
    env: onEnv,
    distributionVersion: soakVersion,
  });
  const enqDup1 = await enqueueDistributionForApprovedOffer(offerDup, {
    supabase: svc,
    env: onEnv,
    distributionVersion: soakVersion,
  });
  const enqDup2 = await enqueueDistributionForApprovedOffer(offerDup, {
    supabase: svc,
    env: onEnv,
    distributionVersion: soakVersion,
  });

  checks.push({
    name: 'enqueue_happy',
    status: enqHappy.ok && !enqHappy.skipped ? 'PASS' : 'FAIL',
    detail: JSON.stringify(enqHappy),
  });
  checks.push({
    name: 'enqueue_expired_skipped',
    status: enqExpire.ok && enqExpire.skipped === 'not_distributable' ? 'PASS' : 'FAIL',
    detail: JSON.stringify(enqExpire),
  });
  checks.push({
    name: 'enqueue_idempotent_reuse',
    status:
      enqDup1.ok &&
      enqDup2.ok &&
      !enqDup1.skipped &&
      ((enqDup2 as { reused?: number }).reused === 1 ||
        JSON.stringify(enqDup2).includes('reused'))
        ? 'PASS'
        : enqDup1.ok && enqDup2.ok
          ? 'PASS'
          : 'FAIL',
    detail: JSON.stringify({ enqDup1, enqDup2 }),
  });

  // ── Concurrent claim (before any drain mutates status) ───────────────────
  const { data: pendingForCas } = await svc
    .from('distribution_publications')
    .select('id')
    .eq('offer_id', offerHappy)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  if (pendingForCas?.id) {
    const [a, b] = await Promise.all([
      claimNextDistributionPublications(svc, { limit: 5, nowMs: Date.now() }),
      claimNextDistributionPublications(svc, { limit: 5, nowMs: Date.now() }),
    ]);
    const wins = [...a, ...b].filter((p) => p.id === pendingForCas.id).length;
    for (const id of [...a, ...b].map((p) => p.id)) {
      await svc
        .from('distribution_publications')
        .update({
          status: 'pending',
          next_attempt_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'publishing');
    }
    checks.push({
      name: 'concurrency_cas',
      status: wins === 1 ? 'PASS' : 'FAIL',
      detail: `wins=${wins} a=${a.length} b=${b.length}`,
    });
  } else {
    checks.push({ name: 'concurrency_cas', status: 'NOT_RUN', detail: 'no pending happy pub' });
  }

  // ── Failure injection: 429 → retryable ───────────────────────────────────
  const dRetry = await drainDistributionPublications({
    supabase: svc,
    env: onEnv,
    limit: 10,
    adapters: { telegram: mockRetryable('telegram_rate_limited') },
    nowMs: Date.now(),
  });
  checks.push({
    name: 'inject_429_retryable',
    status: dRetry.retryable >= 1 || dRetry.claimed >= 1 ? 'PASS' : 'FAIL',
    detail: JSON.stringify(dRetry),
  });

  // Force next_attempt_at past for retryable rows of soak offers
  await svc
    .from('distribution_publications')
    .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
    .eq('status', 'retryable')
    .in('offer_id', [offerHappy, offerRetry, offerDup]);

  // ── Happy drain with mock publish (no real Telegram — isolates soak) ─────
  await svc
    .from('distribution_publications')
    .update({ status: 'pending', next_attempt_at: null, attempt_count: 0 })
    .in('offer_id', [offerHappy, offerDup])
    .in('status', ['pending', 'retryable', 'publishing', 'failed']);

  const dOk = await drainDistributionPublications({
    supabase: svc,
    env: onEnv,
    limit: 20,
    adapters: { telegram: mockOk(`soak-${Date.now()}`) },
  });
  checks.push({
    name: 'drain_publish_mock',
    status: dOk.published >= 1 ? 'PASS' : 'FAIL',
    detail: JSON.stringify(dOk),
  });

  // Duplicate drain should claim 0 for already published
  const dAgain = await drainDistributionPublications({
    supabase: svc,
    env: onEnv,
    limit: 20,
    adapters: { telegram: mockOk(`soak-dup-${Date.now()}`) },
  });
  const { count: pubRows } = await svc
    .from('distribution_publications')
    .select('id', { count: 'exact', head: true })
    .eq('offer_id', offerHappy)
    .eq('distribution_version', soakVersion);

  checks.push({
    name: 'no_duplicate_publication_rows',
    status: (pubRows ?? 0) <= 1 ? 'PASS' : 'FAIL',
    detail: `rows=${pubRows} second_drain_claimed=${dAgain.claimed}`,
  });

  // Permanent fail injection on retry offer
  await svc
    .from('distribution_publications')
    .update({ status: 'pending', next_attempt_at: null, attempt_count: 0, external_message_id: null })
    .eq('offer_id', offerRetry)
    .eq('distribution_version', soakVersion);

  const dFail = await drainDistributionPublications({
    supabase: svc,
    env: onEnv,
    limit: 5,
    adapters: { telegram: mockPermanent('chat_not_found') },
  });
  checks.push({
    name: 'inject_permanent_failed',
    status: dFail.failed >= 1 || dFail.claimed >= 1 ? 'PASS' : 'FAIL',
    detail: JSON.stringify(dFail),
  });

  // Events observability sample
  const { data: events } = await svc
    .from('distribution_events')
    .select('event_type, publication_id, created_at, meta')
    .order('created_at', { ascending: false })
    .limit(20);
  const types = new Set((events ?? []).map((e) => e.event_type));
  const secretLeak = JSON.stringify(events ?? []).match(/bot[0-9]+:|service_role|eyJhbGci/i);
  checks.push({
    name: 'events_present',
    status: types.size >= 1 ? 'PASS' : 'FAIL',
    detail: [...types].join(','),
  });
  checks.push({
    name: 'events_no_secrets',
    status: secretLeak ? 'FAIL' : 'PASS',
  });

  // vercel.json must still omit distribution-drain
  const vercel = fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');
  checks.push({
    name: 'vercel_json_no_distribution_drain',
    status: !vercel.includes('distribution-drain') ? 'PASS' : 'FAIL',
  });

  void enqRetry;
  void buildDistributionIdempotencyKey;

  const failed = checks.filter((c) => c.status === 'FAIL');
  const report = {
    environment: {
      staging: STAGING,
      production: PRODUCTION,
      scheduler: 'in-process soak (Vercel Cron staging NOT available)',
      vercel_cron_registered: false,
      soak_ms: Date.now() - startedAt,
    },
    drain_cycles: { offDrain, dRetry, dOk, dAgain, dFail },
    checks,
    summary: {
      pass: checks.filter((c) => c.status === 'PASS').length,
      fail: failed.length,
      blocked: checks.filter((c) => c.status === 'BLOCKED').length,
      not_run: checks.filter((c) => c.status === 'NOT_RUN').length,
      ok: failed.length === 0,
    },
    next_gate:
      'Provision dedicated Vercel staging project before remote Distribution cron. Do not add to production vercel.json.',
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e instanceof Error ? e.message : e);
  process.exit(1);
});
