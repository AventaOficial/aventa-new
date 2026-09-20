/**
 * CazaOfertasss BRIDGE-01 — Canary harness (NO volume).
 *
 *   npx tsx scripts/caza-bridge-ml-canary.ts
 *   npx tsx scripts/caza-bridge-ml-canary.ts --staging
 *
 * Default: in-memory pipeline with a fixture shaped exactly like
 * ExternalWorkerCandidate (PDP + source_explicit). No network scrape.
 *
 * --staging: persist + Telegram PREPARE/PUBLISH only against staging refs.
 * Never production. Never money path. Never logs bot token / JWT / service_role.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import {
  STAGING_SUPABASE_REF,
  assertStagingSupabaseUrl,
  extractSupabaseProjectRef,
  isProductionSupabaseRef,
} from '@/lib/supabase/projectRefs';
import {
  CAZAOFERTAS_PUBLICATION_BOUNDARY,
  CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
  CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS_ENV,
  CAZAOFERTAS_TELEGRAM_CANARY_ENV,
  assertCazaOfertasMoneyUntouched,
  buildAffiliateMapping,
  createAffiliateMappingResolver,
  createCazaPipelineRunner,
  createCazaTelegramBotAdapter,
  createInMemoryAffiliateMappingRepository,
  createInMemoryDealCandidateRepository,
  createInMemoryDealPublicationRepository,
  createMercadoLibreWorkerDiscoverySource,
  createPostgresAffiliateMappingRepository,
  createPostgresDealCandidateRepository,
  createPostgresPublicationRepository,
  mapMercadoLibreWorkerCandidateToDealDraft,
  redactTelegramSecrets,
  resolveTelegramCanaryGate,
  type CazaSupabaseClient,
  type MercadoLibreWorkerDiscoveryCandidate,
} from '@/lib/cazaOfertas';
import {
  CAZA_STAGING_TELEGRAM_CANARY_CHANNEL,
  CAZA_STAGING_TELEGRAM_TOKEN_ALIAS_ENV,
} from '@/lib/cazaOfertas/telegram/stagingChannel';

const OUT = join(process.cwd(), 'scripts', '_caza_bridge_ml_reports');
const STAGING = process.argv.includes('--staging');

/**
 * Fixture derived from the real ExternalWorkerCandidate contract
 * (lib/bots/ingest/externalWorker.ts). Fields mirror worker machine provenance;
 * no invented prices, badge-as-history, or affiliate URLs.
 */
const FIXTURE_CANDIDATE: MercadoLibreWorkerDiscoveryCandidate = {
  url: 'https://www.mercadolibre.com.mx/MLM9876543210-audifonos?wid=MLM9876543210',
  title: 'Audífonos inalámbricos BRIDGE-01 canary',
  store: 'Mercado Libre',
  imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_bridge_canary.jpg',
  discountPrice: 999,
  originalPrice: 1999,
  discountPercent: 50,
  canonicalUrl: 'https://www.mercadolibre.com.mx/MLM9876543210-audifonos?wid=MLM9876543210',
  sourceDetail: 'seed:ofertas',
  cardDiscountSource: 'pdp',
  signals: {
    currentPriceProvenance: 'source_explicit',
    originalPriceProvenance: 'source_explicit',
    discountPercentProvenance: 'derived',
    cardDiscountSource: 'pdp',
  },
  pdpBlocked: false,
};

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1].trim()] == null) process.env[m[1].trim()] = v;
  }
}

function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '[redacted_url]';
  }
}

function assertNoSecretsInReport(report: Record<string, unknown>, token: string, serviceKey: string) {
  const raw = JSON.stringify(report);
  if (token && raw.includes(token)) throw new Error('ABORT: report contains bot token');
  if (serviceKey && raw.includes(serviceKey)) throw new Error('ABORT: report contains service key');
  if (/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/.test(raw)) throw new Error('ABORT: report matches bot token pattern');
  if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(raw)) throw new Error('ABORT: report matches JWT pattern');
  if (/service_role/i.test(raw)) throw new Error('ABORT: report mentions service_role');
}

