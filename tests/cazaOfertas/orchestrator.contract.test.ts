/**
 * CazaOfertasss — FASE 4. Orchestrator (CazaPipelineRunner).
 *
 * Matriz A–T + scheduling contract + observabilidad + money isolation.
 */

import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  CAZA_PIPELINE_BUDGETS,
  CAZA_PIPELINE_STAGES,
  CAZA_SCHEDULE_CONTRACTS,
  CAZAOFERTAS_SCHEDULING_BOUNDARY,
  DISCOVERY_CAPABILITY_UNSUPPORTED,
  MAX_DISCOVERY_PER_RUN,
  MAX_PUBLICATIONS_PER_RUN,
  assertCazaOfertasMoneyUntouched,
  assertProductionCronDisabled,
  buildTrackingLabel,
  createCazaPipelineRunner,
  createDealStoreAdapterRegistry,
  createInMemoryDealCandidateRepository,
  createInMemoryDealPublicationRepository,
  createStaticDiscoverySource,
  createStoreAdapterAffiliateResolver,
  createStoreAdapterDiscoverySource,
  networkForStore,
  preparePublication,
  redactForObservability,
  resolveCazaPipelineBudgets,
  resolveScheduleIntervalMs,
  runDiscoveryCycle,
  runPublicationDrain,
  runRecoveryCycle,
  type AffiliateAttachmentResolver,
  type CazaClock,
  type CazaPipelineCycleResult,
  type CazaPipelineRunnerDeps,
  type CazaStageReport,
  type CazaTelegramBotPort,
  type CazaTelegramSendResult,
  type DealCandidateDraft,
  type DealCandidateRepository,
  type DealDiscoverySource,
  type DealPublicationRepository,
  type TelegramCanaryGate,
} from '@/lib/cazaOfertas';

import { NOW, NOW_ISO, amazonDraft, mercadoLibreDraft, pageClaimEvidence } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHANNEL = '@cazaofertasss';
const GATE: TelegramCanaryGate = {
  mode: 'canary',
  allowedChannels: [CHANNEL],
  credentialEnvVar: 'CAZAOFERTAS_TELEGRAM_BOT_TOKEN',
};
const FIXED_CLOCK: CazaClock = () => NOW;

function asin(i: number): string {
  return `B0${String(i).padStart(8, '0')}`;
}

function amazonItem(i: number, overrides: Partial<DealCandidateDraft> = {}): DealCandidateDraft {
  return amazonDraft({
    url: `https://www.amazon.com.mx/dp/${asin(i)}?th=1&utm_source=x`,
    title: `Producto ${i}`,
    ...overrides,
  });
}

function amazonItems(n: number): DealCandidateDraft[] {
  return Array.from({ length: n }, (_, i) => amazonItem(i + 1));
}

/** Resolver de test: attachment estructuralmente válido para el host canónico. */
function testAffiliateResolver(): AffiliateAttachmentResolver {
  return {
    async resolve(input) {
      const network = networkForStore(input.identity.store);
      const label = buildTrackingLabel(input.dealId, network, input.now);
      if (!label.ok) return label;
      const marker = network === 'amazon_associates_mx' ? 'tag=cazaofertasss-20' : 'matt_word=caza';
      const credentialRef =
        network === 'amazon_associates_mx'
          ? 'CAZAOFERTAS_AMAZON_ASSOCIATE_TAG'
          : 'CAZAOFERTAS_ML_AFFILIATE_TAG';
      return {
        ok: true,
        value: {
          affiliateNetwork: network,
          affiliateUrl: `${input.canonicalUrl}?${marker}`,
          affiliateTrackingLabel: label.value,
          affiliateGeneratedAt: input.now,
          affiliateCredentialRef: credentialRef,
        },
      };
    },
  };
}

function countingBot(result?: CazaTelegramSendResult): CazaTelegramBotPort & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async sendMessage(input) {
      state.calls += 1;
      if (result) return result;
      return { ok: true, messageId: String(5000 + state.calls), chatId: input.chatId };
    },
  };
}

const RESULT_429: CazaTelegramSendResult = {
  ok: false,
  retryable: true,
  unknownOutcome: false,
  code: 'telegram_rate_limited',
  message: 'Too Many Requests',
  retryAfterSeconds: 30,
  httpStatus: 429,
};
const RESULT_5XX: CazaTelegramSendResult = {
  ok: false,
  retryable: true,
  unknownOutcome: false,
  code: 'telegram_server_error',
  message: 'Internal Server Error',
  retryAfterSeconds: null,
  httpStatus: 502,
};
const RESULT_UNKNOWN: CazaTelegramSendResult = {
  ok: false,
  retryable: false,
  unknownOutcome: true,
  code: 'telegram_network_or_timeout',
  message: 'AbortError: timeout',
  retryAfterSeconds: null,
  httpStatus: null,
};

interface HarnessOptions {
  readonly items?: readonly DealCandidateDraft[];
  readonly sources?: readonly DealDiscoverySource[];
  readonly bot?: CazaTelegramBotPort & { calls: number };
  readonly resolver?: AffiliateAttachmentResolver | null;
  readonly gate?: TelegramCanaryGate | null;
  readonly clock?: CazaClock;
  readonly candidateRepo?: DealCandidateRepository & { size(): number };
  readonly pubRepo?: DealPublicationRepository;
  readonly runnerId?: string;
  readonly stages?: CazaStageReport[];
}

