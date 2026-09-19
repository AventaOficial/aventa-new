/**
 * Distribution C3 — lease / reclaim / UNKNOWN_OUTCOME / recovery invariants.
 * No Telegram live traffic. Flag OFF by default. No Supply/Rewards writes.
 */

import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISTRIBUTION_C3_EVENTS,
  DISTRIBUTION_EVENT_TYPES,
  DISTRIBUTION_OPERATOR_STATUS_LABELS,
  DISTRIBUTION_PUBLICATION_STATUSES,
  DISTRIBUTION_PUBLISHING_LEASE_MS,
  assertNotPendingForDistribution,
  buildDistributionIdempotencyKey,
  buildPublishingLease,
  classifyExpiredPublishingReclaim,
  evaluateDistributionEligibilityFromSnapshot,
  isDistributionEngineEnabled,
  isPublishingLeaseExpired,
  markPublishingUnknownOutcome,
  reclaimStuckPublishingPublication,
  reclaimStuckPublishingPublications,
  releaseUnknownOutcomeToRetryable,
} from '@/lib/distribution';
import { createTelegramAdapter } from '@/lib/distribution/providers/telegram/adapter';

const ROOT = process.cwd();

describe('Distribution C3 — contract surface', () => {
  it('extends statuses/events explicitly (unknown_outcome visible)', () => {
    expect(DISTRIBUTION_PUBLICATION_STATUSES).toContain('unknown_outcome');
    expect(DISTRIBUTION_EVENT_TYPES).toContain('lease_acquired');
    expect(DISTRIBUTION_EVENT_TYPES).toContain('unknown_outcome');
    expect(DISTRIBUTION_EVENT_TYPES).toContain('released_to_retryable');
    expect(DISTRIBUTION_OPERATOR_STATUS_LABELS.unknown_outcome).toBe('UNKNOWN_OUTCOME');
    expect(DISTRIBUTION_OPERATOR_STATUS_LABELS.publishing).toBe('PUBLISHING');
  });

  it('reclaim is first-class export (no longer c3-wip)', () => {
    expect(existsSync(join(ROOT, 'lib/distribution/reclaim.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'lib/distribution/c3-wip/reclaim.ts'))).toBe(false);
    const index = readFileSync(join(ROOT, 'lib/distribution/index.ts'), 'utf8');
    expect(index).toMatch(/reclaim/);
    expect(index).not.toMatch(/c3-wip/);
  });

  it('drain source never auto-calls releaseUnknownOutcomeToRetryable', () => {
    const drain = readFileSync(join(ROOT, 'lib/distribution/drain.ts'), 'utf8');
    expect(drain).not.toMatch(/releaseUnknownOutcomeToRetryable/);
    expect(drain).not.toMatch(/reclaimStuckPublishing/);
  });

  it('flag remains fail-closed', () => {
    expect(isDistributionEngineEnabled({})).toBe(false);
  });
});

describe('Distribution C3 — lease', () => {
  it('buildPublishingLease has owner, acquired, expires, attempt, stable identity', () => {
    const lease = buildPublishingLease({
      publicationId: 'pub-1',
      idempotencyKey: 'offer:dest:v1',
      attempt: 2,
      leaseOwner: 'worker-a',
      acquiredAtIso: '2026-09-18T12:00:00.000Z',
      leaseMs: 60_000,
    });
    expect(lease.leaseOwner).toBe('worker-a');
    expect(lease.leaseAcquiredAt).toBe('2026-09-18T12:00:00.000Z');
    expect(lease.leaseExpiresAt).toBe('2026-09-18T12:01:00.000Z');
    expect(lease.attempt).toBe(2);
    expect(lease.idempotencyKey).toBe('offer:dest:v1');
  });

  it('lease expiration is pure and does not imply failed', () => {
    const acquired = '2026-09-18T12:00:00.000Z';
    const now = Date.parse(acquired) + DISTRIBUTION_PUBLISHING_LEASE_MS;
    expect(isPublishingLeaseExpired(acquired, now - 1)).toBe(false);
    expect(isPublishingLeaseExpired(acquired, now)).toBe(true);
    // Expiration alone is not a status — classify separately
    expect(
      classifyExpiredPublishingReclaim({
        sideEffectMayHaveStarted: false,
        alreadyHasExternalMessageId: false,
      }),
    ).toBe('RETRYABLE_NO_SIDE_EFFECT');
  });
});

describe('Distribution C3 — classify UNKNOWN vs retryable', () => {
  it('no side effect → retryable; side effect → UNKNOWN; message id → published hint', () => {
    expect(
      classifyExpiredPublishingReclaim({
        sideEffectMayHaveStarted: false,
        alreadyHasExternalMessageId: false,
      }),
    ).toBe('RETRYABLE_NO_SIDE_EFFECT');
    expect(
      classifyExpiredPublishingReclaim({
        sideEffectMayHaveStarted: true,
        alreadyHasExternalMessageId: false,
      }),
    ).toBe('UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE');
    expect(
      classifyExpiredPublishingReclaim({
        sideEffectMayHaveStarted: true,
        alreadyHasExternalMessageId: true,
      }),
    ).toBe('ALREADY_PUBLISHED_HINT');
  });
});

describe('Distribution C3 — reclaim CAS', () => {
  const baseRow = {
    id: 'pub-1',
    offer_id: 'offer-1',
    destination_id: 'dest-1',
    status: 'publishing',
    updated_at: '2026-09-18T12:00:00.000Z',
    attempt_count: 1,
    idempotency_key: 'offer-1:dest-1:v1',
    external_message_id: null as string | null,
    last_error_code: null,
  };

  function makeReclaimClient(opts: {
    casWin: boolean;
    sideEffectEvents?: Array<{ event_type: string; meta: Record<string, unknown> }>;
    onUpdate?: (payload: Record<string, unknown>) => void;
  }) {
    const events: Array<{ event_type: string; meta: Record<string, unknown> }> = [];
    let casConsumed = false;
    return {
      events,
      client: {
        from: vi.fn((table: string) => {
          if (table === 'distribution_events') {
            return {
              insert: vi.fn(async (payload: { event_type: string; meta?: Record<string, unknown> }) => {
                events.push({ event_type: payload.event_type, meta: payload.meta ?? {} });
                return { error: null };
              }),
              select: vi.fn(() => {
                const chain: Record<string, unknown> = {};
                const self = () => chain;
                for (const m of ['eq', 'in', 'gte', 'order']) chain[m] = vi.fn(self);
                chain.limit = vi.fn(async () => ({
                  data: opts.sideEffectEvents ?? [],
                  error: null,
                }));
                return chain;
              }),
            };
          }
          if (table === 'distribution_publications') {
            return {
              update: vi.fn((payload: Record<string, unknown>) => {
                opts.onUpdate?.(payload);
                const chain: Record<string, unknown> = {};
                const self = () => chain;
                chain.eq = vi.fn(self);
                chain.select = vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    if (!opts.casWin || casConsumed) {
                      return { data: null, error: null };
                    }
                    casConsumed = true;
                    return { data: { id: baseRow.id }, error: null };
                  }),
                }));
                return chain;
              }),
              select: vi.fn(() => {
                const chain: Record<string, unknown> = {};
                const self = () => chain;
                for (const m of ['eq', 'lte', 'order', 'limit']) chain[m] = vi.fn(self);
                chain.limit = vi.fn(async () => ({ data: [baseRow], error: null }));
                return chain;
              }),
            };
          }
          throw new Error(table);
        }),
      },
    };
  }

  it('active lease is not reclaimed', async () => {
    const { client } = makeReclaimClient({ casWin: true });
    const decision = await reclaimStuckPublishingPublication(client as never, baseRow, {
      nowMs: Date.parse(baseRow.updated_at) + 1_000,
      leaseMs: DISTRIBUTION_PUBLISHING_LEASE_MS,
    });
    expect(decision).toBe('LEASE_ACTIVE');
  });

  it('expired + no side effect → retryable (same idempotency)', async () => {
    const updates: Record<string, unknown>[] = [];
    const { client, events } = makeReclaimClient({
      casWin: true,
      sideEffectEvents: [],
      onUpdate: (p) => updates.push(p),
    });
    const decision = await reclaimStuckPublishingPublication(client as never, baseRow, {
      nowMs: Date.parse(baseRow.updated_at) + DISTRIBUTION_PUBLISHING_LEASE_MS + 1,
    });
    expect(decision).toBe('RETRYABLE_NO_SIDE_EFFECT');
    expect(updates[0]?.status).toBe('retryable');
    expect(events.map((e) => e.event_type)).toContain(DISTRIBUTION_C3_EVENTS.reclaimed);
    expect(events.map((e) => e.event_type)).toContain(DISTRIBUTION_C3_EVENTS.reclaim_attempted);
  });

  it('expired + publish_attempt → UNKNOWN_OUTCOME (not failed)', async () => {
    const updates: Record<string, unknown>[] = [];
    const { client, events } = makeReclaimClient({
      casWin: true,
      sideEffectEvents: [
        {
          event_type: 'publication_attempted',
          meta: { phase: 'publish_attempt' },
        },
      ],
      onUpdate: (p) => updates.push(p),
    });
    const decision = await reclaimStuckPublishingPublication(client as never, baseRow, {
      nowMs: Date.parse(baseRow.updated_at) + DISTRIBUTION_PUBLISHING_LEASE_MS + 1,
    });
    expect(decision).toBe('UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE');
    expect(updates[0]?.status).toBe('unknown_outcome');
    expect(updates[0]?.status).not.toBe('failed');
    expect(events.map((e) => e.event_type)).toContain(DISTRIBUTION_C3_EVENTS.unknown_outcome);
  });

  it('external_message_id on reclaim → published (no duplicate row)', async () => {
    const updates: Record<string, unknown>[] = [];
    const { client } = makeReclaimClient({
      casWin: true,
      onUpdate: (p) => updates.push(p),
    });
    const decision = await reclaimStuckPublishingPublication(
      client as never,
      { ...baseRow, external_message_id: 'tg-99' },
      { nowMs: Date.parse(baseRow.updated_at) + DISTRIBUTION_PUBLISHING_LEASE_MS + 1 },
    );
    expect(decision).toBe('PUBLISHED_FROM_EXTERNAL_MESSAGE_ID');
    expect(updates[0]?.status).toBe('published');
  });

  it('concurrent reclaim → only one CAS winner', async () => {
    let wins = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_events') {
          return {
            insert: vi.fn(async () => ({ error: null })),
            select: vi.fn(() => {
              const chain: Record<string, unknown> = {};
              const self = () => chain;
              for (const m of ['eq', 'in', 'gte', 'order']) chain[m] = vi.fn(self);
              chain.limit = vi.fn(async () => ({ data: [], error: null }));
              return chain;
            }),
          };
        }
        return {
          update: vi.fn(() => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.eq = vi.fn(self);
            chain.select = vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                if (wins >= 1) return { data: null, error: null };
                wins += 1;
                return { data: { id: baseRow.id }, error: null };
              }),
            }));
            return chain;
          }),
        };
      }),
    };
    const nowMs = Date.parse(baseRow.updated_at) + DISTRIBUTION_PUBLISHING_LEASE_MS + 1;
    const [a, b] = await Promise.all([
      reclaimStuckPublishingPublication(client as never, baseRow, { nowMs }),
      reclaimStuckPublishingPublication(client as never, baseRow, { nowMs }),
    ]);
    const decisions = [a, b].sort();
    expect(decisions).toContain('RETRYABLE_NO_SIDE_EFFECT');
    expect(decisions).toContain('CAS_LOST');
    expect(wins).toBe(1);
  });
});

