/**
 * CazaOfertasss — Implementaciones in-memory de los puertos.
 *
 * Existen para tests y desarrollo local. La firma es idéntica a PostgreSQL:
 * lookup por clave + listados paginados + upsert atómico + claim outbox.
 */

import { mergeDealCandidate, type DealCandidateRepository } from '../dedupe';
import type { AffiliateRevenueEvent, AffiliateRevenueLedgerPort } from '../revenue/ledger';
import type {
  ClaimPublicationInput,
  DealPublicationRecord,
  DealPublicationRepository,
} from '../tracking/publication';
import type { DealCandidate } from '../types';

/** Mutex por clave: serializa upserts/claims concurrentes sobre la misma identity. */
function createKeyedMutex() {
  const tails = new Map<string, Promise<unknown>>();
  return async function withKeyLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = prev.then(() => gate);
    tails.set(
      key,
      next.catch(() => undefined)
    );
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (tails.get(key) === next) tails.delete(key);
    }
  };
}

export function createInMemoryDealCandidateRepository(): DealCandidateRepository & {
  size(): number;
} {
  const byIdentityKey = new Map<string, DealCandidate>();
  const withKeyLock = createKeyedMutex();

  return {
    async findByIdentityKey(identityKey: string) {
      return byIdentityKey.get(identityKey) ?? null;
    },
    async save(candidate: DealCandidate) {
      byIdentityKey.set(candidate.identity.key, candidate);
    },
    async upsertAtomic(incoming: DealCandidate) {
      return withKeyLock(incoming.identity.key, async () => {
        const existing = byIdentityKey.get(incoming.identity.key) ?? null;
        const outcome = mergeDealCandidate(existing, incoming);
        byIdentityKey.set(outcome.candidate.identity.key, outcome.candidate);
        return outcome;
      });
    },
    async listByStatus(status, limit, cursor) {
      const safeLimit = Math.max(1, Math.min(limit, 200));
      const sorted = [...byIdentityKey.values()]
        .filter((c) => c.status === status)
        .sort((a, b) => (a.identity.key < b.identity.key ? -1 : 1));
      const start = cursor ? sorted.findIndex((c) => c.identity.key === cursor) + 1 : 0;
      const items = sorted.slice(start, start + safeLimit);
      const nextCursor =
        items.length === safeLimit && start + safeLimit < sorted.length
          ? items[items.length - 1].identity.key
          : null;
      return { items, nextCursor };
    },
    size() {
      return byIdentityKey.size;
    },
  };
}

function isDue(record: DealPublicationRecord, nowMs: number): boolean {
  if (record.status !== 'PREPARED') return false;
  if (record.nextAttemptAt === null) return true;
  return Date.parse(record.nextAttemptAt) <= nowMs;
}

