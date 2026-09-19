/**
 * CazaOfertasss — FASE 2. Outbox de publicación Telegram.
 *
 * Cubre: eligibility, prepare idempotent, claim concurrente ×10/100,
 * replay, 429, 5xx, timeout/unknown, crash PREPARED→PUBLISHED, canary gate,
 * money boundary.
 */

import { describe, expect, it } from 'vitest';

import {
  CAZAOFERTAS_PUBLICATION_BOUNDARY,
  assertCazaOfertasMoneyUntouched,
  assertPublicationDisabled,
  buildDealCandidate,
  createCazaTelegramBotAdapter,
  createInMemoryDealPublicationRepository,
  drainPublicationOutbox,
  evaluatePublicationEligibility,
  preparePublication,
  processPublication,
  resolveTelegramCanaryGate,
  type CazaTelegramBotPort,
  type CazaTelegramSendResult,
  type DealCandidate,
  type TelegramCanaryGate,
} from '@/lib/cazaOfertas';

import {
  NOW,
  NOW_ISO,
  amazonAffiliate,
  amazonDraft,
  mercadoLibreDraft,
  pageClaimEvidence,
  strongEvidence,
} from './fixtures';

const CANARY_CHANNEL = '@cazaofertasss';

const GATE: TelegramCanaryGate = {
  mode: 'canary',
  allowedChannels: [CANARY_CHANNEL],
  credentialEnvVar: 'CAZAOFERTAS_TELEGRAM_BOT_TOKEN',
};

function monetizableCandidate(overrides: Parameters<typeof amazonDraft>[0] = {}): DealCandidate {
  const r = buildDealCandidate(amazonDraft(overrides), {
    now: NOW,
    affiliate: amazonAffiliate(),
  });
  if (!r.ok) throw new Error(r.reasons.join(','));
  return r.value;
}

function successBot(messageId = '9001'): CazaTelegramBotPort {
  return {
    async sendMessage(input) {
      return { ok: true, messageId, chatId: input.chatId };
    },
  };
}

function resultBot(result: CazaTelegramSendResult): CazaTelegramBotPort {
  return {
    async sendMessage() {
      return result;
    },
  };
}

function countingBot(): CazaTelegramBotPort & { calls: number; lastText: string | null } {
  const state = { calls: 0, lastText: null as string | null };
  return {
    get calls() {
      return state.calls;
    },
    get lastText() {
      return state.lastText;
    },
    async sendMessage(input) {
      state.calls += 1;
      state.lastText = input.text;
      return { ok: true, messageId: String(1000 + state.calls), chatId: input.chatId };
    },
  };
}