function harness(options: HarnessOptions = {}) {
  const candidateRepo = options.candidateRepo ?? createInMemoryDealCandidateRepository();
  const pubRepo = options.pubRepo ?? createInMemoryDealPublicationRepository();
  const bot = options.bot ?? countingBot();
  const sources =
    options.sources ??
    (options.items
      ? [
          createStaticDiscoverySource({
            sourceId: 'static:amazon_mx',
            store: 'amazon_mx',
            items: options.items,
            clock: FIXED_CLOCK,
          }),
        ]
      : []);
  const deps: CazaPipelineRunnerDeps = {
    sources,
    candidateRepository: candidateRepo,
    publicationRepository: pubRepo,
    bot,
    gate: options.gate === undefined ? GATE : options.gate,
    telegramChannel: CHANNEL,
    affiliateResolver: options.resolver === null ? undefined : options.resolver ?? testAffiliateResolver(),
    clock: options.clock ?? FIXED_CLOCK,
    runnerId: options.runnerId,
    observer: options.stages ? { onStage: (r) => options.stages!.push(r) } : undefined,
  };
  return { runner: createCazaPipelineRunner(deps), candidateRepo, pubRepo, bot };
}

function stage(result: CazaPipelineCycleResult, name: CazaStageReport['stage']): CazaStageReport {
  const found = result.stages.find((s) => s.stage === name);
  if (!found) throw new Error(`stage ${name} not reported`);
  return found;
}

function expectNoSensitive(result: CazaPipelineCycleResult) {
  const json = JSON.stringify(result);
  expect(json).not.toMatch(/\d{6,12}:[A-Za-z0-9_-]{20,}/);
  expect(json).not.toMatch(/service_role/i);
  expect(json).not.toMatch(/tag=cazaofertasss-20/);
}

// ---------------------------------------------------------------------------
// A. empty discovery
// ---------------------------------------------------------------------------

