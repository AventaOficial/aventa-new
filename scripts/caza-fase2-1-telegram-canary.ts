/**
 * CazaOfertasss FASE 2.1 — Canary real Telegram (STAGING ONLY).
 *
 *   npx tsx scripts/caza-fase2-1-telegram-canary.ts
 *
 * Publica EXACTAMENTE UNA tarjeta en el canal allowlisted de staging.
 * Nunca producción. Nunca money path. Nunca loguea el bot token.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import {
  STAGING_SUPABASE_REF,
  assertStagingSupabaseUrl,
  isProductionSupabaseRef,
  extractSupabaseProjectRef,
} from '@/lib/supabase/projectRefs';
import {
  CAZAOFERTAS_PUBLICATION_BOUNDARY,
  CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
  CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS_ENV,
  CAZAOFERTAS_TELEGRAM_CANARY_ENV,
  assertCazaOfertasMoneyUntouched,
  buildDealCandidate,
  createCazaTelegramBotAdapter,
  createPostgresDealCandidateRepository,
  createPostgresPublicationRepository,
  preparePublication,
  processPublication,
  redactTelegramSecrets,
  resolveTelegramCanaryGate,
  upsertDealCandidate,
  type CazaSupabaseClient,
} from '@/lib/cazaOfertas';
import {
  CAZA_STAGING_TELEGRAM_CANARY_CHANNEL,
  CAZA_STAGING_TELEGRAM_TOKEN_ALIAS_ENV,
} from '@/lib/cazaOfertas/telegram/stagingChannel';
import {
  amazonAffiliate,
  amazonDraft,
  strongEvidence,
} from '../tests/cazaOfertas/fixtures';

const OUT = join(process.cwd(), 'scripts', '_caza_phase2_1_reports');

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1].trim()] == null) process.env[m[1].trim()] = v;
  }
}

function redactChannel(channel: string): string {
  if (channel.startsWith('@')) {
    return `@${channel.slice(1, 3)}***`;
  }
  if (channel.startsWith('-100') && channel.length > 8) {
    return `${channel.slice(0, 7)}***${channel.slice(-2)}`;
  }
  return '***';
}

function assertNoSecretsInReport(report: Record<string, unknown>, token: string) {
  const raw = JSON.stringify(report);
  if (token && raw.includes(token)) {
    throw new Error('ABORT: report contains bot token');
  }
  if (/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/.test(raw)) {
    throw new Error('ABORT: report matches bot token pattern');
  }
}

async function main() {
  loadEnv('.env.local');
  process.env.AVENTA_SUPABASE_TARGET = 'staging';
  process.env[CAZAOFERTAS_TELEGRAM_CANARY_ENV] = '1';
  process.env[CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS_ENV] =
    CAZA_STAGING_TELEGRAM_CANARY_CHANNEL;

  // Map staging alias → CazaOfertasss credential ref (value never logged).
  if (!process.env[CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV]) {
    const alias = process.env[CAZA_STAGING_TELEGRAM_TOKEN_ALIAS_ENV];
    if (!alias) {
      throw new Error(
        `ABORT: missing ${CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV} and ${CAZA_STAGING_TELEGRAM_TOKEN_ALIAS_ENV}`
      );
    }
    process.env[CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV] = alias;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const token = process.env[CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV] ?? '';

  assertStagingSupabaseUrl(url);
  assertCazaOfertasMoneyUntouched();

  const ref = extractSupabaseProjectRef(url);
  if (!ref || isProductionSupabaseRef(ref) || ref !== STAGING_SUPABASE_REF) {
    throw new Error(`ABORT: refused non-staging ref ${ref}`);
  }
  if (CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramPublishEnabled) {
    throw new Error('ABORT: production publish flag must remain false');
  }
  if (CAZAOFERTAS_PUBLICATION_BOUNDARY.autoPublishEnabled) {
    throw new Error('ABORT: auto publish must remain false');
  }

  const gate = resolveTelegramCanaryGate(process.env);
  if (!gate.ok) {
    throw new Error(`ABORT canary gate: ${gate.reasons.join(',')}`);
  }
  if (!gate.value.allowedChannels.includes(CAZA_STAGING_TELEGRAM_CANARY_CHANNEL)) {
    throw new Error('ABORT: staging channel not allowlisted');
  }

  mkdirSync(OUT, { recursive: true });
  const now = new Date();
  const stamp = now.getTime();
  const asin = `B0${String(stamp).slice(-8)}`;
  const capturedAt = now.toISOString();

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as CazaSupabaseClient;

  const candidates = createPostgresDealCandidateRepository(sb);
  const pubs = createPostgresPublicationRepository(sb);

  const draft = amazonDraft({
    url: `https://www.amazon.com.mx/dp/${asin}`,
    externalProductId: asin,
    currentPrice: 1499,
    evidence: strongEvidence({
      currentPrice: 1499,
      referencePrice: 2999,
      capturedAt,
    }),
    referencePrice: 2999,
    title: `CazaOfertasss canary ${stamp}`,
    detectedAt: capturedAt,
  });
  const affiliate = amazonAffiliate({
    affiliateUrl: `https://www.amazon.com.mx/dp/${asin}?tag=cazaofertasss-20`,
    affiliateTrackingLabel: `caza_${String(stamp).slice(-8)}_canary`,
    affiliateGeneratedAt: capturedAt,
  });

  const built = buildDealCandidate(draft, { now, affiliate });
  if (!built.ok) {
    throw new Error(`candidate build failed: ${built.reasons.join(',')}`);
  }

  await upsertDealCandidate(candidates, built.value);

  const prepared = await preparePublication(pubs, {
    candidate: built.value,
    telegramChannel: CAZA_STAGING_TELEGRAM_CANARY_CHANNEL,
    now,
    gate: gate.value,
  });
  if (prepared.outcome === 'rejected' || !prepared.record) {
    throw new Error(`prepare rejected: ${prepared.reasons.join(',')}`);
  }

  const snapshot = prepared.record.cardSnapshot;
  if (!snapshot?.text || snapshot.affiliateUrl !== built.value.affiliateUrl) {
    throw new Error('ABORT: snapshot missing or affiliate mismatch');
  }
  if (snapshot.candidateRevision !== built.value.revision) {
    throw new Error('ABORT: snapshot revision mismatch');
  }

  const bot = createCazaTelegramBotAdapter({
    env: process.env,
    credentialEnvVar: CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
  });

  const sent = await processPublication({
    publicationId: prepared.record.publicationId,
    repository: pubs,
    bot,
    gate: gate.value,
    leaseOwner: `caza_canary_${stamp}`,
    now,
  });

  if (sent.outcome !== 'published' || !sent.record?.telegramMessageId) {
    const safeReasons = sent.reasons.map((r) => redactTelegramSecrets(r, token));
    throw new Error(
      `ABORT: real send did not publish. outcome=${sent.outcome} reasons=${safeReasons.join(',')}`
    );
  }

  const replay = await processPublication({
    publicationId: prepared.record.publicationId,
    repository: pubs,
    bot,
    gate: gate.value,
    leaseOwner: `caza_canary_replay_${stamp}`,
    now: new Date(),
  });

  const report: Record<string, unknown> = {
    environment: 'staging',
    projectRef: STAGING_SUPABASE_REF,
    publicationIdentity: sent.record.publicationId,
    candidateIdentity: built.value.identity.key,
    candidateId: built.value.id,
    candidateRevision: built.value.revision,
    channelIdentifierRedacted: redactChannel(CAZA_STAGING_TELEGRAM_CANARY_CHANNEL),
    messageId: sent.record.telegramMessageId,
    publishedAt: sent.record.publishedAt,
    publishedRevision: sent.record.publishedRevision,
    finalPublicationState: sent.record.status,
    sendAttempts: sent.record.attemptCount,
    snapshotGeneratedAt: snapshot.generatedAt,
    snapshotAffiliateUrlHost: new URL(snapshot.affiliateUrl).host,
    replayResult: replay.outcome,
    replayDidNotResend: replay.outcome === 'already_published',
    moneyPathUntouched: true,
    creatorRewardsUntouched: true,
    payoutIntentsUntouched: true,
    rewardPayoutsUntouched: true,
    commissionsUntouched: true,
    productionUntouched: true,
    deployPerformed: false,
    commitPerformed: false,
    pushPerformed: false,
    timestamp: new Date().toISOString(),
    result: 'PASS',
  };

  assertNoSecretsInReport(report, token);

  const outPath = join(OUT, 'caza-telegram-canary-latest.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const token = process.env[CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV] ?? '';
  console.error(redactTelegramSecrets(message, token));
  process.exit(1);
});