export function createInMemoryDealPublicationRepository(): DealPublicationRepository {
  const byId = new Map<string, DealPublicationRecord>();
  const withKeyLock = createKeyedMutex();

  return {
    async findByIdentityKey(publicationId: string) {
      return byId.get(publicationId) ?? null;
    },

    async save(record: DealPublicationRecord) {
      const existing = byId.get(record.publicationId);
      if (existing?.cardSnapshot) {
        byId.set(record.publicationId, {
          ...record,
          cardSnapshot: existing.cardSnapshot,
        });
        return;
      }
      byId.set(record.publicationId, record);
    },

    async saveIdempotent(record: DealPublicationRecord) {
      return withKeyLock(record.publicationId, async () => {
        const existing = byId.get(record.publicationId);
        if (existing) return { inserted: false, record: existing };
        byId.set(record.publicationId, record);
        return { inserted: true, record };
      });
    },

    async listByDealId(dealId: string, limit: number) {
      const safeLimit = Math.max(1, Math.min(limit, 200));
      return [...byId.values()].filter((r) => r.dealId === dealId).slice(0, safeLimit);
    },

    async claimForSend(input: ClaimPublicationInput) {
      return withKeyLock(input.publicationId, async () => {
        const existing = byId.get(input.publicationId) ?? null;
        if (!existing) {
          return { claimed: false, record: null, reason: 'not_found' };
        }
        if (existing.status === 'PUBLISHED') {
          return { claimed: false, record: existing, reason: 'already_published' };
        }
        if (existing.status === 'FAILED' || existing.status === 'RETRACTED') {
          return { claimed: false, record: existing, reason: `terminal:${existing.status}` };
        }
        const nowMs = input.now.getTime();
        if (existing.status === 'SENDING') {
          const leaseMs = existing.leasedUntil ? Date.parse(existing.leasedUntil) : 0;
          if (leaseMs > nowMs) {
            return { claimed: false, record: existing, reason: 'lease_held' };
          }
        }
        if (existing.status === 'PREPARED' && !isDue(existing, nowMs)) {
          return { claimed: false, record: existing, reason: 'not_due' };
        }
        if (existing.attemptCount >= existing.maxAttempts) {
          const failed: DealPublicationRecord = {
            ...existing,
            status: 'FAILED',
            lastErrorCode: 'publication.max_attempts',
            lastErrorMessage: 'max attempts reached at claim',
            leasedUntil: null,
            leaseOwner: null,
            updatedAt: input.now.toISOString(),
          };
          byId.set(failed.publicationId, failed);
          return { claimed: false, record: failed, reason: 'max_attempts' };
        }

        const leasedUntil = new Date(nowMs + input.leaseDurationMs).toISOString();
        const claimed: DealPublicationRecord = {
          ...existing,
          status: 'SENDING',
          attemptCount: existing.attemptCount + 1,
          leaseOwner: input.leaseOwner,
          leasedUntil,
          updatedAt: input.now.toISOString(),
        };
        byId.set(claimed.publicationId, claimed);
        return { claimed: true, record: claimed };
      });
    },

    async saveClaimed(record: DealPublicationRecord, leaseOwner: string) {
      return withKeyLock(record.publicationId, async () => {
        const existing = byId.get(record.publicationId);
        if (!existing) return false;
        if (existing.leaseOwner !== null && existing.leaseOwner !== leaseOwner) {
          return false;
        }
        byId.set(record.publicationId, {
          ...record,
          cardSnapshot: existing.cardSnapshot,
        });
        return true;
      });
    },

    async listDueForSend(limit: number, now: Date) {
      const safeLimit = Math.max(1, Math.min(limit, 25));
      const nowMs = now.getTime();
      return [...byId.values()]
        .filter((r) => isDue(r, nowMs))
        .sort((a, b) => {
          const ta = Date.parse(a.preparedAt);
          const tb = Date.parse(b.preparedAt);
          if (ta !== tb) return ta - tb;
          return a.publicationId < b.publicationId ? -1 : 1;
        })
        .slice(0, safeLimit);
    },

    async recoverExpiredLeases(now: Date, limit: number) {
      const safeLimit = Math.max(1, Math.min(limit, 100));
      const nowMs = now.getTime();
      let recovered = 0;
      const sending = [...byId.values()]
        .filter((r) => r.status === 'SENDING')
        .sort((a, b) => (a.publicationId < b.publicationId ? -1 : 1));

      for (const record of sending) {
        if (recovered >= safeLimit) break;
        const leaseMs = record.leasedUntil ? Date.parse(record.leasedUntil) : 0;
        if (leaseMs > nowMs) continue;

        // Unknown outcome previo: no auto-retry.
        if (
          record.lastErrorCode === 'telegram_network_or_timeout' ||
          record.lastErrorCode === 'telegram_missing_message_id'
        ) {
          const failed: DealPublicationRecord = {
            ...record,
            status: 'FAILED',
            leasedUntil: null,
            leaseOwner: null,
            updatedAt: now.toISOString(),
          };
          byId.set(failed.publicationId, failed);
          recovered += 1;
          continue;
        }

        // Crash recovery: SENDING expirado sin message_id → PREPARED.
        if (record.telegramMessageId === null) {
          const prepared: DealPublicationRecord = {
            ...record,
            status: 'PREPARED',
            leasedUntil: null,
            leaseOwner: null,
            nextAttemptAt: null,
            updatedAt: now.toISOString(),
          };
          byId.set(prepared.publicationId, prepared);
          recovered += 1;
        }
      }
      return recovered;
    },
  };
}

export function createInMemoryAffiliateRevenueLedger(): AffiliateRevenueLedgerPort & {
  size(): number;
  /** Test-only: mutación prohibida. */
  tryMutate(eventId: string): Promise<never>;
  all(): readonly AffiliateRevenueEvent[];
} {
  const byEventId = new Map<string, AffiliateRevenueEvent>();
  const withKeyLock = createKeyedMutex();

  return {
    async append(event: AffiliateRevenueEvent) {
      return withKeyLock(event.eventId, async () => {
        if (byEventId.has(event.eventId)) return { appended: false, duplicate: true };
        byEventId.set(event.eventId, event);
        return { appended: true, duplicate: false };
      });
    },
    async findByEventId(eventId: string) {
      return byEventId.get(eventId) ?? null;
    },
    async listByDealId(dealId: string, limit: number) {
      const safeLimit = Math.max(1, Math.min(limit, 500));
      return [...byEventId.values()].filter((e) => e.dealId === dealId).slice(0, safeLimit);
    },
    async listByExternalReference(network, externalReference, limit) {
      const safeLimit = Math.max(1, Math.min(limit, 500));
      return [...byEventId.values()]
        .filter((e) => e.network === network && e.externalReference === externalReference)
        .slice(0, safeLimit);
    },
    async listByTrackingLabel(trackingLabel, limit) {
      const safeLimit = Math.max(1, Math.min(limit, 500));
      return [...byEventId.values()]
        .filter((e) => e.trackingLabel === trackingLabel)
        .slice(0, safeLimit);
    },
    size() {
      return byEventId.size;
    },
    async tryMutate() {
      throw new Error('caza.revenue_ledger.append_only:mutate_forbidden');
    },
    all() {
      return [...byEventId.values()];
    },
  };
}