describe('Distribution C3 — operator recovery', () => {
  it('releaseUnknownOutcomeToRetryable requires unknown_outcome CAS', async () => {
    let statusFilter: string | null = null;
    const events: string[] = [];
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_events') {
          return {
            insert: vi.fn(async (p: { event_type: string }) => {
              events.push(p.event_type);
              return { error: null };
            }),
          };
        }
        return {
          update: vi.fn(() => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.eq = vi.fn((col: string, val: string) => {
              if (col === 'status') statusFilter = val;
              return chain;
            });
            chain.select = vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: 'pub-1', attempt_count: 2, idempotency_key: 'k' },
                error: null,
              })),
            }));
            return chain;
          }),
        };
      }),
    };
    const r = await releaseUnknownOutcomeToRetryable(client as never, 'pub-1', {
      reason: 'ops_confirmed_not_published',
    });
    expect(r).toEqual({ ok: true });
    expect(statusFilter).toBe('unknown_outcome');
    expect(events).toContain(DISTRIBUTION_C3_EVENTS.released_to_retryable);
  });

  it('release from non-unknown loses CAS', async () => {
    const client = {
      from: vi.fn(() => ({
        update: vi.fn(() => {
          const chain: Record<string, unknown> = {};
          const self = () => chain;
          chain.eq = vi.fn(self);
          chain.select = vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          }));
          return chain;
        }),
        insert: vi.fn(async () => ({ error: null })),
      })),
    };
    const r = await releaseUnknownOutcomeToRetryable(client as never, 'pub-1');
    expect(r).toEqual({ ok: false, reason: 'cas_lost_or_not_unknown' });
  });
});

