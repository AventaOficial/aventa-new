/**
 * CazaOfertasss BRIDGE-02 — Real staging E2E canary (max 3).
 *
 *   npx tsx scripts/caza-bridge-02-staging-canary.ts
 *
 * SOURCE PROVENANCE (this run):
 *   fixture_real — payloads from scripts/_smoke-gate-v2-discovery.json
 *   produced by workers/.../smoke-gate-v2-discovery.mjs
 *   (LOCAL_DISCOVERY_READ_ONLY, noPost, noDbWrites).
 *   NOT live discovery in this process. NOT invented fields.
 *
 * Flow:
 *   ExternalWorkerCandidate[1..3]
 *   → ML Worker Bridge
 *   → CazaPipelineRunner
 *   → caza_* PostgreSQL staging
 *   → AffiliateMappingResolver (operated staging upsert)
 *   → PREPARE / Telegram staging (only if score allows)
 *   → REPLAY same set (idempotency)
 *
 * Never production. Never money path. Never invent evidence/PDP/affiliate
 * from thin air. Never modify workers/runner/vercel.
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
  createMercadoLibreWorkerDiscoverySource,
  createPostgresAffiliateMappingRepository,
  createPostgresDealCandidateRepository,
  createPostgresPublicationRepository,
  mapMercadoLibreWorkerCandidateToDealDraft,
  redactTelegramSecrets,
  resolveTelegramCanaryGate,
  type CazaPipelineCycleResult,
  type CazaSupabaseClient,
  type MercadoLibreWorkerDiscoveryCandidate,
} from '@/lib/cazaOfertas';
import {
  CAZA_STAGING_TELEGRAM_CANARY_CHANNEL,
  CAZA_STAGING_TELEGRAM_TOKEN_ALIAS_ENV,
} from '@/lib/cazaOfertas/telegram/stagingChannel';

const ROOT = process.cwd();
const DISCOVERY_PATH = join(ROOT, 'scripts/_smoke-gate-v2-discovery.json');
const OUT = join(ROOT, 'scripts/_caza_bridge_ml_reports');
const MAX_CANDIDATES = 3;

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

function asCandidate(raw: unknown): MercadoLibreWorkerDiscoveryCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === 'string' ? r.url : '';
  const title = typeof r.title === 'string' ? r.title : '';
  const discountPrice = Number(r.discountPrice);
  if (!url || !title || !Number.isFinite(discountPrice)) return null;
  return {
    url,
    title,
    store: typeof r.store === 'string' ? r.store : null,
    imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : null,
    discountPrice,
    originalPrice:
      r.originalPrice == null
        ? null
        : Number.isFinite(Number(r.originalPrice))
          ? Number(r.originalPrice)
          : null,
    discountPercent:
      r.discountPercent == null
        ? null
        : Number.isFinite(Number(r.discountPercent))
          ? Number(r.discountPercent)
          : null,
    canonicalUrl: typeof r.canonicalUrl === 'string' ? r.canonicalUrl : null,
    sourceDetail: typeof r.sourceDetail === 'string' ? r.sourceDetail : null,
    signals:
      r.signals && typeof r.signals === 'object'
        ? (r.signals as MercadoLibreWorkerDiscoveryCandidate['signals'])
        : null,
    cardDiscountSource:
      typeof r.cardDiscountSource === 'string' ? r.cardDiscountSource : null,
    cardBadgePercent:
      r.cardBadgePercent == null
        ? null
        : Number.isFinite(Number(r.cardBadgePercent))
          ? Number(r.cardBadgePercent)
          : null,
    pdpBlocked: r.pdpBlocked === true ? true : r.pdpBlocked === false ? false : null,
  };
}

function loadRealSmokeCandidates(limit: number): {
  provenance: {
    kind: 'fixture_real';
    path: string;
    mode: string | null;
    producedBy: string;
    totalInFile: number;
    selected: number;
  };
  candidates: MercadoLibreWorkerDiscoveryCandidate[];
} {
  if (!existsSync(DISCOVERY_PATH)) {
    throw new Error(
      `ABORT: missing ${DISCOVERY_PATH}. Regenerate with: ` +
        `cd workers/mercadolibre-worker && node scripts/smoke-gate-v2-discovery.mjs`
    );
  }
  const raw = JSON.parse(readFileSync(DISCOVERY_PATH, 'utf8')) as {
    meta?: { mode?: string };
    candidates?: unknown[];
  };
  const all = (raw.candidates ?? [])
    .map(asCandidate)
    .filter((c): c is MercadoLibreWorkerDiscoveryCandidate => c != null);
  if (all.length === 0) throw new Error('ABORT: smoke discovery has 0 parseable candidates');
  const selected = all.slice(0, Math.min(limit, MAX_CANDIDATES));
  return {
    provenance: {
      kind: 'fixture_real',
      path: 'scripts/_smoke-gate-v2-discovery.json',
      mode: raw.meta?.mode ?? null,
      producedBy: 'workers/mercadolibre-worker/scripts/smoke-gate-v2-discovery.mjs',
      totalInFile: all.length,
      selected: selected.length,
    },
    candidates: selected,
  };
}

function stageCodes(cycle: CazaPipelineCycleResult, stage: string): Record<string, number> {
  return cycle.stages.find((s) => s.stage === stage)?.reasonCodes ?? {};
}

async function main() {
  assertCazaOfertasMoneyUntouched();
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

  const { provenance, candidates } = loadRealSmokeCandidates(MAX_CANDIDATES);

  // Pre-map (deterministic ACL) — no invented fields
  const mappedRows = candidates.map((c) => {
    const m = mapMercadoLibreWorkerCandidateToDealDraft(c, { now });
    return { candidate: c, mapped: m };
  });

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as CazaSupabaseClient;

  const candidateRepo = createPostgresDealCandidateRepository(sb);
  const pubRepo = createPostgresPublicationRepository(sb);
  const mappingRepo = createPostgresAffiliateMappingRepository(sb);

  // Operated affiliate mappings (staging canary) — same pattern as FASE 4.1.
  // Does NOT invent evidence; only attaches matt_word marker for resolver.
  const affiliatePrep: Array<{
    identityKey: string;
    externalProductId: string | null;
    status: 'FOUND' | 'NOT_FOUND' | 'BUILD_FAILED';
    reasons?: readonly string[];
  }> = [];

  for (const row of mappedRows) {
    if (!row.mapped.ok) {
      affiliatePrep.push({
        identityKey: 'n/a',
        externalProductId: null,
        status: 'BUILD_FAILED',
        reasons: row.mapped.reasons,
      });
      continue;
    }
    const built = buildAffiliateMapping(
      {
        store: 'mercadolibre_mx',
        externalProductId: row.mapped.externalProductId,
        canonicalUrl: row.mapped.draft.url,
        affiliateUrl: `${row.mapped.draft.url}${row.mapped.draft.url.includes('?') ? '&' : '?'}matt_word=cazaofertasss`,
      },
      { now }
    );
    if (!built.ok) {
      affiliatePrep.push({
        identityKey: row.mapped.identityKey,
        externalProductId: row.mapped.externalProductId,
        status: 'BUILD_FAILED',
        reasons: built.reasons,
      });
      continue;
    }
    await mappingRepo.upsert(built.value);
    const stored = await mappingRepo.findByIdentityKey(built.value.identityKey);
    affiliatePrep.push({
      identityKey: built.value.identityKey,
      externalProductId: row.mapped.externalProductId,
      status: stored?.status === 'ACTIVE' ? 'FOUND' : 'NOT_FOUND',
    });
  }

  const sourceId = `ml_worker:bridge02_staging_${stamp}`;
  const makeSource = () =>
    createMercadoLibreWorkerDiscoverySource({
      candidates,
      clock: () => now,
      sourceId,
      maxItems: MAX_CANDIDATES,
    });

  const bot = createCazaTelegramBotAdapter({
    env: process.env,
    credentialEnvVar: CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
  });
  const resolver = createAffiliateMappingResolver(mappingRepo, { clock: () => now });

  const makeRunner = (runnerId: string) =>
    createCazaPipelineRunner({
      sources: [makeSource()],
      candidateRepository: candidateRepo,
      publicationRepository: pubRepo,
      bot,
      gate: gate.value,
      telegramChannel: CAZA_STAGING_TELEGRAM_CANARY_CHANNEL,
      affiliateResolver: resolver,
      clock: () => now,
      runnerId,
    });

  // ---- Cycle 1 ----
  const cycle = await makeRunner(`caza_bridge02_${stamp}`).runCycle({ mode: 'full' });

  // Per-candidate persistence snapshot
  const perCandidate = [];
  for (let i = 0; i < mappedRows.length; i++) {
    const row = mappedRows[i]!;
    const aff = affiliatePrep[i]!;
    if (!row.mapped.ok) {
      perCandidate.push({
        index: i,
        source: provenance.kind,
        bridge: 'rejected',
        reasonCodes: row.mapped.reasons,
        affiliateStatus: aff.status,
        prepared: false,
        published: false,
        messageId: null as string | null,
      });
      continue;
    }
    const stored = await candidateRepo.findByIdentityKey(row.mapped.identityKey);
    const pubs = stored ? await pubRepo.listByDealId(stored.id, 10) : [];
    const published = pubs.find((p) => p.status === 'PUBLISHED') ?? null;
    perCandidate.push({
      index: i,
      source: sourceId,
      externalProductId: row.mapped.externalProductId,
      identityKey: row.mapped.identityKey,
      urlRedacted: redactUrl(row.mapped.draft.url),
      cardDiscountSource: row.mapped.cardDiscountSource,
      originalPriceProvenance: row.mapped.originalPriceProvenance,
      validationStatus: stored ? 'persisted' : 'missing',
      evidenceStatus: {
        quality: row.mapped.draft.evidence.evidenceQuality,
        priceConfidence: row.mapped.draft.evidence.priceConfidence,
        historicalConfidence: row.mapped.draft.evidence.historicalConfidence,
        source: row.mapped.draft.evidence.source,
      },
      score: stored?.score
        ? { score: stored.score.score, grade: stored.score.grade, gates: stored.score.gatesFailed }
        : null,
      candidateStatus: stored?.status ?? null,
      affiliateStatus: aff.status,
      affiliateEligibleInCycle: false, // filled below from cycle totals; per-item via status
      monetizable: stored?.status === 'PUBLICATION_READY',
      prepared: pubs.some((p) => p.status === 'PREPARED' || p.status === 'PUBLISHED' || p.status === 'SENDING'),
      published: published != null,
      messageId: published?.telegramMessageId ?? null,
      publicationCount: pubs.length,
      reasonCodes: {
        scoreGrade: stored?.score?.grade ?? null,
        scoreGates: stored?.score?.gatesFailed ?? [],
      },
    });
  }

  // Mark affiliateEligible per row from score/status
  for (const row of perCandidate) {
    if ('monetizable' in row && row.monetizable) {
      (row as { affiliateEligibleInCycle: boolean }).affiliateEligibleInCycle = true;
    }
  }

  // ---- Replay ----
  const replay = await makeRunner(`caza_bridge02_replay_${stamp}`).runCycle({ mode: 'full' });

  const replayPerCandidate = [];
  for (const row of mappedRows) {
    if (!row.mapped.ok) continue;
    const stored = await candidateRepo.findByIdentityKey(row.mapped.identityKey);
    const pubs = stored ? await pubRepo.listByDealId(stored.id, 10) : [];
    replayPerCandidate.push({
      identityKey: row.mapped.identityKey,
      publicationCount: pubs.length,
      publishedCount: pubs.filter((p) => p.status === 'PUBLISHED').length,
      telegramMessageIds: pubs
        .filter((p) => p.telegramMessageId)
        .map((p) => p.telegramMessageId),
    });
  }

  const report: Record<string, unknown> = {
    phase: 'BRIDGE-02',
    environment: 'staging',
    supabaseRef: ref,
    at: now.toISOString(),
    stamp,
    sourceProvenance: provenance,
    note:
      'Discovery is fixture_real from existing smoke-gate READ-ONLY output. ' +
      'This harness does not scrape. card_strikethrough evidence typically scores REJECT (<70); ' +
      'publication only if grade allows — no invented PDP/evidence.',
    bridge: {
      received: candidates.length,
      accepted: mappedRows.filter((r) => r.mapped.ok).length,
      rejected: mappedRows.filter((r) => !r.mapped.ok).length,
    },
    affiliatePrep,
    cycle: {
      cycleId: cycle.cycleId,
      discovered: cycle.discovered,
      validated: cycle.validated,
      rejected: cycle.rejected,
      scored: cycle.scored,
      affiliateEligible: cycle.affiliateEligible,
      prepared: cycle.prepared,
      published: cycle.published,
      deduplicated: cycle.deduplicated,
      reasonCodes: {
        SCORE: stageCodes(cycle, 'SCORE'),
        AFFILIATE: stageCodes(cycle, 'AFFILIATE'),
        DEDUPE: stageCodes(cycle, 'DEDUPE'),
        PREPARE_PUBLICATION: stageCodes(cycle, 'PREPARE_PUBLICATION'),
        PUBLISH: stageCodes(cycle, 'PUBLISH'),
      },
      errors: cycle.errors.map((e) => ({
        stage: e.stage,
        code: e.code,
        message: redactTelegramSecrets(e.message, token),
      })),
    },
    replay: {
      cycleId: replay.cycleId,
      discovered: replay.discovered,
      validated: replay.validated,
      affiliateEligible: replay.affiliateEligible,
      prepared: replay.prepared,
      published: replay.published,
      reasonCodes: {
        DEDUPE: stageCodes(replay, 'DEDUPE'),
        PREPARE_PUBLICATION: stageCodes(replay, 'PREPARE_PUBLICATION'),
        PUBLISH: stageCodes(replay, 'PUBLISH'),
      },
      errors: replay.errors.map((e) => ({
        stage: e.stage,
        code: e.code,
        message: redactTelegramSecrets(e.message, token),
      })),
    },
    perCandidate,
    replayPerCandidate,
    idempotency: {
      noSecondPublish: replay.published === 0,
      publicationCountsStable: replayPerCandidate.every((r, i) => {
        const first = perCandidate.find(
          (p) => 'identityKey' in p && p.identityKey === r.identityKey
        ) as { publicationCount?: number } | undefined;
        return first?.publicationCount === r.publicationCount;
      }),
      uniqueMessageIds: [
        ...new Set(replayPerCandidate.flatMap((r) => r.telegramMessageIds.filter(Boolean))),
      ].length,
    },
    channelRedacted: CAZA_STAGING_TELEGRAM_CANARY_CHANNEL.startsWith('@')
      ? `@${CAZA_STAGING_TELEGRAM_CANARY_CHANNEL.slice(1, 3)}***`
      : '***',
    redacted: true,
  };

  assertNoSecretsInReport(report, token, key);
  const scrubbed = JSON.parse(
    redactTelegramSecrets(JSON.stringify(report), token || 'no-token')
  ) as Record<string, unknown>;
  assertNoSecretsInReport(scrubbed, token, key);

  const outPath = join(OUT, 'caza-bridge-02-staging-latest.json');
  const stamped = join(OUT, `caza-bridge-02-staging-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(scrubbed, null, 2));
  writeFileSync(stamped, JSON.stringify(scrubbed, null, 2));
  console.log(JSON.stringify(scrubbed, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