describe('frontera de publicación FASE 2', () => {
  it('producción permanece apagada; canary path existe', () => {
    expect(CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramPublishEnabled).toBe(false);
    expect(CAZAOFERTAS_PUBLICATION_BOUNDARY.autoPublishEnabled).toBe(false);
    expect(CAZAOFERTAS_PUBLICATION_BOUNDARY.canaryPathExists).toBe(true);
    expect(() => assertPublicationDisabled()).not.toThrow();
    expect(() => assertCazaOfertasMoneyUntouched()).not.toThrow();
  });

  it('canary gate fail-closed sin env', () => {
    const r = resolveTelegramCanaryGate({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('canary.env_disabled');
  });

  it('canary gate exige allowlist y token presente', () => {
    const r = resolveTelegramCanaryGate({
      CAZAOFERTAS_TELEGRAM_CANARY: '1',
      CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS: CANARY_CHANNEL,
      CAZAOFERTAS_TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
    });
    expect(r.ok).toBe(true);
  });
});

describe('eligibility', () => {
  it('acepta PUBLICATION_READY monetizable', () => {
    const e = evaluatePublicationEligibility(monetizableCandidate());
    expect(e.eligible).toBe(true);
    expect(e.card?.ctaUrl).toContain('tag=cazaofertasss-20');
  });

  it('rechaza no monetizable y REJECT', () => {
    const noAff = buildDealCandidate(mercadoLibreDraft(), { now: NOW, affiliate: null });
    expect(noAff.ok).toBe(true);
    if (!noAff.ok) return;
    expect(evaluatePublicationEligibility(noAff.value).eligible).toBe(false);

    const rejected = buildDealCandidate(amazonDraft({ evidence: pageClaimEvidence() }), {
      now: NOW,
      affiliate: amazonAffiliate(),
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(evaluatePublicationEligibility(rejected.value).eligible).toBe(false);
  });
});

describe('preparePublication', () => {
  it('inserta PREPARED con affiliate URL del dominio y revision', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });
    expect(prepared.outcome).toBe('prepared');
    expect(prepared.record?.status).toBe('PREPARED');
    expect(prepared.record?.affiliateUrl).toBe(candidate.affiliateUrl);
    expect(prepared.record?.publishedRevision).toBe(candidate.revision);
    expect(prepared.record?.telegramMessageId).toBeNull();
  });

  it('replay prepare es idempotente', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    const a = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });
    const b = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });
    expect(a.outcome).toBe('prepared');
    expect(b.outcome).toBe('already_prepared');
    expect(a.record?.publicationId).toBe(b.record?.publicationId);
    expect(await repo.listByDealId(candidate.id, 10)).toHaveLength(1);
  });

  it('rechaza canal fuera del allowlist canary', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const r = await preparePublication(repo, {
      candidate: monetizableCandidate(),
      telegramChannel: '@otro_canal',
      now: NOW,
      gate: GATE,
    });
    expect(r.outcome).toBe('rejected');
  });

  it('nunca prepara candidato no publicable', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const rejected = buildDealCandidate(
      amazonDraft({
        currentPrice: 1999,
        evidence: strongEvidence({
          currentPrice: 1999,
          referencePrice: null,
          historicalConfidence: 'none',
        }),
        referencePrice: null,
      }),
      { now: NOW, affiliate: amazonAffiliate() }
    );
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    const r = await preparePublication(repo, {
      candidate: rejected.value,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });
    expect(r.outcome).toBe('rejected');
  });
});

describe('processPublication — happy path + replay', () => {
  it('PREPARED → PUBLISHED con message_id y published_revision', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });
    expect(prepared.record).not.toBeNull();

    const result = await processPublication({
      publicationId: prepared.record!.publicationId,
      repository: repo,
      bot: successBot('424242'),
      gate: GATE,
      leaseOwner: 'worker_a',
      now: NOW,
    });

    expect(result.outcome).toBe('published');
    expect(result.record?.status).toBe('PUBLISHED');
    expect(result.record?.telegramMessageId).toBe('424242');
    expect(result.record?.publishedAt).toBe(NOW_ISO);
    expect(result.record?.publishedRevision).toBe(candidate.revision);
    expect(result.record?.affiliateUrl).toBe(candidate.affiliateUrl);
  });

  it('replay sobre PUBLISHED no reenvía', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    const bot = countingBot();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });

    const first = await processPublication({
      publicationId: prepared.record!.publicationId,
      repository: repo,
      bot,
      gate: GATE,
      leaseOwner: 'worker_a',
      now: NOW,
    });
    expect(first.outcome).toBe('published');

    const second = await processPublication({
      publicationId: prepared.record!.publicationId,
      repository: repo,
      bot,
      gate: GATE,
      leaseOwner: 'worker_b',
      now: NOW,
    });
    expect(second.outcome).toBe('already_published');
    expect(bot.calls).toBe(1);
  });

  it('el texto enviado contiene la affiliate URL del dominio', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    const bot = countingBot();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });
    await processPublication({
      publicationId: prepared.record!.publicationId,
      repository: repo,
      bot,
      gate: GATE,
      leaseOwner: 'worker_a',
      now: NOW,
    });
    expect(bot.lastText).toContain(candidate.affiliateUrl!);
  });
});