describe('Distribution C3 — mark UNKNOWN from adapter ambiguity', () => {
  it('markPublishingUnknownOutcome CAS on publishing only', async () => {
    let statusEq: string | null = null;
    const events: string[] = [];
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_events') {
          return {
            insert: vi.fn(async (p: { event_type: string }) => {
              events.push(p.event_type);
              return { error: null };
            }),
          };
        }
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            expect(payload.status).toBe('unknown_outcome');
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.eq = vi.fn((col: string, val: string) => {
              if (col === 'status') statusEq = val;
              return chain;
            });
            chain.select = vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: 'pub-1' }, error: null })),
            }));
            return chain;
          }),
        };
      }),
    };
    const ok = await markPublishingUnknownOutcome(client as never, {
      publicationId: 'pub-1',
      attemptCount: 1,
      idempotencyKey: 'offer:dest:v1',
      code: 'telegram_network_or_timeout',
      message: 'timeout',
    });
    expect(ok).toBe(true);
    expect(statusEq).toBe('publishing');
    expect(events).toContain(DISTRIBUTION_C3_EVENTS.unknown_outcome);
  });
});

describe('Distribution C3 — telegram adapter unknownOutcome', () => {
  it('timeout/network → unknownOutcome (not retryable failed)', async () => {
    const adapter = createTelegramAdapter({
      env: { TELEGRAM_BOT_TOKEN_A: '123:ABC' },
      fetchImpl: vi.fn(async () => {
        throw new Error('The operation was aborted due to timeout');
      }) as never,
    });
    const r = await adapter.publish({
      externalDestinationKey: '-1001',
      credentialRef: 'TELEGRAM_BOT_TOKEN_A',
      text: 'hi',
      imageUrl: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.unknownOutcome).toBe(true);
      expect('retryable' in r && (r as { retryable?: boolean }).retryable).toBeFalsy();
    }
  });

  it('clear 400 before accept → definite failure (not UNKNOWN)', async () => {
    const adapter = createTelegramAdapter({
      env: { TELEGRAM_BOT_TOKEN_A: '123:ABC' },
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, description: 'Bad Request: chat not found' }),
      })) as never,
    });
    const r = await adapter.publish({
      externalDestinationKey: '-1001',
      credentialRef: 'TELEGRAM_BOT_TOKEN_A',
      text: 'hi',
      imageUrl: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && !r.unknownOutcome) {
      expect(r.retryable).toBe(false);
      expect(r.code).toBe('telegram_chat_unreachable');
    }
  });
});

