/**
 * CazaOfertasss FASE 4.1 — Canary real (STAGING ONLY).
 *
 *   npx tsx scripts/caza-fase4-1-mapping-manual-canary.ts
 *
 * 1 affiliate mapping real (caza_affiliate_mappings)
 * 1 import manual (JSON) con 2 ítems: uno con mapping, uno sin mapping
 * 1 ejecución del CazaPipelineRunner (full)
 * 1 publicación Telegram real (sólo el ítem con mapping FOUND)
 *
 * Nunca producción. Nunca money path. Nunca loguea el bot token.
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
  createManualDealDiscoverySources,
  createPostgresAffiliateMappingRepository,
  createPostgresDealCandidateRepository,
  createPostgresPublicationRepository,
  parseManualDealImportJson,
  prepareManualDealImport,
  redactTelegramSecrets,
  resolveTelegramCanaryGate,
  type CazaSupabaseClient,
} from '@/lib/cazaOfertas';
import {
  CAZA_STAGING_TELEGRAM_CANARY_CHANNEL,
  CAZA_STAGING_TELEGRAM_TOKEN_ALIAS_ENV,
} from '@/lib/cazaOfertas/telegram/stagingChannel';

const OUT = join(process.cwd(), 'scripts', '_caza_phase4_1_reports');

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

function redactChannel(channel: string): string {
  if (channel.startsWith('@')) return `@${channel.slice(1, 3)}***`;
  if (channel.startsWith('-100') && channel.length > 8) {
    return `${channel.slice(0, 7)}***${channel.slice(-2)}`;
  }
  return '***';
}

function assertNoSecretsInReport(report: Record<string, unknown>, token: string, serviceKey: string) {
  const raw = JSON.stringify(report);
  if (token && raw.includes(token)) throw new Error('ABORT: report contains bot token');
  if (serviceKey && raw.includes(serviceKey)) throw new Error('ABORT: report contains service key');
  if (/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/.test(raw)) throw new Error('ABORT: report matches bot token pattern');
  if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(raw)) throw new Error('ABORT: report matches JWT pattern');
  if (/service_role/i.test(raw)) throw new Error('ABORT: report mentions service_role');
}

async function main() {
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
  if (!gate.value.allowedChannels.includes(CAZA_STAGING_TELEGRAM_CANARY_CHANNEL)) {
    throw new Error('ABORT: staging channel not allowlisted');
  }

  mkdirSync(OUT, { recursive: true });
  const now = new Date();
  const stamp = now.getTime();
  const capturedAt = new Date(now.getTime() - 5 * 60_000).toISOString();
  const asinMapped = `B0${String(stamp).slice(-8)}`;
  const asinUnmapped = `B1${String(stamp).slice(-8)}`;
  const importId = `imp_canary_${stamp}`;

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as CazaSupabaseClient;

  const candidates = createPostgresDealCandidateRepository(sb);
  const pubs = createPostgresPublicationRepository(sb);
  const mappings = createPostgresAffiliateMappingRepository(sb);

  // -------------------------------------------------------------------------
  // 1) Affiliate mapping real (operado)
  // -------------------------------------------------------------------------
  const mappingBuilt = buildAffiliateMapping(
    {
      store: 'amazon_mx',
      externalProductId: asinMapped,
      canonicalUrl: `https://www.amazon.com.mx/dp/${asinMapped}`,
      affiliateUrl: `https://www.amazon.com.mx/dp/${asinMapped}?tag=cazaofertasss-20`,
      trackingLabel: null,
    },
    { now }
  );
  if (!mappingBuilt.ok) throw new Error(`mapping build failed: ${mappingBuilt.reasons.join(',')}`);
  const mappingUpsert = await mappings.upsert(mappingBuilt.value);
  const mappingStored = await mappings.findByIdentityKey(mappingBuilt.value.identityKey);
  if (!mappingStored || mappingStored.status !== 'ACTIVE') {
    throw new Error('ABORT: mapping not visible in staging after upsert');
  }
  const mappingReplay = await mappings.upsert(mappingBuilt.value);

  // -------------------------------------------------------------------------
  // 2) Import manual JSON (2 ítems: con mapping / sin mapping)
  // -------------------------------------------------------------------------
  const evidence = {
    source: 'store_official_api',
    evidenceQuality: 'strong',
    priceConfidence: 'verified',
    historicalConfidence: 'observed_history',
    observationWindowDays: 30,
    observationCount: 20,
    couponApplied: false,
    promotionApplied: true,
  };
  const body = JSON.stringify({
    items: [
      {
        source: 'ops_canary',
        store: 'amazon_mx',
        externalProductId: asinMapped,
        canonicalUrl: `https://www.amazon.com.mx/dp/${asinMapped}?th=1&utm_source=ops`,
        title: `CazaOfertasss FASE 4.1 canary ${stamp}`,
        currentPrice: 1499,
        referencePrice: 2999,
        currency: 'MXN',
        capturedAt,
        evidence,
        category: 'electronics',
        availability: 'in_stock',
        seller: { trustClass: 'official_store', displayName: 'Amazon México' },
        affiliateMappingRef: mappingBuilt.value.identityKey,
      },
      {
        source: 'ops_canary',
        store: 'amazon_mx',
        externalProductId: asinUnmapped,
        canonicalUrl: `https://www.amazon.com.mx/dp/${asinUnmapped}`,
        title: `CazaOfertasss FASE 4.1 canary unmapped ${stamp}`,
        currentPrice: 1499,
        referencePrice: 2999,
        currency: 'MXN',
        capturedAt,
        evidence,
        category: 'electronics',
        availability: 'in_stock',
        seller: { trustClass: 'official_store', displayName: 'Amazon México' },
      },
    ],
  });
  const parsed = parseManualDealImportJson(body);
  if (!parsed.ok) throw new Error(`json parse failed: ${parsed.reasons.join(',')}`);

  const prepared = await prepareManualDealImport(
    {
      importId,
      source: 'ops_canary',
      format: 'json',
      receivedAt: now.toISOString(),
      limit: 10,
      items: [...parsed.value],
    },
    { now, existingCandidates: candidates }
  );
  if (prepared.report.accepted !== 2 || prepared.report.rejected !== 0) {
    throw new Error(`ABORT: import report unexpected ${JSON.stringify(prepared.report)}`);
  }

  // -------------------------------------------------------------------------
  // 3) Pipeline real: manual source + Postgres mapping resolver + Telegram real
  // -------------------------------------------------------------------------
  const bot = createCazaTelegramBotAdapter({
    env: process.env,
    credentialEnvVar: CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
  });
  const resolver = createAffiliateMappingResolver(mappings);

  const makeRunner = (importPrepared: typeof prepared, runnerId: string) =>
    createCazaPipelineRunner({
      sources: createManualDealDiscoverySources(importPrepared),
      candidateRepository: candidates,
      publicationRepository: pubs,
      bot,
      gate: gate.value,
      telegramChannel: CAZA_STAGING_TELEGRAM_CANARY_CHANNEL,
      affiliateResolver: resolver,
      runnerId,
    });

  const cycle = await makeRunner(prepared, `caza_canary_41_${stamp}`).runCycle({ mode: 'full' });

  if (cycle.discovered !== 2 || cycle.validated !== 2) {
    throw new Error(`ABORT: discovery/validate unexpected d=${cycle.discovered} v=${cycle.validated}`);
  }
  if (cycle.affiliateEligible !== 1) {
    throw new Error(`ABORT: affiliateEligible=${cycle.affiliateEligible} (expected 1)`);
  }
  if (cycle.published !== 1) {
    const safe = cycle.errors.map((e) => redactTelegramSecrets(`${e.stage}:${e.code}:${e.message}`, token));
    throw new Error(`ABORT: published=${cycle.published} errors=${safe.join(' | ')}`);
  }

  const mappedCandidate = await candidates.findByIdentityKey(mappingBuilt.value.identityKey);
  const unmappedCandidate = await candidates.findByIdentityKey(`amazon_mx:pid:${asinUnmapped}`);
  if (!mappedCandidate || !unmappedCandidate) throw new Error('ABORT: candidates not persisted');
  if (mappedCandidate.affiliateUrl !== mappingBuilt.value.affiliateUrl) {
    throw new Error('ABORT: mapped candidate affiliate URL differs from mapping');
  }
  if (unmappedCandidate.affiliate !== null || unmappedCandidate.status === 'PUBLICATION_READY') {
    throw new Error('ABORT: unmapped candidate became monetizable');
  }

  const mappedPubs = await pubs.listByDealId(mappedCandidate.id, 5);
  const unmappedPubs = await pubs.listByDealId(unmappedCandidate.id, 5);
  const publishedRecord = mappedPubs.find((p) => p.status === 'PUBLISHED');
  if (!publishedRecord?.telegramMessageId) throw new Error('ABORT: no PUBLISHED record with message id');
  if (unmappedPubs.length !== 0) throw new Error('ABORT: unmapped candidate has publications');
  if (publishedRecord.cardSnapshot?.affiliateUrl !== mappingBuilt.value.affiliateUrl) {
    throw new Error('ABORT: snapshot affiliate URL mismatch');
  }

  // -------------------------------------------------------------------------
  // 4) Replay: mismo import ⇒ nada nuevo, sin segundo envío
  // -------------------------------------------------------------------------
  const replayPrepared = await prepareManualDealImport(
    {
      importId: `${importId}_replay`,
      source: 'ops_canary',
      format: 'json',
      receivedAt: new Date().toISOString(),
      limit: 10,
      items: [...parsed.value],
    },
    { now: new Date(), existingCandidates: candidates }
  );
  const replay = await makeRunner(replayPrepared, `caza_canary_41_replay_${stamp}`).runCycle({
    mode: 'full',
  });
  const mappedPubsAfter = await pubs.listByDealId(mappedCandidate.id, 5);

  const report: Record<string, unknown> = {
    environment: 'staging',
    projectRef: STAGING_SUPABASE_REF,
    phase: '4.1',
    mapping: {
      id: mappingStored.id,
      identityKey: mappingStored.identityKey,
      identityStrategy: mappingStored.identityStrategy,
      status: mappingStored.status,
      trackingLabelDeclared: mappingStored.trackingLabel,
      affiliateUrlHost: new URL(mappingStored.affiliateUrl).host,
      upsertAction: mappingUpsert.action,
      replayUpsertAction: mappingReplay.action,
    },
    manualImport: {
      importId: prepared.report.importId,
      format: prepared.report.format,
      received: prepared.report.received,
      accepted: prepared.report.accepted,
      rejected: prepared.report.rejected,
      duplicates: prepared.report.duplicates,
      conflicts: prepared.report.conflicts,
      errors: prepared.report.errors,
    },
    cycle: {
      cycleId: cycle.cycleId,
      discovered: cycle.discovered,
      validated: cycle.validated,
      scored: cycle.scored,
      affiliateEligible: cycle.affiliateEligible,
      prepared: cycle.prepared,
      published: cycle.published,
      failed: cycle.failed,
      skipped: cycle.skipped,
      budgetsExhausted: cycle.budgetsExhausted,
      stages: cycle.stages.map((s) => ({
        stage: s.stage,
        input: s.inputCount,
        success: s.successCount,
        rejected: s.rejectedCount,
        failed: s.failedCount,
        skipped: s.skippedCount,
        reasonCodes: s.reasonCodes,
      })),
    },
    mappedCandidate: {
      id: mappedCandidate.id,
      status: mappedCandidate.status,
      revision: mappedCandidate.revision,
      monetizable: mappedCandidate.affiliate !== null,
      trackingLabel: mappedCandidate.affiliate?.affiliateTrackingLabel ?? null,
    },
    unmappedCandidate: {
      id: unmappedCandidate.id,
      status: unmappedCandidate.status,
      monetizable: unmappedCandidate.affiliate !== null,
      publications: unmappedPubs.length,
    },
    telegram: {
      channelIdentifierRedacted: redactChannel(CAZA_STAGING_TELEGRAM_CANARY_CHANNEL),
      publicationIdRedacted: publishedRecord.publicationId.replace(
        CAZA_STAGING_TELEGRAM_CANARY_CHANNEL,
        redactChannel(CAZA_STAGING_TELEGRAM_CANARY_CHANNEL)
      ),
      messageId: publishedRecord.telegramMessageId,
      publishedAt: publishedRecord.publishedAt,
      publishedRevision: publishedRecord.publishedRevision,
      attempts: publishedRecord.attemptCount,
      snapshotAffiliateUrlHost: new URL(publishedRecord.cardSnapshot.affiliateUrl).host,
    },
    replay: {
      importAccepted: replayPrepared.report.accepted,
      importConflicts: replayPrepared.report.conflicts,
      deduplicated: replay.deduplicated,
      prepared: replay.prepared,
      published: replay.published,
      publicationsForMappedDeal: mappedPubsAfter.length,
      noSecondSend: replay.published === 0 && mappedPubsAfter.length === 1,
    },
    moneyPathUntouched: true,
    productionUntouched: true,
    deployPerformed: false,
    commitPerformed: false,
    pushPerformed: false,
    timestamp: new Date().toISOString(),
    result:
      cycle.published === 1 && replay.published === 0 && mappedPubsAfter.length === 1 && unmappedPubs.length === 0
        ? 'PASS'
        : 'FAIL',
  };

  assertNoSecretsInReport(report, token, key);
  const outPath = join(OUT, 'caza-fase4-1-canary-latest.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
  if (report.result !== 'PASS') process.exit(2);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const token = process.env[CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV] ?? '';
  console.error(redactTelegramSecrets(message, token));
  process.exit(1);
});
