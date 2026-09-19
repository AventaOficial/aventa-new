/**
 * Distribution C3 Ops Surface — API + domain invariants.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDistributionOpsStatusCounts,
  isValidPublicationId,
  listDistributionOpsPublications,
  parseOpsStatusFilter,
  releaseUnknownOutcomeForOps,
  sanitizeOpsMeta,
} from '@/lib/distribution/opsSurface';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Distribution Ops — pure helpers', () => {
  it('malformed publication id rejected', () => {
    expect(isValidPublicationId('')).toBe(false);
    expect(isValidPublicationId('not-a-uuid')).toBe(false);
    expect(isValidPublicationId('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('status filter parsing', () => {
    expect(parseOpsStatusFilter('all')).toBe('all');
    expect(parseOpsStatusFilter('publishing')).toBe('publishing');
    expect(parseOpsStatusFilter('unknown_outcome')).toBe('unknown_outcome');
    expect(parseOpsStatusFilter('bogus')).toBe(null);
  });

  it('secrets never returned in meta', () => {
    const cleaned = sanitizeOpsMeta({
      phase: 'claim',
      bot_token: '123:SECRET',
      nested: { api_key: 'x', ok: true },
      authorization: 'Bearer abc',
    });
    expect(cleaned.phase).toBe('claim');
    expect(cleaned.bot_token).toBeUndefined();
    expect(cleaned.authorization).toBeUndefined();
    expect((cleaned.nested as Record<string, unknown>).api_key).toBeUndefined();
    expect((cleaned.nested as Record<string, unknown>).ok).toBe(true);
  });
});

describe('Distribution Ops — status counts', () => {
  it('reports enqueue/claim/published/retryable/failed/unknown without secrets', async () => {
    const statuses = [
      'pending',
      'publishing',
      'published',
      'retryable',
      'failed',
      'unknown_outcome',
      'cancelled',
    ] as const;
    const countsByStatus: Record<string, number> = {
      pending: 3,
      publishing: 1,
      published: 10,
      retryable: 2,
      failed: 4,
      unknown_outcome: 1,
      cancelled: 0,
    };

    const client = {
      from: vi.fn((table: string) => {
        if (table !== 'distribution_publications') {
          throw new Error(table);
        }
        return {
          select: vi.fn((_cols: string, opts?: { head?: boolean }) => {
            const chain: Record<string, unknown> = {};
            chain.eq = vi.fn((col: string, val: string) => {
              if (opts?.head && col === 'status') {
                return Promise.resolve({
                  count: countsByStatus[val] ?? 0,
                  error: null,
                });
              }
              return chain;
            });
            return chain;
          }),
        };
      }),
    };

    const counts = await fetchDistributionOpsStatusCounts(client as never);
    expect(counts).toEqual({
      enqueued: 3,
      claiming: 1,
      published: 10,
      retryable: 2,
      failed: 4,
      unknownOutcome: 1,
      cancelled: 0,
      total: 21,
    });
    expect(statuses.every((s) => client.from.mock.calls.some(() => true))).toBe(true);
    expect(JSON.stringify(counts)).not.toMatch(/token|secret|password/i);
  });
});

describe('Distribution Ops — list visibility', () => {
  it('lists publishing / unknown / retryable / published', async () => {
    const pubs = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        offer_id: '22222222-2222-4222-8222-222222222222',
        destination_id: '33333333-3333-4333-8333-333333333333',
        provider: 'telegram',
        status: 'publishing',
        attempt_count: 1,
        idempotency_key: 'o:d:v1',
        distribution_version: 1,
        external_message_id: null,
        last_error_code: null,
        last_error_message: null,
        created_at: '2026-09-18T10:00:00.000Z',
        updated_at: '2026-09-18T10:01:00.000Z',
        published_at: null,
      },
      {
        id: '11111111-1111-4111-8111-111111111112',
        offer_id: '22222222-2222-4222-8222-222222222222',
        destination_id: '33333333-3333-4333-8333-333333333333',
        provider: 'telegram',
        status: 'unknown_outcome',
        attempt_count: 2,
        idempotency_key: 'o:d:v2',
        distribution_version: 2,
        external_message_id: null,
        last_error_code: 'UNKNOWN_OUTCOME',
        last_error_message: 'ambiguous',
        created_at: '2026-09-18T10:00:00.000Z',
        updated_at: '2026-09-18T10:05:00.000Z',
        published_at: null,
      },
      {
        id: '11111111-1111-4111-8111-111111111113',
        offer_id: '22222222-2222-4222-8222-222222222222',
        destination_id: '33333333-3333-4333-8333-333333333333',
        provider: 'telegram',
        status: 'retryable',
        attempt_count: 1,
        idempotency_key: 'o:d:v3',
        distribution_version: 3,
        external_message_id: null,
        last_error_code: null,
        last_error_message: null,
        created_at: '2026-09-18T09:00:00.000Z',
        updated_at: '2026-09-18T09:01:00.000Z',
        published_at: null,
      },
      {
        id: '11111111-1111-4111-8111-111111111114',
        offer_id: '22222222-2222-4222-8222-222222222222',
        destination_id: '33333333-3333-4333-8333-333333333333',
        provider: 'telegram',
        status: 'published',
        attempt_count: 1,
        idempotency_key: 'o:d:v4',
        distribution_version: 4,
        external_message_id: 'tg-1',
        last_error_code: null,
        last_error_message: null,
        created_at: '2026-09-18T08:00:00.000Z',
        updated_at: '2026-09-18T08:01:00.000Z',
        published_at: '2026-09-18T08:01:00.000Z',
      },
    ];

    const headCountByStatus: Record<string, number> = {
      pending: 0,
      publishing: 1,
      published: 1,
      retryable: 1,
      failed: 0,
      unknown_outcome: 1,
      cancelled: 0,
    };

    const client = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_publications') {
          const listChain: Record<string, unknown> = {};
          const self = () => listChain;
          listChain.select = vi.fn((_cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
              const headChain: Record<string, unknown> = {};
              headChain.eq = vi.fn((col: string, val: string) => {
                if (col === 'status') {
                  return Promise.resolve({
                    count: headCountByStatus[val] ?? 0,
                    error: null,
                  });
                }
                return Promise.resolve({ count: 0, error: null });
              });
              return headChain;
            }
            return listChain;
          });
          listChain.in = vi.fn(self);
          listChain.order = vi.fn(self);
          listChain.limit = vi.fn(async () => ({ data: pubs, error: null }));
          listChain.eq = vi.fn(self);
          return listChain;
        }
        if (table === 'distribution_events') {
          const chain: Record<string, unknown> = {};
          const self = () => chain;
          chain.select = vi.fn(self);
          chain.in = vi.fn(self);
          chain.order = vi.fn(self);
          chain.limit = vi.fn(async () => ({
            data: [
              {
                publication_id: pubs[1]!.id,
                event_type: 'unknown_outcome',
                meta: { token: 'SECRET', reason: 'lease' },
                created_at: '2026-09-18T10:05:00.000Z',
              },
            ],
            error: null,
          }));
          return chain;
        }
        throw new Error(table);
      }),
    };

    const result = await listDistributionOpsPublications(client as never, {
      filter: 'all',
      env: {},
    });
    expect(result.ok).toBe(true);
    expect(result.engineEnabled).toBe(false);
    expect(result.statusCounts.claiming).toBe(1);
    expect(result.statusCounts.unknownOutcome).toBe(1);
    expect(result.statusCounts.total).toBeGreaterThan(0);
    expect(result.publications.map((p) => p.status).sort()).toEqual([
      'published',
      'publishing',
      'retryable',
      'unknown_outcome',
    ].sort());
    const unknown = result.publications.find((p) => p.status === 'unknown_outcome')!;
    expect(unknown.requiresOperatorReconcile).toBe(true);
    expect(unknown.operatorStatus).toBe('UNKNOWN_OUTCOME');
    expect(unknown.lastEvent?.meta.token).toBeUndefined();
    expect(unknown.lastEvent?.meta.reason).toBe('lease');
  });
});

describe('Distribution Ops — releaseUnknownOutcomeForOps', () => {
  it('publication missing → fail closed', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    };
    const r = await releaseUnknownOutcomeForOps(
      client as never,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(r).toMatchObject({ ok: false, reason: 'publication_not_found' });
  });

  it('release from publishing → rejected', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: '11111111-1111-4111-8111-111111111111',
                status: 'publishing',
                idempotency_key: 'k',
              },
              error: null,
            })),
          })),
        })),
      })),
    };
    const r = await releaseUnknownOutcomeForOps(
      client as never,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(r).toMatchObject({
      ok: false,
      reason: 'not_unknown_outcome',
      currentStatus: 'publishing',
    });
  });

  it('release published → rejected', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: '11111111-1111-4111-8111-111111111111',
                status: 'published',
                idempotency_key: 'k',
              },
              error: null,
            })),
          })),
        })),
      })),
    };
    const r = await releaseUnknownOutcomeForOps(
      client as never,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.currentStatus).toBe('published');
  });

  it('release retryable → rejected', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: '11111111-1111-4111-8111-111111111111',
                status: 'retryable',
                idempotency_key: 'k',
              },
              error: null,
            })),
          })),
        })),
      })),
    };
    const r = await releaseUnknownOutcomeForOps(
      client as never,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.currentStatus).toBe('retryable');
  });

  it('unknown_outcome release → retryable + idempotency preserved', async () => {
    const events: string[] = [];
    let updatedPayload: Record<string, unknown> | null = null;
    const pubId = '11111111-1111-4111-8111-111111111111';
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
        // publications: first select for pre-check, then update CAS, then no second select on success
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: pubId,
                  status: 'unknown_outcome',
                  idempotency_key: 'offer:dest:v1',
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedPayload = payload;
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.eq = vi.fn(self);
            chain.select = vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: pubId,
                  attempt_count: 2,
                  idempotency_key: 'offer:dest:v1',
                },
                error: null,
              })),
            }));
            return chain;
          }),
        };
      }),
    };

    const r = await releaseUnknownOutcomeForOps(client as never, pubId, {
      reason: 'ops_confirmed',
    });
    expect(r).toEqual({
      ok: true,
      publicationId: pubId,
      previousStatus: 'unknown_outcome',
      status: 'retryable',
      idempotencyKey: 'offer:dest:v1',
    });
    expect(updatedPayload?.status).toBe('retryable');
    expect(events).toContain('released_to_retryable');
    // never mutate offers
    expect(client.from).not.toHaveBeenCalledWith('offers');
    expect(client.from).not.toHaveBeenCalledWith('creator_rewards');
    expect(client.from).not.toHaveBeenCalledWith('affiliate_ledger');
  });

  it('CAS lost → no false success', async () => {
    const pubId = '11111111-1111-4111-8111-111111111111';
    let selectPass = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_events') {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                selectPass += 1;
                if (selectPass === 1) {
                  return {
                    data: {
                      id: pubId,
                      status: 'unknown_outcome',
                      idempotency_key: 'k',
                    },
                    error: null,
                  };
                }
                return { data: { status: 'retryable' }, error: null };
              }),
            })),
          })),
          update: vi.fn(() => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.eq = vi.fn(self);
            chain.select = vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            }));
            return chain;
          }),
        };
      }),
    };
    const r = await releaseUnknownOutcomeForOps(client as never, pubId);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('cas_lost_or_not_unknown');
      expect(r.currentStatus).toBe('retryable');
    }
  });

  it('invalid id → rejected', async () => {
    const from = vi.fn();
    const r = await releaseUnknownOutcomeForOps({ from } as never, 'bad');
    expect(r).toEqual({ ok: false, reason: 'invalid_publication_id' });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('Distribution Ops — API route auth + boundaries', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/server/requireAdmin');
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('unauthorized operator → rejected', async () => {
    vi.resetModules();
    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({ error: 'Unauthorized', status: 401 })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({ from: vi.fn() })),
    }));
    const { GET, POST } = await import('@/app/api/admin/distribution-ops/route');
    const getRes = await GET(new Request('https://x/api/admin/distribution-ops'));
    expect(getRes.status).toBe(401);
    const postRes = await POST(
      new Request('https://x/api/admin/distribution-ops', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicationId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
    );
    expect(postRes.status).toBe(401);
  });

  it('route never imports telegram adapter / providers', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/admin/distribution-ops/route.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/telegram/i);
    expect(src).not.toMatch(/getDistributionProviderAdapter/);
    expect(src).not.toMatch(/drainDistribution/);
    expect(src).toMatch(/releaseUnknownOutcomeForOps/);
  });

  it('opsSurface never mutates offers or money tables', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/distribution/opsSurface.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\.from\(['"]offers['"]\)/);
    expect(src).not.toMatch(/creator_rewards|affiliate|attribution|ledger/i);
    expect(src).toMatch(/releaseUnknownOutcomeToRetryable/);
  });
});
