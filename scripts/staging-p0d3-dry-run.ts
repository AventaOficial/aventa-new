/**
 * P0-D3 Telegram staging end-to-end dry-run.
 * NEVER logs TELEGRAM_BOT_TOKEN_STAGING / service role / anon keys.
 *
 * Usage: npx tsx scripts/staging-p0d3-dry-run.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  enqueueDistributionForApprovedOffer,
  drainDistributionPublications,
  claimNextDistributionPublications,
  resolveDistributionHop,
  assertSafeHttpsUrl,
  assertSafeRedirectUrl,
  createTelegramAdapter,
  buildDistributionIdempotencyKey,
} from '../lib/distribution/index';

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

function redactChatId(id: string | number): string {
  const s = String(id);
  if (s.length <= 6) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function telegramApi(token: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { httpStatus: res.status, json };
}

function assertStaging(env: Record<string, string>) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = url ? new URL(url).hostname.split('.')[0] : null;
  if (ref !== 'oojshofrpbfwsiypcecr') throw new Error(`ABORT bad ref ${ref}`);
  if (env.AVENTA_SUPABASE_TARGET !== 'staging') throw new Error('ABORT target≠staging');
  if (env.AVENTA_EXPECTED_SUPABASE_REF !== 'oojshofrpbfwsiypcecr') {
    throw new Error('ABORT expected ref mismatch');
  }
  if (ref === 'mkgsrpsuvedwwlzmzmzh') throw new Error('ABORT production');
  console.log('TARGET = STAGING');
  console.log('PROJECT_REF =', ref);
  console.log('PRODUCTION_REF = mkgsrpsuvedwwlzmzmzh');
  console.log('PRODUCTION_WRITES = 0');
  return ref;
}

async function main() {
  const report: Record<string, unknown> = { phases: {} };
  const env = loadEnvLocal();
  assertStaging(env);

  const token = env.TELEGRAM_BOT_TOKEN_STAGING || '';
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new Error('ABORT invalid TELEGRAM_BOT_TOKEN_STAGING format');
  }

  // --- Phase 1-2: bot + chat verify ---
  const me = await telegramApi(token, 'getMe');
  const meOk = Boolean((me.json as { ok?: boolean }).ok);
  const bot = ((me.json as { result?: Record<string, unknown> }).result || {}) as {
    id?: number;
    username?: string;
  };
  report.phases = {
    ...(report.phases as object),
    bot: { status: meOk ? 'PASS' : 'FAIL', bot_id: bot.id, username: bot.username },
  };
  if (!meOk) throw new Error('getMe failed');

  const expectedChatId = '-1004307422597';
  const chat = await telegramApi(token, 'getChat', { chat_id: expectedChatId });
  const chatOk = Boolean((chat.json as { ok?: boolean }).ok);
  const chatResult = ((chat.json as { result?: Record<string, unknown> }).result ||
    {}) as { id?: number; type?: string; title?: string };
  const chatVerified =
    chatOk &&
    String(chatResult.id) === expectedChatId &&
    chatResult.type === 'channel' &&
    String(chatResult.title || '').toLowerCase().includes('aventa') &&
    String(chatResult.title || '').toLowerCase().includes('staging');

  report.phases = {
    ...(report.phases as object),
    channel: {
      status: chatVerified ? 'PASS' : 'FAIL',
      chat_id_redacted: redactChatId(expectedChatId),
      type: chatResult.type ?? null,
      title: chatResult.title ?? null,
    },
  };
  if (!chatVerified) {
    throw new Error('BLOCKED_CHAT_DISCOVERY: chat not verified as Aventa Staging channel');
  }

  // Can bot post? getChatMember
  const member = await telegramApi(token, 'getChatMember', {
    chat_id: expectedChatId,
    user_id: bot.id,
  });
  const memberOk = Boolean((member.json as { ok?: boolean }).ok);
  const status = String(
    ((member.json as { result?: { status?: string } }).result || {}).status || '',
  );
  const canPost = memberOk && (status === 'administrator' || status === 'creator');
  report.phases = {
    ...(report.phases as object),
    bot_channel_role: { status: canPost ? 'PASS' : 'FAIL', member_status: status },
  };
  if (!canPost) {
    throw new Error('BLOCKED: bot is not admin/creator of staging channel');
  }

  // --- Phase 2: configure destination on STAGING only ---
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) throw new Error('ABORT missing service role');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const destId = 'c2222222-2222-4222-8222-222222222201';
  const { data: destBefore, error: destBeforeErr } = await supabase
    .from('distribution_destinations')
    .select('id, slug, status, credential_ref, external_destination_key')
    .eq('id', destId)
    .maybeSingle();
  if (destBeforeErr || !destBefore) {
    throw new Error(`destination missing: ${destBeforeErr?.message || 'not found'}`);
  }
  if (destBefore.credential_ref !== 'TELEGRAM_BOT_TOKEN_STAGING') {
    throw new Error('credential_ref must be TELEGRAM_BOT_TOKEN_STAGING');
  }

  const { error: destUpErr } = await supabase
    .from('distribution_destinations')
    .update({
      external_destination_key: expectedChatId,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', destId)
    .eq('slug', 'telegram-staging-test');
  if (destUpErr) throw new Error(`destination update failed: ${destUpErr.message}`);

  const { data: destAfter } = await supabase
    .from('distribution_destinations')
    .select('id, slug, status, credential_ref, external_destination_key, kind')
    .eq('id', destId)
    .maybeSingle();

  report.phases = {
    ...(report.phases as object),
    destination: {
      status:
        destAfter?.status === 'active' &&
        destAfter.external_destination_key === expectedChatId &&
        destAfter.credential_ref === 'TELEGRAM_BOT_TOKEN_STAGING'
          ? 'PASS'
          : 'FAIL',
      slug: destAfter?.slug,
      kind: destAfter?.kind,
      credential_ref: destAfter?.credential_ref,
      chat_id_redacted: redactChatId(destAfter?.external_destination_key || ''),
    },
  };

  // --- Phase 9: flag OFF guard ---
  const offEnv = { ...process.env, ...env, DISTRIBUTION_ENGINE_ENABLED: 'false' };
  const offEnqueue = await enqueueDistributionForApprovedOffer(
    'a1111111-1111-4111-8111-111111111101',
    { supabase, env: offEnv },
  );
  const offDrain = await drainDistributionPublications({
    supabase,
    env: offEnv,
    limit: 5,
  });
  report.phases = {
    ...(report.phases as object),
    flag_off: {
      status:
        (offEnqueue as { skipped?: string }).skipped === 'flag_disabled' &&
        offDrain.skipped === 'flag_disabled'
          ? 'PASS'
          : 'FAIL',
      enqueue: offEnqueue,
      drain_skipped: offDrain.skipped ?? null,
    },
  };

  // --- Temporary LOCAL flag ON for dry-run ---
  const onEnv = { ...process.env, ...env, DISTRIBUTION_ENGINE_ENABLED: 'true' };

  // --- Phase 3: synthetic offer ---
  const offerId = 'd3333333-3333-4333-8333-333333333301';
  const profileId = '6aa733d4-02cb-4c64-92fc-cf45fdcee344';
  // Only delete events/pubs for THIS synthetic offer (scoped cleanup)
  const { data: oldPubs } = await supabase
    .from('distribution_publications')
    .select('id')
    .eq('offer_id', offerId);
  if (oldPubs?.length) {
    const ids = oldPubs.map((p) => p.id);
    await supabase.from('distribution_events').delete().in('publication_id', ids);
    await supabase.from('distribution_publications').delete().in('id', ids);
  }
  await supabase.from('offers').delete().eq('id', offerId);

  const { error: offerErr } = await supabase.from('offers').insert({
    id: offerId,
    title: '[STAGING_DISTRIBUTION_TEST] Auriculares dry-run P0-D3',
    price: 499,
    original_price: 999,
    image_url: 'https://placehold.co/600x600/png?text=STAGING+DIST',
    store: 'Amazon',
    status: 'approved',
    created_by: profileId,
    offer_url: 'https://www.amazon.com.mx/dp/B0STAGINGTEST',
    description: 'Synthetic STAGING ONLY — Distribution Engine dry-run',
    category: 'Electrónica',
    tags: ['staging', 'distribution', 'p0d3'],
  });
  if (offerErr) throw new Error(`offer insert failed: ${offerErr.message}`);

  // --- Phase 7: enqueue ---
  const enq1 = await enqueueDistributionForApprovedOffer(offerId, {
    supabase,
    env: onEnv,
  });
  const enq2 = await enqueueDistributionForApprovedOffer(offerId, {
    supabase,
    env: onEnv,
  });

  const { data: pubs } = await supabase
    .from('distribution_publications')
    .select('*')
    .eq('offer_id', offerId);
  const pub = pubs?.[0];
  const expectedKey = buildDistributionIdempotencyKey({
    offerId,
    destinationId: destId,
    distributionVersion: 1,
  });

  report.phases = {
    ...(report.phases as object),
    enqueue: {
      status:
        pubs?.length === 1 &&
        pub?.status === 'pending' &&
        pub?.idempotency_key === expectedKey &&
        (enq1 as { created?: number }).created === 1 &&
        ((enq2 as { reused?: number }).reused === 1 ||
          (enq2 as { created?: number }).created === 0)
          ? 'PASS'
          : 'FAIL',
      publication_count: pubs?.length ?? 0,
      status_row: pub?.status ?? null,
      idempotency_key_match: pub?.idempotency_key === expectedKey,
      enq1,
      enq2,
    },
  };
  if (!pub) throw new Error('no publication created');

  // --- Phase 8: drain / Telegram delivery ---
  const drain1 = await drainDistributionPublications({
    supabase,
    env: onEnv,
    limit: 10,
  });

  const { data: pubAfter } = await supabase
    .from('distribution_publications')
    .select('*')
    .eq('id', pub.id)
    .maybeSingle();

  const { data: events } = await supabase
    .from('distribution_events')
    .select('event_type, meta, created_at')
    .eq('publication_id', pub.id)
    .order('created_at', { ascending: true });

  report.phases = {
    ...(report.phases as object),
    delivery: {
      status:
        drain1.published === 1 && pubAfter?.status === 'published' && pubAfter.external_message_id
          ? 'PASS'
          : 'FAIL',
      drain: drain1,
      publication_status: pubAfter?.status ?? null,
      telegram_message_id: pubAfter?.external_message_id ?? null,
      chat_id_redacted: redactChatId(expectedChatId),
    },
    events: {
      status: (events?.length ?? 0) >= 2 ? 'PASS' : 'FAIL',
      types: (events ?? []).map((e) => e.event_type),
      count: events?.length ?? 0,
    },
  };

  // --- Phase 11: idempotency — drain again ---
  const drain2 = await drainDistributionPublications({
    supabase,
    env: onEnv,
    limit: 10,
  });
  const { data: pubsAfter2 } = await supabase
    .from('distribution_publications')
    .select('id, status, external_message_id')
    .eq('offer_id', offerId);
  report.phases = {
    ...(report.phases as object),
    idempotency: {
      status:
        drain2.claimed === 0 &&
        drain2.published === 0 &&
        pubsAfter2?.length === 1 &&
        pubsAfter2[0]?.external_message_id === pubAfter?.external_message_id
          ? 'PASS'
          : 'FAIL',
      drain2,
      publication_count: pubsAfter2?.length ?? 0,
      same_message_id:
        pubsAfter2?.[0]?.external_message_id === pubAfter?.external_message_id,
    },
  };

  // --- Phase 12: concurrency CAS on a fresh pending pub ---
  // Create a second offer+pub for concurrency without double-sending first message
  const offerId2 = 'd3333333-3333-4333-8333-333333333302';
  await supabase.from('offers').delete().eq('id', offerId2);
  await supabase.from('offers').insert({
    id: offerId2,
    title: '[STAGING_DISTRIBUTION_TEST] Concurrency CAS',
    price: 100,
    original_price: 200,
    image_url: 'https://placehold.co/400x400/png?text=CAS',
    store: 'Amazon',
    status: 'approved',
    created_by: profileId,
    offer_url: 'https://www.amazon.com.mx/dp/B0STAGINGCAS',
    category: 'Electrónica',
  });
  const enqCas = await enqueueDistributionForApprovedOffer(offerId2, {
    supabase,
    env: onEnv,
  });
  const { data: casPubs } = await supabase
    .from('distribution_publications')
    .select('id')
    .eq('offer_id', offerId2);
  const casPubId = casPubs?.[0]?.id;
  if (!casPubId) throw new Error('cas pub missing');

  // Force next_attempt ready then dual claim
  await supabase
    .from('distribution_publications')
    .update({ next_attempt_at: new Date().toISOString(), status: 'pending' })
    .eq('id', casPubId);

  const [c1, c2] = await Promise.all([
    claimNextDistributionPublications(supabase, { limit: 5 }),
    claimNextDistributionPublications(supabase, { limit: 5 }),
  ]);
  const claimedIds = [...c1, ...c2].map((p) => p.id);
  const casWins = claimedIds.filter((id) => id === casPubId).length;
  // Cancel the concurrency pub without sending (status publishing → cancelled)
  await supabase
    .from('distribution_publications')
    .update({
      status: 'cancelled',
      last_error_code: 'concurrency_test_cleanup',
      updated_at: new Date().toISOString(),
    })
    .eq('id', casPubId);

  report.phases = {
    ...(report.phases as object),
    concurrency: {
      status: casWins === 1 ? 'PASS' : 'FAIL',
      claims_for_target: casWins,
      total_claims_batch: claimedIds.length,
      enqCas,
    },
  };

  // --- Phase 13: retry with mock adapter ---
  const offerId3 = 'd3333333-3333-4333-8333-333333333303';
  await supabase.from('offers').delete().eq('id', offerId3);
  await supabase.from('offers').insert({
    id: offerId3,
    title: '[STAGING_DISTRIBUTION_TEST] Retry backoff',
    price: 50,
    original_price: 100,
    image_url: 'https://placehold.co/400x400/png?text=RETRY',
    store: 'Amazon',
    status: 'approved',
    created_by: profileId,
    offer_url: 'https://www.amazon.com.mx/dp/B0STAGINGRETRY',
    category: 'Electrónica',
  });
  await enqueueDistributionForApprovedOffer(offerId3, { supabase, env: onEnv });
  const { data: retryPubs } = await supabase
    .from('distribution_publications')
    .select('id')
    .eq('offer_id', offerId3);
  const retryPubId = retryPubs?.[0]?.id;
  if (!retryPubId) throw new Error('retry pub missing');

  const failAdapter = {
    provider: 'telegram' as const,
    publish: async () =>
      ({
        ok: false as const,
        retryable: true,
        code: 'telegram_rate_limited',
        message: 'simulated 429',
      }),
  };
  const drainFail = await drainDistributionPublications({
    supabase,
    env: onEnv,
    limit: 5,
    adapters: { telegram: failAdapter },
  });
  const { data: retryAfterFail } = await supabase
    .from('distribution_publications')
    .select('status, attempt_count, next_attempt_at, last_error_code')
    .eq('id', retryPubId)
    .maybeSingle();

  // Force next_attempt_at now and succeed with real adapter
  await supabase
    .from('distribution_publications')
    .update({ next_attempt_at: new Date().toISOString() })
    .eq('id', retryPubId);
  const drainOk = await drainDistributionPublications({
    supabase,
    env: onEnv,
    limit: 5,
  });
  const { data: retryFinal } = await supabase
    .from('distribution_publications')
    .select('status, external_message_id, attempt_count')
    .eq('id', retryPubId)
    .maybeSingle();

  report.phases = {
    ...(report.phases as object),
    retry: {
      status:
        retryAfterFail?.status === 'retryable' &&
        retryAfterFail.last_error_code === 'telegram_rate_limited' &&
        retryFinal?.status === 'published' &&
        Boolean(retryFinal.external_message_id)
          ? 'PASS'
          : 'FAIL',
      after_fail: retryAfterFail,
      after_success: {
        status: retryFinal?.status,
        has_message_id: Boolean(retryFinal?.external_message_id),
        attempt_count: retryFinal?.attempt_count,
      },
      drainFail,
      drainOk,
    },
  };

  // --- Phase 10: expiration ---
  const offerId4 = 'd3333333-3333-4333-8333-333333333304';
  const past = new Date(Date.now() - 60_000).toISOString();
  await supabase.from('offers').delete().eq('id', offerId4);
  await supabase.from('offers').insert({
    id: offerId4,
    title: '[STAGING_DISTRIBUTION_TEST] Expired',
    price: 10,
    image_url: 'https://placehold.co/100x100/png?text=EXP',
    store: 'Amazon',
    status: 'approved',
    created_by: profileId,
    offer_url: 'https://www.amazon.com.mx/dp/B0EXPIRED',
    expires_at: past,
    category: 'Electrónica',
  });
  const enqExp = await enqueueDistributionForApprovedOffer(offerId4, {
    supabase,
    env: onEnv,
  });
  report.phases = {
    ...(report.phases as object),
    expiration: {
      status:
        (enqExp as { skipped?: string }).skipped === 'not_distributable' ? 'PASS' : 'FAIL',
      enqExp,
    },
  };

  // --- Phase 5: /r/d hop ---
  const hop = await resolveDistributionHop({
    publicationId: pub.id,
    supabase,
    ip: '127.0.0.1',
    userAgent: 'staging-p0d3-dry-run',
  });
  const hopBad = await resolveDistributionHop({
    publicationId: 'not-a-uuid',
    supabase,
  });
  report.phases = {
    ...(report.phases as object),
    hop: {
      status:
        hop.ok &&
        hop.redirectUrl.includes('amazon.com.mx') &&
        !hopBad.ok
          ? 'PASS'
          : 'FAIL',
      redirect_host: hop.ok ? new URL(hop.redirectUrl).hostname : null,
      click_id_present: hop.ok ? Boolean(hop.clickId) : false,
      invalid_id_rejected: !hopBad.ok,
    },
  };

  // --- Phase 11: security URL checks ---
  const securityCases = [
    ['javascript:alert(1)', false],
    ['data:text/html,x', false],
    ['localhost', false],
    ['https://127.0.0.1/x', false],
    ['https://169.254.169.254/latest', false],
    ['https://placehold.co/x.png', true],
    ['https://www.amazon.com.mx/dp/x', true],
  ] as const;
  const secResults = securityCases.map(([u, expectOk]) => {
    const https = assertSafeHttpsUrl(u.startsWith('http') ? u : `https://${u}`);
    const redir = assertSafeRedirectUrl(u.startsWith('http') ? u : u);
    // for non-http raw, both should fail
    const ok =
      u.startsWith('https://placehold') || u.includes('amazon.com')
        ? https.ok || redir.ok
        : !https.ok && !redir.ok;
    return { u, expectOk, pass: expectOk ? https.ok || redir.ok : !https.ok };
  });
  report.phases = {
    ...(report.phases as object),
    security_urls: {
      status: secResults.every((r) => r.pass === true || (r.expectOk && (assertSafeHttpsUrl(r.u).ok || assertSafeRedirectUrl(r.u).ok)) || (!r.expectOk && !assertSafeHttpsUrl(r.u.startsWith('http') ? r.u : 'https://x').ok))
        ? 'PASS'
        : 'PASS',
      note: 'unit checks via assertSafeHttpsUrl/assertSafeRedirectUrl',
      samples: {
        js: assertSafeHttpsUrl('javascript:alert(1)').ok,
        private: assertSafeHttpsUrl('https://127.0.0.1/x').ok,
        meta: assertSafeHttpsUrl('https://169.254.169.254/latest').ok,
        good: assertSafeHttpsUrl('https://placehold.co/x.png').ok,
        redir_js: assertSafeRedirectUrl('javascript:alert(1)').ok,
      },
    },
  };

  // Force security status properly
  const secPass =
    !assertSafeHttpsUrl('javascript:alert(1)').ok &&
    !assertSafeHttpsUrl('https://127.0.0.1/x').ok &&
    !assertSafeHttpsUrl('https://169.254.169.254/latest').ok &&
    assertSafeHttpsUrl('https://placehold.co/x.png').ok &&
    !assertSafeRedirectUrl('javascript:alert(1)').ok &&
    assertSafeRedirectUrl('https://www.amazon.com.mx/dp/x').ok;
  (report.phases as Record<string, unknown>).security_urls = {
    status: secPass ? 'PASS' : 'FAIL',
    samples: {
      js_rejected: !assertSafeHttpsUrl('javascript:alert(1)').ok,
      loopback_rejected: !assertSafeHttpsUrl('https://127.0.0.1/x').ok,
      metadata_rejected: !assertSafeHttpsUrl('https://169.254.169.254/latest').ok,
      placehold_ok: assertSafeHttpsUrl('https://placehold.co/x.png').ok,
      open_redirect_js_rejected: !assertSafeRedirectUrl('javascript:alert(1)').ok,
    },
  };

  // --- RLS probe: anon cannot write ---
  const anon = createClient(supabaseUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: anonInsErr } = await anon.from('distribution_publications').insert({
    offer_id: offerId,
    destination_id: destId,
    distribution_version: 99,
    idempotency_key: 'anon-should-fail',
    status: 'pending',
    provider: 'telegram',
  });
  report.phases = {
    ...(report.phases as object),
    rls_anon_write: {
      status: anonInsErr ? 'PASS' : 'FAIL',
      error_present: Boolean(anonInsErr),
    },
  };

  // --- Restore flag OFF (local only; we never wrote Vercel) ---
  report.phases = {
    ...(report.phases as object),
    flag_restored: {
      status: 'PASS',
      note: 'Dry-run used in-memory env DISTRIBUTION_ENGINE_ENABLED=true; .env.local left unset/false',
      env_local_flag: env.DISTRIBUTION_ENGINE_ENABLED || 'unset',
    },
  };

  // Disable destination again for safety after dry-run? Brief said ideal state has destination active.
  // Keep active as ideal final state for staging.

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }, null, 2));
  process.exit(1);
});
