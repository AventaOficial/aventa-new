/**
 * Distribution C2 — APPROVED ≠ PENDING boundary.
 *
 * PENDING ≠ APPROVED ≠ DISTRIBUTED
 * No Telegram. No production writes. Flag default OFF.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertNotPendingForDistribution,
  buildDistributionIdempotencyKey,
  claimNextDistributionPublications,
  DISTRIBUTION_ENGINE_BOUNDARIES,
  enqueueDistributionForApprovedOffer,
  evaluateDistributionEligibility,
  evaluateDistributionEligibilityFromSnapshot,
  isDistributionEngineEnabled,
  isOfferSnapshotDistributable,
} from '@/lib/distribution';

const OFFER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const OFF_ENV = {} as NodeJS.ProcessEnv;
const ON_ENV = { DISTRIBUTION_ENGINE_ENABLED: 'true' } as NodeJS.ProcessEnv;

function offerChain(row: {
  id: string;
  status: string;
  expires_at: string | null;
  category?: string | null;
  coupons?: string | null;
  bank_coupon?: string | null;
}) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      })),
    })),
  };
}

describe('Distribution C2 — evaluateDistributionEligibilityFromSnapshot', () => {
  it('1. pending → PENDING (not eligible)', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'pending', expires_at: null },
      { env: ON_ENV, requireEngineEnabled: true },
    );
    expect(r.decision).toBe('PENDING');
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('pending_not_distributable');
  });

  it('2. approved → ELIGIBLE', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'approved', expires_at: null },
      { env: ON_ENV, requireEngineEnabled: true },
    );
    expect(r.decision).toBe('ELIGIBLE');
    expect(r.eligible).toBe(true);
  });

  it('3. rejected → REJECTED', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'rejected', expires_at: null },
      { env: ON_ENV },
    );
    expect(r.decision).toBe('REJECTED');
    expect(r.eligible).toBe(false);
  });

  it('4. expired approved → EXPIRED', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'approved', expires_at: past },
      { env: ON_ENV },
    );
    expect(r.decision).toBe('EXPIRED');
    expect(r.eligible).toBe(false);
  });

  it('5. missing offer → OFFER_MISSING', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(null, { env: ON_ENV });
    expect(r.decision).toBe('OFFER_MISSING');
    expect(r.eligible).toBe(false);
  });

  it('6. distribution disabled → DISTRIBUTION_DISABLED', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'approved', expires_at: null },
      { env: OFF_ENV, requireEngineEnabled: true },
    );
    expect(r.decision).toBe('DISTRIBUTION_DISABLED');
    expect(r.eligible).toBe(false);
  });

  it('9. high DealScore + pending → PENDING (DealScore ignored)', () => {
    // Eligibility API has no DealScore parameter — pending status alone decides.
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'pending', expires_at: null },
      { env: ON_ENV },
    );
    expect(r.decision).toBe('PENDING');
    expect(r.eligible).toBe(false);
  });

  it('10. WOULD_INSERT + pending → PENDING (gateAction ignored)', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'pending', expires_at: null },
      { env: ON_ENV },
    );
    expect(r.decision).toBe('PENDING');
    expect(isOfferSnapshotDistributable({ status: 'pending', expires_at: null }).ok).toBe(
      false,
    );
  });

  it('11. machine offer approved → ELIGIBLE (origin irrelevant)', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'approved', expires_at: null },
      { env: ON_ENV },
    );
    expect(r.decision).toBe('ELIGIBLE');
  });

  it('12. UGC offer approved → ELIGIBLE (origin irrelevant)', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'Approved', expires_at: null },
      { env: ON_ENV },
    );
    expect(r.decision).toBe('ELIGIBLE');
    expect(r.status).toBe('approved');
  });

  it('published live → ELIGIBLE (legacy live status)', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'published', expires_at: null },
      { env: ON_ENV },
    );
    expect(r.decision).toBe('ELIGIBLE');
  });

  it('unknown status → NOT_APPROVED', () => {
    const r = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'draft', expires_at: null },
      { env: ON_ENV },
    );
    expect(r.decision).toBe('NOT_APPROVED');
  });
});

describe('Distribution C2 — server eligibility (DB authority)', () => {
  it('5b. missing offer id / row → NOT_ELIGIBLE', async () => {
    const empty = await evaluateDistributionEligibility({
      offerId: '',
      env: ON_ENV,
      supabase: { from: vi.fn() } as never,
    });
    expect(empty.decision).toBe('INVALID_OFFER');

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    };
    const missing = await evaluateDistributionEligibility({
      offerId: OFFER_ID,
      env: ON_ENV,
      supabase: supabase as never,
    });
    expect(missing.decision).toBe('OFFER_MISSING');
    expect(missing.eligible).toBe(false);
  });

  it('7. already distributed → ALREADY_DISTRIBUTED', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return offerChain({
            id: OFFER_ID,
            status: 'approved',
            expires_at: null,
            category: 'tecnologia',
            coupons: null,
            bank_coupon: null,
          });
        }
        if (table === 'distribution_publications') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: PUB_ID, status: 'published' },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(table);
      }),
    };
    const r = await evaluateDistributionEligibility({
      offerId: OFFER_ID,
      destinationId: DEST_ID,
      distributionVersion: 1,
      env: ON_ENV,
      supabase: supabase as never,
    });
    expect(r.decision).toBe('ALREADY_DISTRIBUTED');
    expect(r.eligible).toBe(false);
  });

  it('8. forged client approval cannot bypass DB pending', async () => {
    // Caller cannot pass status — only offerId. DB returns pending.
    const supabase = {
      from: vi.fn(() =>
        offerChain({
          id: OFFER_ID,
          status: 'pending',
          expires_at: null,
        }),
      ),
    };
    const r = await evaluateDistributionEligibility({
      offerId: OFFER_ID,
      env: ON_ENV,
      supabase: supabase as never,
    });
    expect(r.decision).toBe('PENDING');
    expect(r.eligible).toBe(false);
    // Prove eligibility source never accepts a client status field.
    const src = readFileSync(
      join(process.cwd(), 'lib/distribution/eligibility.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/input\.status/);
    expect(src).not.toMatch(/clientStatus|forgedStatus|claimedStatus/);
    expect(src).toMatch(/select\('id, status, expires_at/);
  });

  it('loads offers.status from DB — never bot_meta / DealScore', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/distribution/eligibility.ts'),
      'utf8',
    );
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/bot_meta|botMeta|DealScore|dealScore|wouldInsert|gateAction|qualityDecision/);
    expect(src).toMatch(/\.from\('offers'\)/);
    expect(src).toMatch(/select\('id, status, expires_at/);
  });
});

describe('Distribution C2 — pending cannot enqueue (zero side effects)', () => {
  it('pending → enqueue not_distributable + no destinations/publications writes', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'offers') {
        return offerChain({
          id: OFFER_ID,
          status: 'pending',
          expires_at: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });
    const result = await enqueueDistributionForApprovedOffer(OFFER_ID, {
      supabase: { from } as never,
      env: ON_ENV,
    });
    expect(result).toMatchObject({
      ok: true,
      skipped: 'not_distributable',
    });
    if (result.ok && 'reason' in result) {
      expect(result.reason).toMatch(/^PENDING:/);
    }
    const tables = from.mock.calls.map((c) => c[0]);
    expect(tables.every((t) => t === 'offers')).toBe(true);
    expect(tables).not.toContain('distribution_destinations');
    expect(tables).not.toContain('distribution_publications');
    expect(tables).not.toContain('distribution_events');
  });

  it('assertNotPendingForDistribution throws on pending', () => {
    expect(() => assertNotPendingForDistribution('pending')).toThrow(
      /DISTRIBUTION_C2: pending/,
    );
    expect(() => assertNotPendingForDistribution('approved')).not.toThrow();
  });

  it('2b. approved → enqueue can create publications (dry mock, no Telegram)', async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return offerChain({
            id: OFFER_ID,
            status: 'approved',
            expires_at: null,
            category: 'tecnologia',
            coupons: null,
            bank_coupon: null,
          });
        }
        if (table === 'distribution_destinations') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [
                  {
                    id: DEST_ID,
                    brand_id: 'b1',
                    provider: 'telegram',
                    slug: 'telegram-general',
                    display_name: 'General',
                    external_destination_key: '-1001',
                    credential_ref: null,
                    status: 'active',
                    kind: 'general',
                    category_ids: [],
                    tracking_campaign_key: 'tg-general',
                  },
                ],
                error: null,
              })),
            })),
          };
        }
        if (table === 'distribution_publications') {
          return {
            insert: vi.fn((payload: unknown) => {
              inserts.push(payload);
              return {
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: PUB_ID },
                    error: null,
                  })),
                })),
              };
            }),
          };
        }
        if (table === 'distribution_events') {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        throw new Error(table);
      }),
    };

    const result = await enqueueDistributionForApprovedOffer(OFFER_ID, {
      supabase: supabase as never,
      env: ON_ENV,
    });
    expect(result).toMatchObject({ ok: true, created: 1, reused: 0 });
    expect(inserts).toHaveLength(1);
    expect((inserts[0] as { status: string }).status).toBe('pending');
    const enqSrc = readFileSync(join(process.cwd(), 'lib/distribution/enqueue.ts'), 'utf8');
    expect(enqSrc).toContain('evaluateDistributionEligibility');
    expect(enqSrc).toContain('assertNotPendingForDistribution');
    expect(enqSrc).not.toContain('api.telegram.org');
    expect(enqSrc).not.toContain('sendMessage');
  });
});

describe('Distribution C2 — flag OFF / isolation / concurrency', () => {
  it('16. distribution OFF → zero external side effects', async () => {
    expect(isDistributionEngineEnabled({})).toBe(false);
    const from = vi.fn();
    const result = await enqueueDistributionForApprovedOffer(OFFER_ID, {
      supabase: { from } as never,
      env: OFF_ENV,
    });
    expect(result).toEqual({ ok: true, skipped: 'flag_disabled' });
    expect(from).not.toHaveBeenCalled();
  });

  it('13. concurrent claim → exactly one CAS win', async () => {
    let publishingHeld = false;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'distribution_publications') throw new Error(table);
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              or: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: [
                      {
                        id: PUB_ID,
                        offer_id: OFFER_ID,
                        destination_id: DEST_ID,
                        status: 'pending',
                        provider: 'telegram',
                        attempt_count: 0,
                        external_destination_key: '-1',
                        tracking_campaign_key: 'tg',
                        idempotency_key: buildDistributionIdempotencyKey({
                          offerId: OFFER_ID,
                          destinationId: DEST_ID,
                          distributionVersion: 1,
                        }),
                        external_message_id: null,
                        next_attempt_at: null,
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    if (publishingHeld) {
                      return { data: null, error: null };
                    }
                    publishingHeld = true;
                    return {
                      data: {
                        id: PUB_ID,
                        offer_id: OFFER_ID,
                        destination_id: DEST_ID,
                        status: 'publishing',
                        provider: 'telegram',
                        attempt_count: 1,
                        external_destination_key: '-1',
                        tracking_campaign_key: 'tg',
                        idempotency_key: `${OFFER_ID}:${DEST_ID}:v1`,
                        external_message_id: null,
                      },
                      error: null,
                    };
                  }),
                })),
              })),
            })),
          })),
        };
      }),
    };

    // Append event path for winner
    const eventsInsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_events') {
          return { insert: eventsInsert };
        }
        return supabase.from(table);
      }),
    };

    const [a, b] = await Promise.all([
      claimNextDistributionPublications(client as never, { limit: 1 }),
      claimNextDistributionPublications(client as never, { limit: 1 }),
    ]);
    const wins = [...a, ...b];
    expect(wins).toHaveLength(1);
    expect(wins[0]?.id).toBe(PUB_ID);
  });

  it('15. retry after success identity is stable (no new logical key)', () => {
    const k1 = buildDistributionIdempotencyKey({
      offerId: OFFER_ID,
      destinationId: DEST_ID,
      distributionVersion: 1,
    });
    const k2 = buildDistributionIdempotencyKey({
      offerId: OFFER_ID,
      destinationId: DEST_ID,
      distributionVersion: 1,
    });
    expect(k1).toBe(k2);
    expect(k1).toBe(`${OFFER_ID}:${DEST_ID}:v1`);
  });

  it('14. retryable semantics documented in publication statuses (no DELETE rollback)', () => {
    const claimSrc = readFileSync(join(process.cwd(), 'lib/distribution/claim.ts'), 'utf8');
    expect(claimSrc).toContain("'pending', 'retryable'");
    expect(claimSrc).not.toMatch(/\.delete\(/);
    const drainSrc = readFileSync(join(process.cwd(), 'lib/distribution/drain.ts'), 'utf8');
    expect(drainSrc).toContain('retryable');
    expect(drainSrc).not.toMatch(/\.delete\(/);
  });

  it('12-isolation: UGC POST /api/offers untouched by C2 eligibility', () => {
    const offersRoute = readFileSync(
      join(process.cwd(), 'app/api/offers/route.ts'),
      'utf8',
    );
    expect(offersRoute).not.toContain('lib/distribution');
    expect(offersRoute).not.toContain('evaluateDistributionEligibility');
  });

  it('14-isolation: supply / rewards / economy / attribution not imported by C2 core', () => {
    for (const file of [
      'lib/distribution/eligibility.ts',
      'lib/distribution/enqueue.ts',
      'lib/distribution/drain.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src).not.toContain('candidateInsertGate');
      expect(src).not.toContain('lib/rewards');
      expect(src).not.toContain('lib/economy');
      expect(src).not.toContain('recordAttributedClick');
      expect(src).not.toContain('hunter_supply');
    }
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.modifiesSupplyWrite).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.writesRewards).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.modifiesAttribution).toBe(false);
  });

  it('state boundary: never PENDING → DISTRIBUTED in eligibility', () => {
    const pending = evaluateDistributionEligibilityFromSnapshot(
      { id: OFFER_ID, status: 'pending', expires_at: null },
      { env: ON_ENV },
    );
    expect(pending.eligible).toBe(false);
    expect(pending.decision).not.toBe('ELIGIBLE');
    expect(pending.decision).not.toBe('ALREADY_DISTRIBUTED');
  });
});
