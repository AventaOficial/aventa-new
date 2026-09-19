/**
 * CazaOfertasss — Outbox de publicación Telegram.
 *
 * Flujo:
 *   DealCandidate → eligibility → PREPARED + cardSnapshot inmutable
 *                → claim SENDING → Telegram adapter → PUBLISHED | retry | FAILED
 *
 * El envío usa `cardSnapshot.text`, nunca regenera la tarjeta.
 */

import { PUBLICATION_DRAIN_MAX_BATCH, PUBLICATION_LEASE_MS } from '../constants';
import { assertCazaOfertasMoneyUntouched } from '../safety';
import type { CazaTelegramBotPort } from '../telegram/botPort';
import {
  assertChannelAllowedByCanary,
  resolveTelegramCanaryGate,
  type TelegramCanaryGate,
} from '../telegram/canary';
import type { TelegramDealCard } from '../telegram/card';
import {
  buildPublicationRecord,
  computePublicationBackoffMs,
  markPublicationFailed,
  markPublicationPublished,
  publicationIdentityKey,
  schedulePublicationRetry,
  type DealPublicationRecord,
  type DealPublicationRepository,
} from '../tracking/publication';
import type { CazaResult, DealCandidate, IsoTimestamp } from '../types';
import { okResult } from '../types';
import { buildTelegramCardSnapshot } from './cardSnapshot';
import { assertPublishableCandidate } from './eligibility';

export type PublicationProcessOutcome =
  | 'prepared'
  | 'already_prepared'
  | 'published'
  | 'already_published'
  | 'retry_scheduled'
  | 'failed'
  | 'skipped_not_claimed'
  | 'skipped_gate'
  | 'skipped_not_due';

export interface PreparePublicationInput {
  readonly candidate: DealCandidate;
  readonly telegramChannel: string;
  readonly now: Date;
  readonly gate: TelegramCanaryGate;
}

export interface PreparePublicationResult {
  readonly outcome: 'prepared' | 'already_prepared' | 'already_published' | 'rejected';
  readonly record: DealPublicationRecord | null;
  readonly card: TelegramDealCard | null;
  readonly reasons: readonly string[];
}

export interface ProcessPublicationInput {
  readonly publicationId: string;
  readonly repository: DealPublicationRepository;
  readonly bot: CazaTelegramBotPort;
  readonly gate: TelegramCanaryGate;
  readonly leaseOwner: string;
  readonly now: Date;
  readonly leaseDurationMs?: number;
}

export interface ProcessPublicationResult {
  readonly outcome: PublicationProcessOutcome;
  readonly record: DealPublicationRecord | null;
  readonly reasons: readonly string[];
}

export interface DrainOutboxInput {
  readonly repository: DealPublicationRepository;
  readonly bot: CazaTelegramBotPort;
  readonly gate: TelegramCanaryGate;
  readonly leaseOwner: string;
  readonly now: Date;
  readonly limit?: number;
}

function stableLeaseOwner(seed: string): string {
  const cleaned = seed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return cleaned.length >= 4 ? cleaned : `worker_${Date.now()}`;
}

/**
 * Prepara (idempotente) un registro PREPARED con snapshot inmutable. No envía.
 */