describe('A. empty discovery', () => {
  it('sin fuentes → ciclo vacío sin errores', async () => {
    const { runner, bot } = harness({ sources: [] });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.discovered).toBe(0);
    expect(r.validated).toBe(0);
    expect(r.prepared).toBe(0);
    expect(r.published).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.errors).toEqual([]);
    expect(bot.calls).toBe(0);
    expect(r.stages.map((s) => s.stage)).toEqual([
      'DISCOVER',
      'NORMALIZE',
      'VALIDATE',
      'SCORE',
      'AFFILIATE',
      'DEDUPE',
      'ELIGIBILITY',
      'PREPARE_PUBLICATION',
      'RECOVER',
      'PUBLISH',
    ]);
  });

  it('fuente vacía → outcome empty', async () => {
    const { runner } = harness({ items: [] });
    const r = await runner.runCycle({ mode: 'discovery' });
    expect(r.discovered).toBe(0);
    expect(r.sources).toEqual([
      expect.objectContaining({ sourceId: 'static:amazon_mx', outcome: 'empty', discovered: 0 }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// B. unsupported provider
// ---------------------------------------------------------------------------

describe('B. unsupported provider', () => {
  it('adapters reales devuelven CAPABILITY_UNSUPPORTED sin romper el ciclo', async () => {
    const registry = createDealStoreAdapterRegistry();
    const sources = [
      createStoreAdapterDiscoverySource(registry.amazon_mx, { clock: FIXED_CLOCK }),
      createStoreAdapterDiscoverySource(registry.mercadolibre_mx, { clock: FIXED_CLOCK }),
    ];
    const { runner } = harness({ sources });
    const r = await runner.runCycle({ mode: 'full' });

    expect(r.discovered).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.errors).toEqual([]);
    expect(r.sources.map((s) => s.outcome)).toEqual(['unsupported', 'unsupported']);
    expect(stage(r, 'DISCOVER').reasonCodes[DISCOVERY_CAPABILITY_UNSUPPORTED]).toBe(2);
  });

  it('el port de la fuente devuelve CAPABILITY_UNSUPPORTED directamente', async () => {
    const registry = createDealStoreAdapterRegistry();
    const source = createStoreAdapterDiscoverySource(registry.amazon_mx);
    const page = await source.discover({ limit: 10 });
    expect(page.ok).toBe(false);
    if (page.ok) return;
    expect(page.reasons[0]).toBe(DISCOVERY_CAPABILITY_UNSUPPORTED);
    expect(page.reasons[1]).toContain('adapter.capability_not_implemented:amazon_mx.discover');
  });

  it('discovery unsupported no bloquea PREPARED existentes (failure isolation)', async () => {
    const registry = createDealStoreAdapterRegistry();
    const pubRepo = createInMemoryDealPublicationRepository();
    const seeded = harness({ items: amazonItems(1), pubRepo });
    await seeded.runner.runCycle({ mode: 'discovery' });

    const bot = countingBot();
    const { runner } = harness({
      sources: [createStoreAdapterDiscoverySource(registry.amazon_mx)],
      pubRepo,
      bot,
    });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.discovered).toBe(0);
    expect(r.published).toBe(1);
    expect(bot.calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// C. 1 candidate
// ---------------------------------------------------------------------------

describe('C. 1 candidate', () => {
  it('happy path completo: discover → PUBLISHED', async () => {
    const { runner, candidateRepo, pubRepo, bot } = harness({ items: amazonItems(1) });
    const r = await runner.runCycle({ mode: 'full', cycleId: 'cycle_c_1' });

    expect(r.cycleId).toBe('cycle_c_1');
    expect(r.startedAt).toBe(NOW_ISO);
    expect(r.discovered).toBe(1);
    expect(r.validated).toBe(1);
    expect(r.rejected).toBe(0);
    expect(r.scored).toBe(1);
    expect(r.deduplicated).toBe(0);
    expect(r.affiliateEligible).toBe(1);
    expect(r.prepared).toBe(1);
    expect(r.published).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.errors).toEqual([]);
    expect(bot.calls).toBe(1);
    expect(candidateRepo.size()).toBe(1);

    const candidates = await candidateRepo.listByStatus('PUBLICATION_READY', 10);
    expect(candidates.items).toHaveLength(1);
    const pubs = await pubRepo.listByDealId(candidates.items[0].id, 10);
    expect(pubs).toHaveLength(1);
    expect(pubs[0].status).toBe('PUBLISHED');
    expect(pubs[0].telegramMessageId).toBe('5001');
    expectNoSensitive(r);
  });
});

// ---------------------------------------------------------------------------
// D. 100 candidates
// ---------------------------------------------------------------------------

describe('D. 100 candidates', () => {
  it('procesa 100, publica hasta el budget y termina en ciclos sucesivos sin duplicados', async () => {
    const { runner, candidateRepo, pubRepo, bot } = harness({ items: amazonItems(100) });
    const first = await runner.runCycle({ mode: 'full' });

    expect(first.discovered).toBe(100);
    expect(first.validated).toBe(100);
    expect(first.scored).toBe(100);
    expect(first.affiliateEligible).toBe(100);
    expect(first.prepared).toBe(MAX_PUBLICATIONS_PER_RUN);
    expect(first.published).toBe(MAX_PUBLICATIONS_PER_RUN);
    expect(first.budgetsExhausted).toContain('MAX_PUBLICATIONS_PER_RUN');
    expect(candidateRepo.size()).toBe(100);
    expect(bot.calls).toBe(MAX_PUBLICATIONS_PER_RUN);

    let totalPublished = first.published;
    for (let i = 0; i < 6 && totalPublished < 100; i += 1) {
      const next = await runner.runCycle({ mode: 'full' });
      expect(next.errors).toEqual([]);
      totalPublished += next.published;
    }
    expect(totalPublished).toBe(100);
    expect(bot.calls).toBe(100);

    const ready = await candidateRepo.listByStatus('PUBLICATION_READY', 200);
    expect(ready.items).toHaveLength(100);
    for (const c of ready.items) {
      expect(c.revision).toBe(1);
      const pubs = await pubRepo.listByDealId(c.id, 10);
      expect(pubs).toHaveLength(1);
      expect(pubs[0].status).toBe('PUBLISHED');
    }
  });
});

// ---------------------------------------------------------------------------
// E. discovery limit
// ---------------------------------------------------------------------------

describe('E. discovery limit', () => {
  it('respeta MAX_DISCOVERY_PER_RUN y devuelve cursor para reanudar', async () => {
    const { runner, candidateRepo } = harness({ items: amazonItems(500) });
    const first = await runner.runCycle({
      mode: 'discovery',
      budgets: { MAX_DISCOVERY_PER_RUN: 50 },
    });
    expect(first.discovered).toBe(50);
    expect(first.budgets.MAX_DISCOVERY_PER_RUN).toBe(50);
    expect(first.sources[0].nextCursor).toBe('50');
    expect(candidateRepo.size()).toBe(50);

    const second = await runner.runCycle({
      mode: 'discovery',
      budgets: { MAX_DISCOVERY_PER_RUN: 50 },
      cursors: { 'static:amazon_mx': first.sources[0].nextCursor },
    });
    expect(second.discovered).toBe(50);
    expect(second.deduplicated).toBe(0);
    expect(candidateRepo.size()).toBe(100);
  });

  it('un override nunca supera el techo de constants', () => {
    const b = resolveCazaPipelineBudgets({
      MAX_DISCOVERY_PER_RUN: 1_000_000,
      MAX_PUBLICATIONS_PER_RUN: 999,
      MAX_TELEGRAM_SENDS_PER_RUN: 999,
      MAX_EXECUTION_MS: Number.POSITIVE_INFINITY,
      MAX_CANDIDATES_PER_RUN: -5,
    });
    expect(b.MAX_DISCOVERY_PER_RUN).toBe(MAX_DISCOVERY_PER_RUN);
    expect(b.MAX_PUBLICATIONS_PER_RUN).toBe(CAZA_PIPELINE_BUDGETS.MAX_PUBLICATIONS_PER_RUN);
    expect(b.MAX_TELEGRAM_SENDS_PER_RUN).toBe(CAZA_PIPELINE_BUDGETS.MAX_TELEGRAM_SENDS_PER_RUN);
    expect(b.MAX_EXECUTION_MS).toBe(CAZA_PIPELINE_BUDGETS.MAX_EXECUTION_MS);
    expect(b.MAX_CANDIDATES_PER_RUN).toBe(1);
  });

  it('una fuente que ignora limit no rompe el budget', async () => {
    const greedy: DealDiscoverySource = {
      sourceId: 'greedy',
      store: 'amazon_mx',
      async discover() {
        return {
          ok: true,
          value: { items: amazonItems(80), nextCursor: null, source: 'greedy', observedAt: NOW_ISO },
        };
      },
    };
    const { runner } = harness({ sources: [greedy] });
    const r = await runner.runCycle({ mode: 'discovery', budgets: { MAX_DISCOVERY_PER_RUN: 10 } });
    expect(r.discovered).toBe(10);
  });

  it('discovery excedente sobre MAX_CANDIDATES_PER_RUN se salta, no se procesa', async () => {
    const { runner, candidateRepo } = harness({ items: amazonItems(40) });
    const r = await runner.runCycle({
      mode: 'discovery',
      budgets: { MAX_CANDIDATES_PER_RUN: 10 },
    });
    expect(r.discovered).toBe(40);
    expect(r.validated).toBe(10);
    expect(candidateRepo.size()).toBe(10);
    expect(stage(r, 'NORMALIZE').reasonCodes['budget.candidates_exhausted']).toBe(30);
    expect(r.budgetsExhausted).toContain('MAX_CANDIDATES_PER_RUN');
  });
});

// ---------------------------------------------------------------------------
// F. publication limit
// ---------------------------------------------------------------------------

describe('F. publication limit', () => {
  it('MAX_PUBLICATIONS_PER_RUN y MAX_TELEGRAM_SENDS_PER_RUN acotan prepare y send', async () => {
    const { runner, bot, pubRepo } = harness({ items: amazonItems(30) });
    const r = await runner.runCycle({
      mode: 'full',
      budgets: { MAX_PUBLICATIONS_PER_RUN: 5, MAX_TELEGRAM_SENDS_PER_RUN: 3 },
    });
    expect(r.affiliateEligible).toBe(30);
    expect(r.prepared).toBe(5);
    expect(r.published).toBe(3);
    expect(bot.calls).toBe(3);
    expect(stage(r, 'PREPARE_PUBLICATION').reasonCodes['budget.publications_exhausted']).toBe(25);
    expect(r.budgetsExhausted).toEqual(
      expect.arrayContaining(['MAX_PUBLICATIONS_PER_RUN'])
    );
    const due = await pubRepo.listDueForSend(25, NOW);
    expect(due).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// G. duplicate candidate
// ---------------------------------------------------------------------------

describe('G. duplicate candidate', () => {
  it('dos drafts del mismo producto (URLs distintas) → un candidato, una publicación', async () => {
    const items = [
      amazonItem(7),
      amazonItem(7, { url: `https://amazon.com.mx/dp/${asin(7)}?ref=abc&tag=otro-20`, title: 'Otro título' }),
    ];
    const { runner, candidateRepo, pubRepo } = harness({ items });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.discovered).toBe(2);
    expect(r.validated).toBe(2);
    expect(r.deduplicated).toBe(1);
    expect(r.prepared).toBe(1);
    expect(r.published).toBe(1);
    expect(candidateRepo.size()).toBe(1);
    const ready = await candidateRepo.listByStatus('PUBLICATION_READY', 10);
    expect(ready.items[0].revision).toBe(1);
    expect(await pubRepo.listByDealId(ready.items[0].id, 10)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// H. duplicate publication
// ---------------------------------------------------------------------------

describe('H. duplicate publication', () => {
  it('dos ciclos de discovery no duplican el registro PREPARED', async () => {
    const { runner, candidateRepo, pubRepo } = harness({ items: amazonItems(3) });
    const a = await runner.runCycle({ mode: 'discovery' });
    const b = await runner.runCycle({ mode: 'discovery' });
    expect(a.prepared).toBe(3);
    expect(b.prepared).toBe(0);
    expect(b.deduplicated).toBe(3);
    expect(stage(b, 'PREPARE_PUBLICATION').reasonCodes['prepare.idempotent_hit']).toBe(3);
    const ready = await candidateRepo.listByStatus('PUBLICATION_READY', 10);
    for (const c of ready.items) {
      expect(await pubRepo.listByDealId(c.id, 10)).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// I. concurrent ×10
// ---------------------------------------------------------------------------

describe('I. concurrent ×10', () => {
  it('10 runners concurrentes sobre los mismos repos: 0 duplicados', async () => {
    const candidateRepo = createInMemoryDealCandidateRepository();
    const pubRepo = createInMemoryDealPublicationRepository();
    const bot = countingBot();
    const items = amazonItems(5);

    const runners = Array.from({ length: 10 }, (_, i) =>
      harness({ items, candidateRepo, pubRepo, bot, runnerId: `runner_${i}` }).runner
    );
    const results = await Promise.all(
      runners.map((r) => r.runCycle({ mode: 'full', cycleId: 'cycle_concurrent' }))
    );

    expect(bot.calls).toBe(5);
    expect(candidateRepo.size()).toBe(5);
    expect(results.reduce((acc, r) => acc + r.published, 0)).toBe(5);
    expect(results.reduce((acc, r) => acc + r.prepared, 0)).toBe(5);
    expect(results.every((r) => r.failed === 0)).toBe(true);

    const ready = await candidateRepo.listByStatus('PUBLICATION_READY', 10);
    expect(ready.items).toHaveLength(5);
    for (const c of ready.items) {
      expect(c.revision).toBe(1);
      const pubs = await pubRepo.listByDealId(c.id, 10);
      expect(pubs).toHaveLength(1);
      expect(pubs[0].status).toBe('PUBLISHED');
      expect(pubs[0].attemptCount).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// J/K/L. Telegram 429 / 5xx / unknown
// ---------------------------------------------------------------------------

describe('J/K/L. Telegram outcomes', () => {
  async function publishWith(result: CazaTelegramSendResult) {
    const bot = countingBot(result);
    const { runner, pubRepo, candidateRepo } = harness({ items: amazonItems(1), bot });
    const r = await runner.runCycle({ mode: 'full' });
    const ready = await candidateRepo.listByStatus('PUBLICATION_READY', 10);
    const pubs = await pubRepo.listByDealId(ready.items[0].id, 10);
    return { r, bot, pubRepo, record: pubs[0], runner };
  }

  it('J. 429 → PREPARED + retry (next_attempt_at), sin FAILED', async () => {
    const { r, record, bot } = await publishWith(RESULT_429);
    expect(bot.calls).toBe(1);
    expect(r.published).toBe(0);
    expect(r.retried).toBe(1);
    expect(r.failed).toBe(0);
    expect(record.status).toBe('PREPARED');
    expect(record.nextAttemptAt).not.toBeNull();
    expect(record.attemptCount).toBe(1);
    expect(record.lastErrorCode).toBe('telegram_rate_limited');
  });

  it('K. 5xx → PREPARED + retry', async () => {
    const { r, record } = await publishWith(RESULT_5XX);
    expect(r.retried).toBe(1);
    expect(r.published).toBe(0);
    expect(record.status).toBe('PREPARED');
    expect(record.lastErrorCode).toBe('telegram_server_error');
  });

  it('K2. retry no se reenvía hasta next_attempt_at (no_due)', async () => {
    const { runner, bot, record } = await publishWith(RESULT_5XX);
    const again = await runner.runCycle({ mode: 'publication_drain' });
    expect(again.published).toBe(0);
    expect(again.retried).toBe(0);
    expect(bot.calls).toBe(1);
    expect(record.nextAttemptAt).not.toBeNull();
  });

  it('L. unknown outcome → FAILED terminal; replay no reenvía', async () => {
    const { r, record, pubRepo } = await publishWith(RESULT_UNKNOWN);
    expect(r.failed).toBe(1);
    expect(r.published).toBe(0);
    expect(record.status).toBe('FAILED');
    expect(record.lastErrorCode).toBe('telegram_network_or_timeout');
    expect(r.errors).toEqual([
      expect.objectContaining({ stage: 'PUBLISH', identityKey: record.publicationId }),
    ]);

    const bot = countingBot();
    const { runner } = harness({ items: amazonItems(1), pubRepo, bot });
    const replay = await runner.runCycle({ mode: 'full' });
    expect(bot.calls).toBe(0);
    expect(replay.published).toBe(0);
    expect((await pubRepo.findByIdentityKey(record.publicationId))?.status).toBe('FAILED');
  });
});

// ---------------------------------------------------------------------------
// M. candidate validation failure
// ---------------------------------------------------------------------------

describe('M. candidate validation failure', () => {
  it('drafts inválidos se rechazan con reason codes, sin excepciones', async () => {
    const items: DealCandidateDraft[] = [
      amazonItem(1, { url: 'http://amazon.com.mx/dp/B000000001' }),
      amazonItem(2, { currentPrice: 1500 }), // no coincide con evidence.currentPrice
      amazonItem(3, { store: 'mercadolibre_mx' }), // host/store mismatch
    ];
    const { runner, candidateRepo } = harness({ items });
    const r = await runner.runCycle({ mode: 'discovery' });
    expect(r.discovered).toBe(3);
    expect(r.rejected).toBe(3);
    expect(r.validated).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.errors).toEqual([]);
    expect(candidateRepo.size()).toBe(0);
    const normalize = stage(r, 'NORMALIZE');
    const validate = stage(r, 'VALIDATE');
    expect(normalize.rejectedCount + validate.rejectedCount).toBe(3);
    expect(Object.keys({ ...normalize.reasonCodes, ...validate.reasonCodes }).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// N. scoring rejection
// ---------------------------------------------------------------------------

describe('N. scoring rejection', () => {
  it('page_claim → REJECT: se persiste REJECTED y nunca se prepara', async () => {
    const { runner, candidateRepo, bot } = harness({
      items: [amazonItem(1, { evidence: pageClaimEvidence() })],
    });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.validated).toBe(1);
    expect(r.rejected).toBe(1);
    expect(r.scored).toBe(0);
    expect(r.affiliateEligible).toBe(0);
    expect(r.prepared).toBe(0);
    expect(bot.calls).toBe(0);
    expect(stage(r, 'SCORE').reasonCodes['score.grade_reject']).toBe(1);
    const rejected = await candidateRepo.listByStatus('REJECTED', 10);
    expect(rejected.items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// O. affiliate ineligible
// ---------------------------------------------------------------------------

describe('O. affiliate ineligible', () => {
  it('sin resolver (default nulo) → VALIDATED, no monetizable, no publica', async () => {
    const { runner, candidateRepo, bot } = harness({ items: amazonItems(2), resolver: null });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.scored).toBe(2);
    expect(r.affiliateEligible).toBe(0);
    expect(r.prepared).toBe(0);
    expect(bot.calls).toBe(0);
    expect(stage(r, 'AFFILIATE').reasonCodes['affiliate.resolver_null']).toBe(2);
    const validated = await candidateRepo.listByStatus('VALIDATED', 10);
    expect(validated.items).toHaveLength(2);
    expect(validated.items[0].affiliateUrl).toBeNull();
  });

  it('resolver basado en adapters actuales es fail-closed (capability unsupported)', async () => {
    const resolver = createStoreAdapterAffiliateResolver(createDealStoreAdapterRegistry());
    const { runner } = harness({ items: amazonItems(1), resolver });
    const r = await runner.runCycle({ mode: 'discovery' });
    expect(r.affiliateEligible).toBe(0);
    expect(
      Object.keys(stage(r, 'AFFILIATE').reasonCodes).some((k) =>
        k.startsWith('affiliate.capability_unsupported:amazon_mx')
      )
    ).toBe(true);
  });

  it('attachment con marcadores incorrectos → no monetizable (autoridad affiliate.ts)', async () => {
    const badResolver: AffiliateAttachmentResolver = {
      async resolve(input) {
        return {
          ok: true,
          value: {
            affiliateNetwork: 'amazon_associates_mx',
            affiliateUrl: `${input.canonicalUrl}?ref=nada`,
            affiliateTrackingLabel: 'caza_0f1e2d3c_20260919',
            affiliateGeneratedAt: NOW_ISO,
            affiliateCredentialRef: 'CAZAOFERTAS_AMAZON_ASSOCIATE_TAG',
          },
        };
      },
    };
    const { runner } = harness({ items: amazonItems(1), resolver: badResolver });
    const r = await runner.runCycle({ mode: 'discovery' });
    expect(r.affiliateEligible).toBe(0);
    expect(r.prepared).toBe(0);
  });

  it('resolver que lanza → sin attachment, ciclo intacto', async () => {
    const throwing: AffiliateAttachmentResolver = {
      async resolve() {
        throw new Error('network down tag=SECRET-20');
      },
    };
    const { runner, candidateRepo } = harness({ items: amazonItems(1), resolver: throwing });
    const r = await runner.runCycle({ mode: 'discovery' });
    expect(r.affiliateEligible).toBe(0);
    expect(candidateRepo.size()).toBe(1);
    expect(r.errors[0]?.code).toBe('affiliate.resolver_exception');
    expect(r.errors[0]?.message).not.toContain('SECRET-20');
  });
});

// ---------------------------------------------------------------------------
// P. replay same cycle
// ---------------------------------------------------------------------------

describe('P. replay same cycle', () => {
  it('mismo cycleId dos veces → 0 publicaciones nuevas, 0 reenvíos, revisiones intactas', async () => {
    const { runner, candidateRepo, pubRepo, bot } = harness({ items: amazonItems(4) });
    const a = await runner.runCycle({ mode: 'full', cycleId: 'cycle_replay' });
    const b = await runner.runCycle({ mode: 'full', cycleId: 'cycle_replay' });

    expect(a.prepared).toBe(4);
    expect(a.published).toBe(4);
    expect(b.discovered).toBe(4);
    expect(b.deduplicated).toBe(4);
    expect(b.prepared).toBe(0);
    expect(b.published).toBe(0);
    expect(b.failed).toBe(0);
    expect(bot.calls).toBe(4);
    expect(candidateRepo.size()).toBe(4);
    expect(stage(b, 'PREPARE_PUBLICATION').reasonCodes['prepare.already_published']).toBe(4);

    const ready = await candidateRepo.listByStatus('PUBLICATION_READY', 10);
    for (const c of ready.items) {
      expect(c.revision).toBe(1);
      expect(await pubRepo.listByDealId(c.id, 10)).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Q. partial stage failure
// ---------------------------------------------------------------------------

describe('Q. partial stage failure', () => {
  it('upsert que falla para una identidad no afecta al resto', async () => {
    const inner = createInMemoryDealCandidateRepository();
    const poisoned = `amazon_mx:pid:${asin(2)}`;
    const candidateRepo: DealCandidateRepository & { size(): number } = {
      ...inner,
      async upsertAtomic(incoming) {
        if (incoming.identity.key === poisoned) throw new Error('db down');
        return inner.upsertAtomic(incoming);
      },
      size: () => inner.size(),
    };
    const { runner, bot } = harness({ items: amazonItems(3), candidateRepo });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.validated).toBe(3);
    expect(r.failed).toBe(1);
    expect(r.prepared).toBe(2);
    expect(r.published).toBe(2);
    expect(bot.calls).toBe(2);
    expect(inner.size()).toBe(2);
    expect(r.errors).toEqual([
      expect.objectContaining({ stage: 'DEDUPE', code: 'dedupe.upsert_exception', identityKey: poisoned }),
    ]);
  });

  it('fallo del outbox en PUBLISH no toca candidatos ni PREPARED', async () => {
    const innerPub = createInMemoryDealPublicationRepository();
    const pubRepo: DealPublicationRepository = {
      ...innerPub,
      async listDueForSend() {
        throw new Error('outbox unavailable');
      },
    };
    const { runner, candidateRepo, bot } = harness({ items: amazonItems(2), pubRepo });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.prepared).toBe(2);
    expect(r.published).toBe(0);
    expect(r.failed).toBe(1);
    expect(bot.calls).toBe(0);
    expect(candidateRepo.size()).toBe(2);
    expect(stage(r, 'PUBLISH').failedCount).toBe(1);
    expect(r.errors[0]).toMatchObject({ stage: 'PUBLISH', code: 'publish.stage_exception' });
    // Los PREPARED siguen ahí para el siguiente drain.
    expect(await innerPub.listDueForSend(10, NOW)).toHaveLength(2);
  });

  it('observer que lanza no rompe el ciclo', async () => {
    const candidateRepo = createInMemoryDealCandidateRepository();
    const runner = createCazaPipelineRunner({
      sources: [
        createStaticDiscoverySource({
          sourceId: 's',
          store: 'amazon_mx',
          items: amazonItems(1),
          clock: FIXED_CLOCK,
        }),
      ],
      candidateRepository: candidateRepo,
      publicationRepository: createInMemoryDealPublicationRepository(),
      bot: countingBot(),
      gate: GATE,
      telegramChannel: CHANNEL,
      affiliateResolver: testAffiliateResolver(),
      clock: FIXED_CLOCK,
      observer: {
        onStage() {
          throw new Error('observer boom');
        },
        onCycle() {
          throw new Error('observer boom');
        },
      },
    });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.published).toBe(1);
    expect(r.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// R. provider A failure / provider B success
// ---------------------------------------------------------------------------

describe('R. provider A failure / provider B success', () => {
  it('la fuente que lanza se aísla; la otra publica', async () => {
    const failing: DealDiscoverySource = {
      sourceId: 'store:amazon_mx',
      store: 'amazon_mx',
      async discover() {
        throw new Error('upstream 503 https://api.example/x?token=abc');
      },
    };
    const ok = createStaticDiscoverySource({
      sourceId: 'store:mercadolibre_mx',
      store: 'mercadolibre_mx',
      items: [mercadoLibreDraft()],
      clock: FIXED_CLOCK,
    });
    const { runner, bot } = harness({ sources: [failing, ok] });
    const r = await runner.runCycle({ mode: 'full' });

    expect(r.discovered).toBe(1);
    expect(r.published).toBe(1);
    expect(bot.calls).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.sources.map((s) => s.outcome)).toEqual(['failed', 'ok']);
    expect(r.errors).toEqual([
      expect.objectContaining({ stage: 'DISCOVER', sourceId: 'store:amazon_mx' }),
    ]);
    expect(r.errors[0].message).not.toContain('token=abc');
  });

  it('una fuente con CazaResult no-ok se reporta failed sin excepción', async () => {
    const failing: DealDiscoverySource = {
      sourceId: 'a',
      store: 'amazon_mx',
      async discover() {
        return { ok: false, reasons: ['discovery.upstream_unavailable'] };
      },
    };
    const { runner } = harness({ sources: [failing] });
    const r = await runner.runCycle({ mode: 'discovery' });
    expect(r.sources[0].outcome).toBe('failed');
    expect(r.errors[0].code).toBe('discovery.upstream_unavailable');
  });
});

// ---------------------------------------------------------------------------
// S. timeout budget
// ---------------------------------------------------------------------------

describe('S. timeout budget', () => {
  it('al agotarse MAX_EXECUTION_MS los stages restantes se saltan sin enviar', async () => {
    // Reloj que salta 60s a partir del quinto tick: discovery alcanza a correr,
    // el resto del ciclo ve el presupuesto agotado.
    let tick = 0;
    const clock: CazaClock = () => {
      tick += 1;
      return new Date(NOW.getTime() + (tick > 5 ? 60_000 : 0));
    };
    const { runner, bot } = harness({ items: amazonItems(10), clock });
    const r = await runner.runCycle({ mode: 'full', budgets: { MAX_EXECUTION_MS: 30_000 } });

    expect(r.budgetsExhausted).toContain('MAX_EXECUTION_MS');
    expect(r.published).toBe(0);
    expect(bot.calls).toBe(0);
    expect(r.errors).toEqual([]);
    expect(r.durationMs).toBeGreaterThanOrEqual(30_000);
    const skippedByTime = r.stages.reduce(
      (acc, s) => acc + (s.reasonCodes['budget.execution_ms_exhausted'] ?? 0),
      0
    );
    expect(skippedByTime).toBeGreaterThan(0);
  });

  it('reloj agotado desde el inicio → nada se procesa, nada se rompe', async () => {
    let tick = 0;
    const clock: CazaClock = () => {
      tick += 1;
      return new Date(NOW.getTime() + (tick > 1 ? 120_000 : 0));
    };
    const { runner, candidateRepo, bot } = harness({ items: amazonItems(3), clock });
    const r = await runner.runCycle({ mode: 'full', budgets: { MAX_EXECUTION_MS: 1_000 } });
    expect(r.discovered).toBe(0);
    expect(candidateRepo.size()).toBe(0);
    expect(bot.calls).toBe(0);
    expect(r.errors).toEqual([]);
    expect(r.budgetsExhausted).toEqual(['MAX_EXECUTION_MS']);
  });
});

// ---------------------------------------------------------------------------
// T. money-path isolation
// ---------------------------------------------------------------------------

const ORCHESTRATION_ROOT = path.resolve(__dirname, '../../lib/cazaOfertas/orchestration');
const ORCHESTRATION_FILES = fs
  .readdirSync(ORCHESTRATION_ROOT)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => path.join(ORCHESTRATION_ROOT, f));

describe('T. money-path isolation', () => {
  it('assertCazaOfertasMoneyUntouched pasa antes y después de un ciclo', async () => {
    expect(() => assertCazaOfertasMoneyUntouched()).not.toThrow();
    const { runner } = harness({ items: amazonItems(2) });
    await runner.runCycle({ mode: 'full' });
    expect(() => assertCazaOfertasMoneyUntouched()).not.toThrow();
  });

  it('orchestration no importa rewards/economy/commissions/payout/settlement ni revenue', () => {
    const forbidden = [
      'lib/rewards',
      'lib/economy',
      'lib/commissions',
      'lib/payout',
      'lib/settlement',
      'lib/finance',
      '/revenue/',
      '../revenue',
    ];
    const violations: string[] = [];
    for (const file of ORCHESTRATION_FILES) {
      const source = fs.readFileSync(file, 'utf8');
      for (const m of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const target = m[1];
        if (forbidden.some((f) => target.includes(f))) {
          violations.push(`${path.basename(file)} → ${target}`);
        }
        if (!target.startsWith('.')) violations.push(`${path.basename(file)} → external ${target}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('orchestration no menciona tablas ni conceptos del money path', () => {
    const banned = /creator_rewards|payout_intents|reward_payouts|settlement|createReward|createPayout/i;
    const offenders = ORCHESTRATION_FILES.filter((f) => banned.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('el resultado del ciclo no contiene claves de dinero y no toca HTTP de Telegram', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error('fetch must not be called by orchestrator');
    }) as typeof fetch;
    try {
      const { runner } = harness({ items: amazonItems(2) });
      const r = await runner.runCycle({ mode: 'full' });
      expect(r.published).toBe(2);
      expect(fetchCalls).toBe(0);
      const keys = Object.keys(r).join(',');
      expect(keys).not.toMatch(/revenue|reward|payout|commission|settlement/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('revenue no disponible no afecta la publicación (no es dependencia del runner)', async () => {
    // El runner no acepta ningún port de revenue: la elegibilidad de
    // publicación es independiente por construcción.
    const depsKeys: (keyof CazaPipelineRunnerDeps)[] = [
      'sources',
      'candidateRepository',
      'publicationRepository',
      'bot',
      'gate',
      'telegramChannel',
      'affiliateResolver',
      'observer',
      'clock',
      'runnerId',
    ];
    expect(depsKeys.join(',')).not.toMatch(/revenue|ledger/i);
    const { runner } = harness({ items: amazonItems(1) });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.published).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gate fail-closed / recovery / scheduling / observabilidad
// ---------------------------------------------------------------------------

describe('gate fail-closed', () => {
  it('gate null → candidatos persistidos, nada preparado ni enviado', async () => {
    const { runner, candidateRepo, bot } = harness({ items: amazonItems(2), gate: null });
    const r = await runner.runCycle({ mode: 'full' });
    expect(candidateRepo.size()).toBe(2);
    expect(r.affiliateEligible).toBe(2);
    expect(r.prepared).toBe(0);
    expect(r.published).toBe(0);
    expect(bot.calls).toBe(0);
    expect(stage(r, 'PREPARE_PUBLICATION').reasonCodes['publication.gate_unavailable']).toBe(2);
    expect(stage(r, 'PUBLISH').reasonCodes['publication.gate_unavailable']).toBe(1);
  });
});

describe('recovery cycle', () => {
  it('lease SENDING expirado → PREPARED y luego un único reenvío', async () => {
    const pubRepo = createInMemoryDealPublicationRepository();
    const seeded = harness({ items: amazonItems(1), pubRepo });
    await seeded.runner.runCycle({ mode: 'discovery' });
    const due = await pubRepo.listDueForSend(10, NOW);
    expect(due).toHaveLength(1);

    const claim = await pubRepo.claimForSend({
      publicationId: due[0].publicationId,
      leaseOwner: 'crashed_worker',
      leaseDurationMs: 1,
      now: NOW,
    });
    expect(claim.claimed).toBe(true);

    const later = new Date(NOW.getTime() + 5_000);
    const bot = countingBot();
    const { runner } = harness({ items: amazonItems(1), pubRepo, bot, clock: () => later });

    const recovery = await runRecoveryCycle(runner);
    expect(recovery.mode).toBe('recovery');
    expect(recovery.recovered).toBe(1);
    expect(recovery.stages.map((s) => s.stage)).toEqual(['RECOVER']);
    expect((await pubRepo.findByIdentityKey(due[0].publicationId))?.status).toBe('PREPARED');

    const drain = await runPublicationDrain(runner);
    expect(drain.mode).toBe('publication_drain');
    expect(drain.published).toBe(1);
    expect(bot.calls).toBe(1);
    expect(drain.stages.map((s) => s.stage)).toEqual(['RECOVER', 'PUBLISH']);
  });
});

describe('scheduling contract (sin cron productivo)', () => {
  it('producción desactivada y vercel.json sin cron de CazaOfertasss', () => {
    expect(CAZAOFERTAS_SCHEDULING_BOUNDARY.productionCronEnabled).toBe(false);
    expect(CAZAOFERTAS_SCHEDULING_BOUNDARY.vercelCronConfigured).toBe(false);
    expect(() => assertProductionCronDisabled()).not.toThrow();
    const vercel = fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8');
    expect(vercel).not.toMatch(/caza/i);
  });

  it('intervalos configurables por env, recortados a [min, max]', () => {
    const d = CAZA_SCHEDULE_CONTRACTS.discovery;
    expect(resolveScheduleIntervalMs('discovery', {})).toBe(d.defaultIntervalMs);
    expect(resolveScheduleIntervalMs('discovery', { [d.intervalEnvVar]: '1' })).toBe(d.minIntervalMs);
    expect(
      resolveScheduleIntervalMs('discovery', { [d.intervalEnvVar]: '999999999999' })
    ).toBe(d.maxIntervalMs);
    expect(resolveScheduleIntervalMs('discovery', { [d.intervalEnvVar]: 'abc' })).toBe(
      d.defaultIntervalMs
    );
    expect(resolveScheduleIntervalMs('publication_drain', { CAZAOFERTAS_PUBLICATION_INTERVAL_MS: '120000' })).toBe(120_000);
    expect(resolveScheduleIntervalMs('recovery', {})).toBe(
      CAZA_SCHEDULE_CONTRACTS.recovery.defaultIntervalMs
    );
  });

  it('runDiscoveryCycle no envía; runPublicationDrain no descubre', async () => {
    const { runner, bot, candidateRepo } = harness({ items: amazonItems(2) });
    const discovery = await runDiscoveryCycle(runner, { since: NOW_ISO });
    expect(discovery.mode).toBe('discovery');
    expect(discovery.prepared).toBe(2);
    expect(discovery.published).toBe(0);
    expect(bot.calls).toBe(0);
    expect(discovery.stages.some((s) => s.stage === 'PUBLISH')).toBe(false);

    const drain = await runPublicationDrain(runner);
    expect(drain.discovered).toBe(0);
    expect(drain.published).toBe(2);
    expect(bot.calls).toBe(2);
    expect(candidateRepo.size()).toBe(2);
  });

  it('todos los stages declarados están cubiertos por algún modo', async () => {
    const { runner } = harness({ items: amazonItems(1) });
    const r = await runner.runCycle({ mode: 'full' });
    expect([...r.stages.map((s) => s.stage)].sort()).toEqual([...CAZA_PIPELINE_STAGES].sort());
  });
});

describe('observabilidad', () => {
  it('cada stage reporta cycleId, duración y conteos coherentes', async () => {
    const stages: CazaStageReport[] = [];
    const { runner } = harness({ items: amazonItems(3), stages });
    const r = await runner.runCycle({ mode: 'full', cycleId: 'cycle_obs' });
    expect(stages).toHaveLength(r.stages.length);
    for (const s of r.stages) {
      expect(s.cycleId).toBe('cycle_obs');
      expect(s.durationMs).toBeGreaterThanOrEqual(0);
      expect(s.inputCount).toBeGreaterThanOrEqual(0);
      expect(
        s.successCount + s.rejectedCount + s.failedCount + s.skippedCount
      ).toBeGreaterThanOrEqual(0);
    }
    expect(stage(r, 'DISCOVER').successCount).toBe(3);
    expect(stage(r, 'PUBLISH').successCount).toBe(3);
    expect(r.finishedAt).toBe(NOW_ISO);
    expectNoSensitive(r);
  });

  it('redacción: tokens, JWT, query strings y service_role nunca salen', () => {
    const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop';
    const msg = `boom ${token} ${jwt} https://amazon.com.mx/dp/X?tag=caza-20 service_role=xyz`;
    const out = redactForObservability(msg);
    expect(out).not.toContain(token);
    expect(out).not.toContain(jwt);
    expect(out).not.toContain('tag=caza-20');
    expect(out).not.toMatch(/service_role/);
    expect(out).toContain('[redacted_token]');
    expect(out).toContain('[redacted_jwt]');
    expect(out).toContain('[redacted_query]');
  });

  it('cycleId inválido se reemplaza por uno derivado y determinista', async () => {
    const { runner } = harness({ items: [] });
    const a = await runner.runCycle({ mode: 'discovery', cycleId: 'x y' });
    const b = await runner.runCycle({ mode: 'discovery', cycleId: '' });
    expect(a.cycleId).toMatch(/^caza_cycle_discovery_[0-9a-f]{8}$/);
    expect(a.cycleId).toBe(b.cycleId);
  });
});

describe('preparePublication sigue siendo la autoridad de idempotencia', () => {
  it('un PREPARED creado fuera del runner no se duplica ni se re-prepara', async () => {
    const pubRepo = createInMemoryDealPublicationRepository();
    const candidateRepo = createInMemoryDealCandidateRepository();
    const { runner } = harness({ items: amazonItems(1), pubRepo, candidateRepo });
    const first = await runner.runCycle({ mode: 'discovery' });
    expect(first.prepared).toBe(1);
    const ready = await candidateRepo.listByStatus('PUBLICATION_READY', 10);
    const again = await preparePublication(pubRepo, {
      candidate: ready.items[0],
      telegramChannel: CHANNEL,
      now: NOW,
      gate: GATE,
    });
    expect(again.outcome).toBe('already_prepared');
    expect(await pubRepo.listByDealId(ready.items[0].id, 10)).toHaveLength(1);
  });
});