async function runInMemory(now: Date) {
  const mapped = mapMercadoLibreWorkerCandidateToDealDraft(FIXTURE_CANDIDATE, { now });
  if (!mapped.ok) {
    return {
      mode: 'in_memory' as const,
      accepted: false,
      reasonCodes: mapped.reasons,
      affiliate: 'SKIPPED' as const,
      prepared: 0,
      published: 0,
      messageId: null as string | null,
      identityKey: null as string | null,
      externalProductId: null as string | null,
    };
  }

  const mappings = createInMemoryAffiliateMappingRepository();
  const built = buildAffiliateMapping(
    {
      store: 'mercadolibre_mx',
      externalProductId: mapped.externalProductId,
      canonicalUrl: mapped.draft.url,
      affiliateUrl: `${mapped.draft.url}${mapped.draft.url.includes('?') ? '&' : '?'}matt_word=cazaofertasss`,
    },
    { now }
  );
  let affiliate: 'FOUND' | 'NOT_FOUND' = 'NOT_FOUND';
  if (built.ok) {
    await mappings.upsert(built.value);
    affiliate = 'FOUND';
  }

  const source = createMercadoLibreWorkerDiscoverySource({
    candidates: [FIXTURE_CANDIDATE],
    clock: () => now,
    sourceId: 'ml_worker:bridge_canary',
  });

  const bot = {
    lastMessageId: null as string | null,
    async sendMessage(input: { chatId: string }) {
      this.lastMessageId = '9001';
      return { ok: true as const, messageId: this.lastMessageId, chatId: input.chatId };
    },
  };

  const runner = createCazaPipelineRunner({
    sources: [source],
    candidateRepository: createInMemoryDealCandidateRepository(),
    publicationRepository: createInMemoryDealPublicationRepository(),
    bot,
    gate: {
      mode: 'canary',
      allowedChannels: ['@cazaofertasss'],
      credentialEnvVar: CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
    },
    telegramChannel: '@cazaofertasss',
    affiliateResolver: createAffiliateMappingResolver(mappings, { clock: () => now }),
    clock: () => now,
  });

  const cycle = await runner.runCycle({ mode: 'full' });
  const scoreStage = cycle.stages.find((s) => s.stage === 'SCORE');
  const affStage = cycle.stages.find((s) => s.stage === 'AFFILIATE');

  return {
    mode: 'in_memory' as const,
    accepted: mapped.ok,
    reasonCodes: [
      ...Object.keys(scoreStage?.reasonCodes ?? {}),
      ...Object.keys(affStage?.reasonCodes ?? {}),
    ],
    source: source.sourceId,
    externalProductId: mapped.externalProductId,
    identityKey: mapped.identityKey,
    affiliate,
    affiliateEligible: cycle.affiliateEligible,
    prepared: cycle.prepared,
    published: cycle.published,
    messageId: bot.lastMessageId,
    bridgeReport: source.bridgeReport,
    stages: cycle.stages.map((s) => ({
      stage: s.stage,
      successCount: s.successCount,
      rejectedCount: s.rejectedCount,
      reasonCodes: s.reasonCodes,
    })),
    urlRedacted: redactUrl(mapped.draft.url),
  };
}