export async function preparePublication(
  repository: DealPublicationRepository,
  input: PreparePublicationInput
): Promise<PreparePublicationResult> {
  assertCazaOfertasMoneyUntouched();

  const channelOk = assertChannelAllowedByCanary(input.gate, input.telegramChannel);
  if (!channelOk.ok) {
    return { outcome: 'rejected', record: null, card: null, reasons: channelOk.reasons };
  }

  const eligible = assertPublishableCandidate(input.candidate);
  if (!eligible.ok) {
    return { outcome: 'rejected', record: null, card: null, reasons: eligible.reasons };
  }

  const { candidate, card } = eligible.value;
  const affiliate = candidate.affiliate;
  if (!affiliate || !candidate.affiliateUrl) {
    return {
      outcome: 'rejected',
      record: null,
      card: null,
      reasons: ['prepare.not_monetizable'],
    };
  }

  if (card.ctaUrl !== candidate.affiliateUrl) {
    return {
      outcome: 'rejected',
      record: null,
      card: null,
      reasons: ['prepare.cta_not_domain_affiliate_url'],
    };
  }

  const preparedAt = input.now.toISOString();
  const publicationId = publicationIdentityKey({
    dealId: candidate.id,
    affiliateNetwork: affiliate.affiliateNetwork,
    telegramChannel: input.telegramChannel,
    trackingLabel: affiliate.affiliateTrackingLabel,
  });

  const snapshot = buildTelegramCardSnapshot({
    publicationId,
    candidate,
    card,
    generatedAt: preparedAt,
  });
  if (!snapshot.ok) {
    return { outcome: 'rejected', record: null, card: null, reasons: snapshot.reasons };
  }

  const built = buildPublicationRecord({
    dealId: candidate.id,
    store: candidate.store,
    affiliateNetwork: affiliate.affiliateNetwork,
    trackingLabel: affiliate.affiliateTrackingLabel,
    telegramChannel: input.telegramChannel,
    preparedAt,
    affiliateUrl: candidate.affiliateUrl,
    publishedRevision: candidate.revision,
    cardSnapshot: snapshot.value,
  });
  if (!built.ok) {
    return { outcome: 'rejected', record: null, card: null, reasons: built.reasons };
  }

  const existing = await repository.findByIdentityKey(built.value.publicationId);
  if (existing?.status === 'PUBLISHED') {
    return {
      outcome: 'already_published',
      record: existing,
      card,
      reasons: ['prepare.already_published'],
    };
  }

  const saved = await repository.saveIdempotent(built.value);
  return {
    outcome: saved.inserted ? 'prepared' : 'already_prepared',
    record: saved.record,
    card,
    reasons: saved.inserted ? ['prepare.inserted'] : ['prepare.idempotent_hit'],
  };
}

/**
 * Procesa una publicación: claim → send(snapshot) → persist outcome.
 */