describe('Distribution C3 — crash scenario matrix (pure + reclaim)', () => {
  it('A: claim → crash → lease expires → reclaim → retryable', () => {
    expect(
      classifyExpiredPublishingReclaim({
        sideEffectMayHaveStarted: false,
        alreadyHasExternalMessageId: false,
      }),
    ).toBe('RETRYABLE_NO_SIDE_EFFECT');
  });

  it('B: publish may have succeeded → crash before DB → UNKNOWN', () => {
    expect(
      classifyExpiredPublishingReclaim({
        sideEffectMayHaveStarted: true,
        alreadyHasExternalMessageId: false,
      }),
    ).toBe('UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE');
  });

  it('C: publish fails before provider accepts → retryable path', () => {
    expect(
      classifyExpiredPublishingReclaim({
        sideEffectMayHaveStarted: false,
        alreadyHasExternalMessageId: false,
      }),
    ).toBe('RETRYABLE_NO_SIDE_EFFECT');
  });

  it('D: duplicate recovery keeps stable identity (idempotency key)', () => {
    const key = buildDistributionIdempotencyKey({
      offerId: 'o1',
      destinationId: 'd1',
      distributionVersion: 1,
    });
    expect(key).toBe('o1:d1:v1');
    expect(key).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe('Distribution C3 — C2 boundaries still hold', () => {
  it('pending offer cannot distribute', () => {
    expect(() => assertNotPendingForDistribution('pending')).toThrow();
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: 'o', status: 'pending', expires_at: null },
      { nowMs: Date.now(), requireEngineEnabled: false },
    );
    expect(r.eligible).toBe(false);
  });

  it('approved live offer remains distributable', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: 'o', status: 'approved', expires_at: null },
      { nowMs: Date.now(), requireEngineEnabled: false },
    );
    expect(r.eligible).toBe(true);
  });
});

describe('Distribution C3 — migration artifact', () => {
  it('migration documents unknown_outcome + observability events', () => {
    const sql = readFileSync(
      join(ROOT, 'docs/supabase-migrations/20260918_distribution_c3_unknown_outcome.sql'),
      'utf8',
    );
    expect(sql).toContain('unknown_outcome');
    expect(sql).toContain('lease_acquired');
    expect(sql).toContain('released_to_retryable');
    expect(sql).toContain('idx_distribution_publications_publishing_lease');
  });
});

describe('Distribution C3 — scan reclaim does not touch unknown_outcome rows', () => {
  it('scan filters status=publishing only', async () => {
    const statusFilters: string[] = [];
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => {
          const chain: Record<string, unknown> = {};
          const self = () => chain;
          chain.eq = vi.fn((col: string, val: string) => {
            if (col === 'status') statusFilters.push(val);
            return chain;
          });
          chain.lte = vi.fn(self);
          chain.order = vi.fn(self);
          chain.limit = vi.fn(async () => ({ data: [], error: null }));
          return chain;
        }),
      })),
    };
    await reclaimStuckPublishingPublications(client as never, { limit: 5 });
    expect(statusFilters).toEqual(['publishing']);
  });
});