async function runStaging(now: Date) {
  loadEnv('.env.local');
  process.env.AVENTA_SUPABASE_TARGET = 'staging';
  process.env[CAZAOFERTAS_TELEGRAM_CANARY_ENV] = '1';
  process.env[CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS_ENV] = CAZA_STAGING_TELEGRAM_CANARY_CHANNEL;

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
  if (!gate.ok) throw new Error(`ABORT canary gate: ${gate.reasons.join(',')}`);

  const mapped = mapMercadoLibreWorkerCandidateToDealDraft(FIXTURE_CANDIDATE, { now });
  if (!mapped.ok) {
    throw new Error(`ABORT bridge reject: ${mapped.reasons.join(',')}`);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as CazaSupabaseClient;

  const mappings = createPostgresAffiliateMappingRepository(sb);
  const built = buildAffiliateMapping(
    {
      store: 'mercadolibre_mx',
      externalProductId: mapped.externalProductId,
      canonicalUrl: mapped.draft.url,
      affiliateUrl: `${mapped.draft.url}${mapped.draft.url.includes('?') ? '&' : '?'}matt_word=cazaofertasss`,
    },
    { now }
  );
  let affiliate: 'FOUND' | 'NOT_FOUND' = 'NOT_FOUND';
  if (built.ok) {
    await mappings.upsert(built.value);
    affiliate = 'FOUND';
  }

  const source = createMercadoLibreWorkerDiscoverySource({
    candidates: [FIXTURE_CANDIDATE],
    clock: () => now,
    sourceId: 'ml_worker:bridge_canary_staging',
  });

  const pubs = createPostgresPublicationRepository(sb);
  const candidates = createPostgresDealCandidateRepository(sb);

  const bot = createCazaTelegramBotAdapter({
    credentialEnvVar: CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
  });

  const runner = createCazaPipelineRunner({
    sources: [source],
    candidateRepository: candidates,
    publicationRepository: pubs,
    bot,
    gate: gate.value,
    telegramChannel: CAZA_STAGING_TELEGRAM_CANARY_CHANNEL,
    affiliateResolver: createAffiliateMappingResolver(mappings, { clock: () => now }),
    clock: () => now,
  });

  const cycle = await runner.runCycle({ mode: 'full' });

  let messageId: string | null = null;
  const stored = await candidates.findByIdentityKey(mapped.identityKey);
  if (stored) {
    const pubsForDeal = await pubs.listByDealId(stored.id, 5);
    const publishedRecord = pubsForDeal.find((p) => p.status === 'PUBLISHED');
    messageId = publishedRecord?.telegramMessageId ?? null;
  }

  const report = {
    mode: 'staging' as const,
    accepted: true,
    reasonCodes: cycle.stages.flatMap((s) => Object.keys(s.reasonCodes)),
    source: source.sourceId,
    externalProductId: mapped.externalProductId,
    identityKey: mapped.identityKey,
    affiliate,
    affiliateEligible: cycle.affiliateEligible,
    prepared: cycle.prepared,
    published: cycle.published,
    messageId,
    bridgeReport: source.bridgeReport,
    stages: cycle.stages.map((s) => ({
      stage: s.stage,
      successCount: s.successCount,
      rejectedCount: s.rejectedCount,
      reasonCodes: s.reasonCodes,
    })),
    urlRedacted: redactUrl(mapped.draft.url),
    supabaseRef: ref,
    channelRedacted: CAZA_STAGING_TELEGRAM_CANARY_CHANNEL.startsWith('@')
      ? `@${CAZA_STAGING_TELEGRAM_CANARY_CHANNEL.slice(1, 3)}***`
      : '***',
    errors: cycle.errors.map((e) => ({
      stage: e.stage,
      code: e.code,
      message: redactTelegramSecrets(e.message, token),
    })),
  };

  assertNoSecretsInReport(report as unknown as Record<string, unknown>, token, key);
  return { report, token, key };
}

async function main() {
  assertCazaOfertasMoneyUntouched();
  mkdirSync(OUT, { recursive: true });
  const now = new Date();
  const stamp = now.getTime();

  let report: Record<string, unknown>;
  let token = '';
  let key = '';

  if (STAGING) {
    const staged = await runStaging(now);
    report = staged.report as unknown as Record<string, unknown>;
    token = staged.token;
    key = staged.key;
  } else {
    report = (await runInMemory(now)) as unknown as Record<string, unknown>;
  }

  report = {
    ...report,
    phase: 'BRIDGE-01',
    at: now.toISOString(),
    stamp,
    redacted: true,
  };

  // Final secret scrub (Telegram error strings etc.)
  const scrubbed = JSON.parse(
    redactTelegramSecrets(JSON.stringify(report), token || 'no-token')
  ) as Record<string, unknown>;
  assertNoSecretsInReport(scrubbed, token, key);

  const outPath = join(OUT, 'caza-bridge-ml-canary-latest.json');
  const stamped = join(OUT, `caza-bridge-ml-canary-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(scrubbed, null, 2));
  writeFileSync(stamped, JSON.stringify(scrubbed, null, 2));

  console.log(JSON.stringify(scrubbed, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