export async function processPublication(
  input: ProcessPublicationInput
): Promise<ProcessPublicationResult> {
  assertCazaOfertasMoneyUntouched();

  const existing = await input.repository.findByIdentityKey(input.publicationId);
  if (!existing) {
    return { outcome: 'skipped_not_due', record: null, reasons: ['process.not_found'] };
  }
  if (existing.status === 'PUBLISHED') {
    return {
      outcome: 'already_published',
      record: existing,
      reasons: ['process.already_published'],
    };
  }
  if (existing.status === 'FAILED' || existing.status === 'RETRACTED') {
    return {
      outcome: 'failed',
      record: existing,
      reasons: [`process.terminal:${existing.status}`],
    };
  }

  const channelOk = assertChannelAllowedByCanary(input.gate, existing.telegramChannel);
  if (!channelOk.ok) {
    return { outcome: 'skipped_gate', record: existing, reasons: channelOk.reasons };
  }

  if (!existing.cardSnapshot?.text) {
    const failed = markPublicationFailed(
      existing,
      'publication.card_snapshot_missing',
      'card snapshot missing at send time',
      input.now.toISOString()
    );
    if (failed.ok) await input.repository.save(failed.value);
    return {
      outcome: 'failed',
      record: failed.ok ? failed.value : existing,
      reasons: ['process.card_snapshot_missing'],
    };
  }

  // Stale revision guard: snapshot revision must match publishedRevision frozen at prepare.
  if (
    existing.publishedRevision !== null &&
    existing.cardSnapshot.candidateRevision !== existing.publishedRevision
  ) {
    const failed = markPublicationFailed(
      existing,
      'publication.stale_revision',
      'snapshot revision mismatch vs published_revision',
      input.now.toISOString()
    );
    if (failed.ok) await input.repository.save(failed.value);
    return {
      outcome: 'failed',
      record: failed.ok ? failed.value : existing,
      reasons: ['process.stale_revision'],
    };
  }

  const claim = await input.repository.claimForSend({
    publicationId: input.publicationId,
    leaseOwner: stableLeaseOwner(input.leaseOwner),
    leaseDurationMs: input.leaseDurationMs ?? PUBLICATION_LEASE_MS,
    now: input.now,
  });

  if (!claim.claimed || !claim.record) {
    if (claim.reason === 'already_published') {
      return {
        outcome: 'already_published',
        record: claim.record,
        reasons: ['process.claim_lost_already_published'],
      };
    }
    return {
      outcome: 'skipped_not_claimed',
      record: claim.record,
      reasons: [claim.reason ?? 'process.not_claimed'],
    };
  }

  const claimed = claim.record;
  // Preservar snapshot del claim (inmutable).
  const snapshot = claimed.cardSnapshot;
  const affiliateUrl = snapshot.affiliateUrl;

  if (!affiliateUrl || !/^https:\/\//.test(affiliateUrl) || !snapshot.text.includes(affiliateUrl)) {
    const failed = markPublicationFailed(
      claimed,
      'publication.snapshot_affiliate_invalid',
      'snapshot affiliate URL invalid',
      input.now.toISOString()
    );
    if (failed.ok) {
      await input.repository.saveClaimed(failed.value, claimed.leaseOwner ?? input.leaseOwner);
    }
    return {
      outcome: 'failed',
      record: failed.ok ? failed.value : claimed,
      reasons: ['process.snapshot_affiliate_invalid'],
    };
  }

  const send = await input.bot.sendMessage({
    chatId: claimed.telegramChannel,
    text: snapshot.text,
    parseMode: 'HTML',
    disableWebPagePreview: false,
    publicationId: claimed.publicationId,
  });

  if (send.ok) {
    const published = markPublicationPublished(
      claimed,
      send.messageId,
      input.now.toISOString(),
      { telegramChatId: send.chatId }
    );
    if (!published.ok) {
      return { outcome: 'failed', record: claimed, reasons: published.reasons };
    }
    const saved = await input.repository.saveClaimed(
      published.value,
      claimed.leaseOwner ?? input.leaseOwner
    );
    if (!saved) {
      return {
        outcome: 'published',
        record: published.value,
        reasons: ['process.published_but_lease_lost'],
      };
    }
    return { outcome: 'published', record: published.value, reasons: ['process.published'] };
  }

  if (send.unknownOutcome) {
    const failed = markPublicationFailed(
      claimed,
      send.code,
      send.message,
      input.now.toISOString()
    );
    if (failed.ok) {
      await input.repository.saveClaimed(failed.value, claimed.leaseOwner ?? input.leaseOwner);
    }
    return {
      outcome: 'failed',
      record: failed.ok ? failed.value : claimed,
      reasons: [`process.unknown_outcome:${send.code}`],
    };
  }

  if (send.retryable) {
    let retryRecord = schedulePublicationRetry(
      claimed,
      send.code,
      send.message,
      input.now
    );
    if (
      retryRecord.ok &&
      retryRecord.value.status === 'PREPARED' &&
      send.retryAfterSeconds !== null
    ) {
      const retryAt = new Date(
        input.now.getTime() + send.retryAfterSeconds * 1000
      ).toISOString();
      const backoffMs = computePublicationBackoffMs(claimed.attemptCount);
      if (send.retryAfterSeconds * 1000 > backoffMs) {
        retryRecord = okResult({
          ...retryRecord.value,
          nextAttemptAt: retryAt,
        });
      }
    }
    if (!retryRecord.ok) {
      return { outcome: 'failed', record: claimed, reasons: retryRecord.reasons };
    }
    await input.repository.saveClaimed(
      retryRecord.value,
      claimed.leaseOwner ?? input.leaseOwner
    );
    return {
      outcome: retryRecord.value.status === 'FAILED' ? 'failed' : 'retry_scheduled',
      record: retryRecord.value,
      reasons: [`process.retry:${send.code}`],
    };
  }

  const failed = markPublicationFailed(
    claimed,
    send.code,
    send.message,
    input.now.toISOString()
  );
  if (failed.ok) {
    await input.repository.saveClaimed(failed.value, claimed.leaseOwner ?? input.leaseOwner);
  }
  return {
    outcome: 'failed',
    record: failed.ok ? failed.value : claimed,
    reasons: [`process.terminal_error:${send.code}`],
  };
}

/**
 * Drain acotado: recover leases → list due → process usando snapshot persistido.
 */
export async function drainPublicationOutbox(
  input: DrainOutboxInput
): Promise<{
  readonly recovered: number;
  readonly processed: readonly ProcessPublicationResult[];
}> {
  assertCazaOfertasMoneyUntouched();

  const limit = Math.max(
    1,
    Math.min(input.limit ?? PUBLICATION_DRAIN_MAX_BATCH, PUBLICATION_DRAIN_MAX_BATCH)
  );

  const recovered = await input.repository.recoverExpiredLeases(input.now, limit);
  const due = await input.repository.listDueForSend(limit, input.now);
  const processed: ProcessPublicationResult[] = [];

  for (const record of due) {
    const result = await processPublication({
      publicationId: record.publicationId,
      repository: input.repository,
      bot: input.bot,
      gate: input.gate,
      leaseOwner: input.leaseOwner,
      now: input.now,
    });
    processed.push(result);
  }

  return { recovered, processed };
}

export function requireCanaryGate(
  env: NodeJS.ProcessEnv = process.env
): CazaResult<TelegramCanaryGate> {
  return resolveTelegramCanaryGate(env);
}

export { publicationIdentityKey };
export type { IsoTimestamp };