describe('concurrencia claim ×10 y ×100', () => {
  async function concurrentPublish(workers: number) {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    const bot = countingBot();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });
    const publicationId = prepared.record!.publicationId;

    const results = await Promise.all(
      Array.from({ length: workers }, (_, i) =>
        processPublication({
          publicationId,
          repository: repo,
          bot,
          gate: GATE,
          leaseOwner: `worker_${i}`,
          now: NOW,
        })
      )
    );

    const published = results.filter((r) => r.outcome === 'published');
    const skipped = results.filter((r) => r.outcome === 'skipped_not_claimed');
    const already = results.filter((r) => r.outcome === 'already_published');

    expect(published.length + already.length).toBeGreaterThanOrEqual(1);
    expect(published.length).toBeLessThanOrEqual(1);
    expect(bot.calls).toBe(1);
    expect(await repo.listByDealId(candidate.id, 10)).toHaveLength(1);

    const final = await repo.findByIdentityKey(publicationId);
    expect(final?.status).toBe('PUBLISHED');
    expect(final?.telegramMessageId).toBeTruthy();
    expect(skipped.length + already.length + published.length).toBe(workers);

    return { results, bot, final };
  }

  it('10 writers concurrentes → 1 solo envío Telegram', async () => {
    await concurrentPublish(10);
  });

  it('100 writers concurrentes → 1 solo envío Telegram', async () => {
    await concurrentPublish(100);
  });
});

describe('errores Telegram: 429, 5xx, timeout', () => {
  async function prepareOne() {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });
    return { repo, candidate, publicationId: prepared.record!.publicationId };
  }

  it('429 rate limit → retry_scheduled con next_attempt_at', async () => {
    const { repo, publicationId } = await prepareOne();
    const result = await processPublication({
      publicationId,
      repository: repo,
      bot: resultBot({
        ok: false,
        retryable: true,
        unknownOutcome: false,
        code: 'telegram_rate_limited',
        message: 'Too Many Requests',
        retryAfterSeconds: 30,
        httpStatus: 429,
      }),
      gate: GATE,
      leaseOwner: 'worker_a',
      now: NOW,
    });
    expect(result.outcome).toBe('retry_scheduled');
    expect(result.record?.status).toBe('PREPARED');
    expect(result.record?.nextAttemptAt).not.toBeNull();
    expect(result.record?.lastErrorCode).toBe('telegram_rate_limited');
    expect(result.record?.attemptCount).toBe(1);
  });

  it('5xx → retry_scheduled', async () => {
    const { repo, publicationId } = await prepareOne();
    const result = await processPublication({
      publicationId,
      repository: repo,
      bot: resultBot({
        ok: false,
        retryable: true,
        unknownOutcome: false,
        code: 'telegram_server_error',
        message: 'Internal Server Error',
        retryAfterSeconds: null,
        httpStatus: 500,
      }),
      gate: GATE,
      leaseOwner: 'worker_a',
      now: NOW,
    });
    expect(result.outcome).toBe('retry_scheduled');
    expect(result.record?.status).toBe('PREPARED');
  });

  it('timeout / unknownOutcome → FAILED terminal (no auto-retry)', async () => {
    const { repo, publicationId } = await prepareOne();
    const result = await processPublication({
      publicationId,
      repository: repo,
      bot: resultBot({
        ok: false,
        retryable: false,
        unknownOutcome: true,
        code: 'telegram_network_or_timeout',
        message: 'AbortError: timeout',
        retryAfterSeconds: null,
        httpStatus: null,
      }),
      gate: GATE,
      leaseOwner: 'worker_a',
      now: NOW,
    });
    expect(result.outcome).toBe('failed');
    expect(result.record?.status).toBe('FAILED');
    expect(result.record?.lastErrorCode).toBe('telegram_network_or_timeout');

    // Replay no reenvía.
    const bot = countingBot();
    const replay = await processPublication({
      publicationId,
      repository: repo,
      bot,
      gate: GATE,
      leaseOwner: 'worker_b',
      now: NOW,
    });
    expect(replay.outcome).toBe('failed');
    expect(bot.calls).toBe(0);
  });

  it('adapter real clasifica 429 y 5xx vía fetch mock', async () => {
    const adapter429 = createCazaTelegramBotAdapter({
      env: {
        CAZAOFERTAS_TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            ok: false,
            description: 'Too Many Requests: retry after 12',
            parameters: { retry_after: 12 },
          }),
          { status: 429 }
        ),
    });
    const r429 = await adapter429.sendMessage({
      chatId: CANARY_CHANNEL,
      text: 'hola',
      publicationId: 'caza_x',
    });
    expect(r429.ok).toBe(false);
    if (r429.ok) return;
    expect(r429.retryable).toBe(true);
    expect(r429.code).toBe('telegram_rate_limited');
    expect(r429.retryAfterSeconds).toBe(12);

    const adapter5xx = createCazaTelegramBotAdapter({
      env: {
        CAZAOFERTAS_TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
      },
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: false, description: 'Internal' }), { status: 503 }),
    });
    const r5 = await adapter5xx.sendMessage({
      chatId: CANARY_CHANNEL,
      text: 'hola',
      publicationId: 'caza_x',
    });
    expect(r5.ok).toBe(false);
    if (r5.ok) return;
    expect(r5.retryable).toBe(true);
    expect(r5.code).toBe('telegram_server_error');
  });

  it('adapter marca timeout como unknownOutcome', async () => {
    const adapter = createCazaTelegramBotAdapter({
      env: {
        CAZAOFERTAS_TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
      },
      timeoutMs: 5,
      fetchImpl: async () => {
        throw new Error('The operation was aborted due to timeout');
      },
    });
    const r = await adapter.sendMessage({
      chatId: CANARY_CHANNEL,
      text: 'hola',
      publicationId: 'caza_x',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.unknownOutcome).toBe(true);
    expect(r.code).toBe('telegram_network_or_timeout');
    expect(r.message).not.toContain('123456789:');
  });
});

