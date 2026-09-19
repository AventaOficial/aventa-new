/**
 * CazaOfertasss — FASE 2.1. Contratos de card snapshot inmutable.
 */

import { describe, expect, it } from 'vitest';

import {
  assertCardSnapshotImmutable,
  buildTelegramCardSnapshot,
  cardSnapshotsEqual,
  createInMemoryDealPublicationRepository,
  generateTelegramCard,
  preparePublication,
  processPublication,
  publicationIdentityKey,
  redactTelegramSecrets,
  resolveTelegramCanaryGate,
  type TelegramCanaryGate,
} from '@/lib/cazaOfertas';

import {
  NOW,
  monetizableAmazonCandidate,
  publicationInputWithSnapshot,
  buildTestPublicationRecord,
} from './fixtures';

const GATE: TelegramCanaryGate = {
  mode: 'canary',
  allowedChannels: ['@cazaofertasss', '-1004307422597'],
  credentialEnvVar: 'CAZAOFERTAS_TELEGRAM_BOT_TOKEN',
};

describe('card snapshot determinista', () => {
  it('mismas entradas ⇒ mismo snapshot', () => {
    const candidate = monetizableAmazonCandidate();
    const card = generateTelegramCard(candidate);
    expect(card.ok).toBe(true);
    if (!card.ok) return;
    const publicationId = publicationIdentityKey({
      dealId: candidate.id,
      affiliateNetwork: candidate.affiliate!.affiliateNetwork,
      telegramChannel: '@cazaofertasss',
      trackingLabel: candidate.affiliate!.affiliateTrackingLabel,
    });
    const a = buildTelegramCardSnapshot({
      publicationId,
      candidate,
      card: card.value,
      generatedAt: NOW.toISOString(),
    });
    const b = buildTelegramCardSnapshot({
      publicationId,
      candidate,
      card: card.value,
      generatedAt: NOW.toISOString(),
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(cardSnapshotsEqual(a.value, b.value)).toBe(true);
  });

  it('rechaza texto sin affiliate URL', () => {
    const candidate = monetizableAmazonCandidate();
    const card = generateTelegramCard(candidate);
    if (!card.ok) throw new Error('card');
    const publicationId = publicationIdentityKey({
      dealId: candidate.id,
      affiliateNetwork: candidate.affiliate!.affiliateNetwork,
      telegramChannel: '@cazaofertasss',
      trackingLabel: candidate.affiliate!.affiliateTrackingLabel,
    });
    const r = buildTelegramCardSnapshot({
      publicationId,
      candidate,
      card: { ...card.value, text: 'sin link' },
      generatedAt: NOW.toISOString(),
    });
    expect(r.ok).toBe(false);
  });
});

describe('snapshot inmutable', () => {
  it('prepare congela snapshot; save posterior no lo altera', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableAmazonCandidate();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: '@cazaofertasss',
      now: NOW,
      gate: GATE,
    });
    expect(prepared.outcome).toBe('prepared');
    const snap = prepared.record!.cardSnapshot;

    await repo.save({
      ...prepared.record!,
      cardSnapshot: {
        ...snap,
        text: 'TEXTO MUTADO ILLEGAL',
      },
    });
    const after = await repo.findByIdentityKey(prepared.record!.publicationId);
    expect(after?.cardSnapshot.text).toBe(snap.text);
    expect(after?.cardSnapshot.text).not.toContain('MUTADO');
  });

  it('assertCardSnapshotImmutable detecta mutación', () => {
    const input = publicationInputWithSnapshot();
    const a = input.cardSnapshot;
    const b = { ...a, text: a.text + ' x' };
    const r = assertCardSnapshotImmutable(a, b);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('snapshot.immutable_violation');
  });

  it('process usa snapshot, no regenera tarjeta', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const candidate = monetizableAmazonCandidate();
    const prepared = await preparePublication(repo, {
      candidate,
      telegramChannel: '@cazaofertasss',
      now: NOW,
      gate: GATE,
    });
    const expectedText = prepared.record!.cardSnapshot.text;
    let sentText: string | null = null;
    const realBot = {
      async sendMessage(input: {
        text: string;
        chatId: string;
        publicationId: string;
      }) {
        sentText = input.text;
        return { ok: true as const, messageId: '77', chatId: input.chatId };
      },
    };

    await processPublication({
      publicationId: prepared.record!.publicationId,
      repository: repo,
      bot: realBot,
      gate: GATE,
      leaseOwner: 'snap_worker',
      now: NOW,
    });
    expect(sentText).toBe(expectedText);
  });
});

describe('stale revision / missing affiliate', () => {
  it('buildPublicationRecord rechaza snapshot con revision distinta', () => {
    const input = publicationInputWithSnapshot();
    const r = buildTestPublicationRecord({
      ...input,
      publishedRevision: input.publishedRevision + 1,
    });
    expect(r.ok).toBe(false);
  });

  it('buildPublicationRecord rechaza affiliate mismatch en snapshot', () => {
    const input = publicationInputWithSnapshot();
    const r = buildTestPublicationRecord({
      ...input,
      affiliateUrl: 'https://www.amazon.com.mx/dp/B08N5WRWNW?tag=other-20',
    });
    expect(r.ok).toBe(false);
  });
});

describe('allowlist / missing token', () => {
  it('prepare rechaza canal no allowlisted', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const r = await preparePublication(repo, {
      candidate: monetizableAmazonCandidate(),
      telegramChannel: '@not_allowed_channel',
      now: NOW,
      gate: GATE,
    });
    expect(r.outcome).toBe('rejected');
  });

  it('gate fail-closed sin token', () => {
    const r = resolveTelegramCanaryGate({
      CAZAOFERTAS_TELEGRAM_CANARY: '1',
      CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS: '@cazaofertasss',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('canary.bot_token_missing');
  });

  it('redacta token en strings de evidencia', () => {
    const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
    const raw = `POST https://api.telegram.org/bot${token}/sendMessage failed`;
    const redacted = redactTelegramSecrets(raw, token);
    expect(redacted).not.toContain(token);
    expect(redacted).toContain('[REDACTED_TELEGRAM_TOKEN]');
  });
});