describe('crash recovery entre PREPARED y PUBLISHED', () => {
  it('lease SENDING expirado sin message_id → recover PREPARED → reenvío único', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });
    const publicationId = prepared.record!.publicationId;

    // Claim y "crash" antes de send: dejamos SENDING con lease corto.
    const claimNow = NOW;
    const claim = await repo.claimForSend({
      publicationId,
      leaseOwner: 'worker_crash',
      leaseDurationMs: 1,
      now: claimNow,
    });
    expect(claim.claimed).toBe(true);
    expect(claim.record?.status).toBe('SENDING');

    const afterLease = new Date(claimNow.getTime() + 5_000);
    const recovered = await repo.recoverExpiredLeases(afterLease, 10);
    expect(recovered).toBe(1);

    const afterRecover = await repo.findByIdentityKey(publicationId);
    expect(afterRecover?.status).toBe('PREPARED');
    expect(afterRecover?.leaseOwner).toBeNull();

    const bot = countingBot();
    const result = await processPublication({
      publicationId,
      repository: repo,
      bot,
      gate: GATE,
      leaseOwner: 'worker_recover',
      now: afterLease,
    });
    expect(result.outcome).toBe('published');
    expect(bot.calls).toBe(1);
  });

  it('drain recupera leases y procesa due', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });

    const bot = countingBot();
    const drain = await drainPublicationOutbox({
      repository: repo,
      bot,
      gate: GATE,
      leaseOwner: 'drain_worker',
      now: NOW,
      limit: 10,
      
    });

    expect(drain.processed.some((p) => p.outcome === 'published')).toBe(true);
    expect(bot.calls).toBe(1);
  });
});

describe('max attempts → FAILED', () => {
  it('agota reintentos y termina FAILED', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableCandidate();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: CANARY_CHANNEL,
      now: NOW,
      gate: GATE,
    });

    // Forzar max_attempts bajo.
    const low = {
      ...prepared.record!,
      maxAttempts: 2,
    };
    await repo.save(low);

    const retryBot = resultBot({
      ok: false,
      retryable: true,
      unknownOutcome: false,
      code: 'telegram_server_error',
      message: 'boom',
      retryAfterSeconds: null,
      httpStatus: 500,
    });

    const first = await processPublication({
      publicationId: low.publicationId,
      repository: repo,
      bot: retryBot,
      gate: GATE,
      leaseOwner: 'w1',
      now: NOW,
    });
    expect(first.outcome).toBe('retry_scheduled');

    // Avanzar el reloj para que esté due.
    const later = new Date(Date.parse(first.record!.nextAttemptAt!) + 1);
    const second = await processPublication({
      publicationId: low.publicationId,
      repository: repo,
      bot: retryBot,
      gate: GATE,
      leaseOwner: 'w2',
      now: later,
    });
    expect(second.outcome).toBe('failed');
    expect(second.record?.status).toBe('FAILED');
    expect(second.record?.lastErrorCode).toBe('publication.max_attempts');
  });
});
