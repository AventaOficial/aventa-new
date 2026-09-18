/**
 * Distribution Engine P0-D1 — foundation contract tests.
 * No Telegram/WhatsApp. No money/Supply/attribution mutations.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISTRIBUTION_ENGINE_BOUNDARIES,
  buildDistributionIdempotencyKey,
  buildDistributionTrackingContext,
  enqueueDistributionForApprovedOffer,
  isDistributionEngineEnabled,
  isOfferSnapshotDistributable,
  resolveEligibleDestinations,
  assertDistributionMoneyUntouched,
  assertDistributionDoesNotApprove,
  assertDistributionDoesNotPublishProviders,
  assertDealIntelligencePublicationUnchanged,
  assertFlagFailClosedWhenUnset,
  type DistributionDestinationRow,
} from '@/lib/distribution';
import { DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY } from '@/lib/dealIntelligence/constants';
import { ECONOMIC_LEDGER_BOUNDARY } from '@/lib/economy/types';

describe('Distribution Engine — feature flag', () => {
  it('defaults OFF when unset', () => {
    expect(isDistributionEngineEnabled({})).toBe(false);
    assertFlagFailClosedWhenUnset({});
  });

  it('disabled flag prevents distribution work', async () => {
    const supabase = { from: vi.fn() };
    const result = await enqueueDistributionForApprovedOffer(
      '11111111-1111-1111-1111-111111111111',
      {
        supabase: supabase as never,
        env: {},
      },
    );
    expect(result).toEqual({ ok: true, skipped: 'flag_disabled' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('enables only on 1/true/yes', () => {
    expect(isDistributionEngineEnabled({ DISTRIBUTION_ENGINE_ENABLED: 'true' })).toBe(true);
    expect(isDistributionEngineEnabled({ DISTRIBUTION_ENGINE_ENABLED: '1' })).toBe(true);
    expect(isDistributionEngineEnabled({ DISTRIBUTION_ENGINE_ENABLED: 'yes' })).toBe(true);
    expect(isDistributionEngineEnabled({ DISTRIBUTION_ENGINE_ENABLED: 'false' })).toBe(false);
  });
});

describe('Distribution Engine — eligibility', () => {
  it('pending offer cannot create publication', () => {
    expect(isOfferSnapshotDistributable({ status: 'pending', expires_at: null }).ok).toBe(
      false,
    );
  });

  it('rejected offer cannot create publication', () => {
    expect(isOfferSnapshotDistributable({ status: 'rejected', expires_at: null }).ok).toBe(
      false,
    );
  });

  it('approved live offer can create publication', () => {
    expect(isOfferSnapshotDistributable({ status: 'approved', expires_at: null }).ok).toBe(
      true,
    );
  });

  it('expired offer cannot create new publication', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const r = isOfferSnapshotDistributable({ status: 'approved', expires_at: past });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });
});

describe('Distribution Engine — routing', () => {
  const general: DistributionDestinationRow = {
    id: 'd-general',
    brand_id: 'b1',
    provider: 'telegram',
    slug: 'telegram-general',
    display_name: 'General',
    external_destination_key: '-1001',
    credential_ref: 'TELEGRAM_BOT_TOKEN_A',
    status: 'active',
    kind: 'general',
    category_ids: [],
    tracking_campaign_key: 'tg-general',
  };
  const tech: DistributionDestinationRow = {
    ...general,
    id: 'd-tech',
    slug: 'telegram-tecnologia',
    display_name: 'Technology',
    external_destination_key: '-1002',
    kind: 'category',
    category_ids: ['tecnologia', 'gaming'],
    tracking_campaign_key: 'tg-tech',
  };
  const home: DistributionDestinationRow = {
    ...general,
    id: 'd-home',
    slug: 'telegram-hogar',
    display_name: 'Home',
    external_destination_key: '-1003',
    kind: 'category',
    category_ids: ['hogar', 'jardin'],
    tracking_campaign_key: 'tg-home',
  };
  const coupons: DistributionDestinationRow = {
    ...general,
    id: 'd-coupons',
    slug: 'telegram-coupons',
    display_name: 'Coupons',
    external_destination_key: '-1004',
    kind: 'coupons',
    category_ids: [],
    tracking_campaign_key: 'tg-coupons',
  };
  const paused: DistributionDestinationRow = {
    ...tech,
    id: 'd-paused',
    status: 'paused',
    external_destination_key: '-1099',
  };

  it('technology → general + technology', () => {
    const eligible = resolveEligibleDestinations({
      offer: { category: 'tecnologia', coupons: null, bank_coupon: null },
      destinations: [general, tech, home, coupons, paused],
    });
    expect(eligible.map((d) => d.id).sort()).toEqual(['d-general', 'd-tech']);
  });

  it('home → general + home', () => {
    const eligible = resolveEligibleDestinations({
      offer: { category: 'hogar', coupons: null, bank_coupon: null },
      destinations: [general, tech, home, coupons],
    });
    expect(eligible.map((d) => d.id).sort()).toEqual(['d-general', 'd-home']);
  });

  it('coupons → general + coupons', () => {
    const eligible = resolveEligibleDestinations({
      offer: { category: 'other', coupons: 'BBVA10', bank_coupon: null },
      destinations: [general, tech, home, coupons],
    });
    expect(eligible.map((d) => d.id).sort()).toEqual(['d-coupons', 'd-general']);
  });

  it('ignores non-active destinations', () => {
    const eligible = resolveEligibleDestinations({
      offer: { category: 'tecnologia', coupons: null, bank_coupon: null },
      destinations: [paused],
    });
    expect(eligible).toEqual([]);
  });
});

describe('Distribution Engine — idempotency', () => {
  it('key is deterministic for offer+destination+version', () => {
    const a = buildDistributionIdempotencyKey({
      offerId: 'o1',
      destinationId: 'd1',
      distributionVersion: 1,
    });
    const b = buildDistributionIdempotencyKey({
      offerId: 'o1',
      destinationId: 'd1',
      distributionVersion: 1,
    });
    expect(a).toBe('o1:d1:v1');
    expect(a).toBe(b);
  });

  it('version bump changes key', () => {
    const v1 = buildDistributionIdempotencyKey({
      offerId: 'o1',
      destinationId: 'd1',
      distributionVersion: 1,
    });
    const v2 = buildDistributionIdempotencyKey({
      offerId: 'o1',
      destinationId: 'd1',
      distributionVersion: 2,
    });
    expect(v1).not.toBe(v2);
  });
});

/** Chainable mock matching isOfferTrackable + offer snapshot selects. */
function mockOfferFrom(opts: {
  offerStatus: string;
  expiresAt?: string | null;
  category?: string | null;
  coupons?: string | null;
  offerId: string;
}) {
  const live =
    (opts.offerStatus === 'approved' || opts.offerStatus === 'published') &&
    !(opts.expiresAt && Date.parse(opts.expiresAt) < Date.now());

  const maybeSingleTrackable = vi.fn(async () => ({
    data: live ? { id: opts.offerId } : null,
    error: null,
  }));
  const maybeSingleSnapshot = vi.fn(async () => ({
    data: {
      id: opts.offerId,
      status: opts.offerStatus,
      expires_at: opts.expiresAt ?? null,
      category: opts.category ?? 'tecnologia',
      coupons: opts.coupons ?? null,
      bank_coupon: null,
    },
    error: null,
  }));

  // isOfferTrackable: select().eq().or().or().maybeSingle()
  // enqueue snapshot: select().eq().maybeSingle()
  const or2 = { or: vi.fn(() => ({ maybeSingle: maybeSingleTrackable })) };
  const afterEq = {
    or: vi.fn(() => or2),
    maybeSingle: maybeSingleSnapshot,
  };
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => afterEq),
    })),
  };
}

describe('Distribution Engine — enqueue + uniqueness', () => {
  const OFFER_ID = '11111111-1111-1111-1111-111111111111';
  const DEST_ID = '22222222-2222-2222-2222-222222222222';
  const PUB_ID = '33333333-3333-3333-3333-333333333333';
  const DEST_TECH = '44444444-4444-4444-4444-444444444444';

  const activeDestinations = [
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
    {
      id: DEST_TECH,
      brand_id: 'b1',
      provider: 'telegram',
      slug: 'telegram-tecnologia',
      display_name: 'Tech',
      external_destination_key: '-1002',
      credential_ref: null,
      status: 'active',
      kind: 'category',
      category_ids: ['tecnologia'],
      tracking_campaign_key: 'tg-tech',
    },
  ];

  it('pending offer enqueue skips (not distributable)', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return mockOfferFrom({ offerStatus: 'pending', offerId: OFFER_ID });
        }
        throw new Error(table);
      }),
    };
    const result = await enqueueDistributionForApprovedOffer(OFFER_ID, {
      supabase: supabase as never,
      env: { DISTRIBUTION_ENGINE_ENABLED: 'true' },
    });
    expect(result.ok).toBe(true);
    if (result.ok && 'skipped' in result) {
      expect(result.skipped).toBe('not_distributable');
    }
  });

  it('rejected offer enqueue skips', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return mockOfferFrom({ offerStatus: 'rejected', offerId: OFFER_ID });
        }
        throw new Error(table);
      }),
    };
    const result = await enqueueDistributionForApprovedOffer(OFFER_ID, {
      supabase: supabase as never,
      env: { DISTRIBUTION_ENGINE_ENABLED: 'true' },
    });
    expect(result.ok && 'skipped' in result && result.skipped).toBe('not_distributable');
  });

  it('expired offer enqueue skips', async () => {
    const past = new Date(Date.now() - 120_000).toISOString();
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return mockOfferFrom({
            offerStatus: 'approved',
            expiresAt: past,
            offerId: OFFER_ID,
          });
        }
        throw new Error(table);
      }),
    };
    const result = await enqueueDistributionForApprovedOffer(OFFER_ID, {
      supabase: supabase as never,
      env: { DISTRIBUTION_ENGINE_ENABLED: 'true' },
    });
    expect(result.ok && 'skipped' in result && result.skipped).toBe('not_distributable');
  });

  it('approved live offer creates publications for multiple destinations (same offer)', async () => {
    const inserts: unknown[] = [];
    let publicationInserts = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return mockOfferFrom({
            offerStatus: 'approved',
            category: 'tecnologia',
            offerId: OFFER_ID,
          });
        }
        if (table === 'distribution_destinations') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: activeDestinations, error: null })),
            })),
          };
        }
        if (table === 'distribution_publications') {
          return {
            insert: vi.fn((payload: unknown) => {
              inserts.push(payload);
              publicationInserts += 1;
              return {
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: `${PUB_ID}-${publicationInserts}` },
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
        throw new Error(`unexpected ${table}`);
      }),
    };

    const result = await enqueueDistributionForApprovedOffer(OFFER_ID, {
      supabase: supabase as never,
      env: { DISTRIBUTION_ENGINE_ENABLED: 'true' },
    });
    expect(result).toMatchObject({ ok: true, created: 2, reused: 0 });
    expect(inserts).toHaveLength(2);
    for (const row of inserts as Array<{ offer_id: string }>) {
      expect(row.offer_id).toBe(OFFER_ID);
    }
  });

  it('duplicate publication is treated as idempotent reuse', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return mockOfferFrom({
            offerStatus: 'approved',
            category: 'other',
            offerId: OFFER_ID,
          });
        }
        if (table === 'distribution_destinations') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [activeDestinations[0]],
                error: null,
              })),
            })),
          };
        }
        if (table === 'distribution_publications') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: null,
                  error: { code: '23505', message: 'duplicate key value' },
                })),
              })),
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: PUB_ID },
                  error: null,
                })),
              })),
            })),
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
      env: { DISTRIBUTION_ENGINE_ENABLED: 'true' },
    });
    expect(result).toMatchObject({ ok: true, created: 0, reused: 1 });
  });

  it('concurrent creation path is idempotent (unique then select)', async () => {
    const makeClient = () => ({
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return mockOfferFrom({
            offerStatus: 'approved',
            category: null,
            offerId: OFFER_ID,
          });
        }
        if (table === 'distribution_destinations') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [activeDestinations[0]],
                error: null,
              })),
            })),
          };
        }
        if (table === 'distribution_publications') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: null,
                  error: { code: '23505', message: 'unique' },
                })),
              })),
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: PUB_ID }, error: null })),
              })),
            })),
          };
        }
        if (table === 'distribution_events') {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        throw new Error(table);
      }),
    });

    const a = await enqueueDistributionForApprovedOffer(OFFER_ID, {
      supabase: makeClient() as never,
      env: { DISTRIBUTION_ENGINE_ENABLED: 'true' },
    });
    const b = await enqueueDistributionForApprovedOffer(OFFER_ID, {
      supabase: makeClient() as never,
      env: { DISTRIBUTION_ENGINE_ENABLED: 'true' },
    });
    expect(a).toMatchObject({ ok: true, reused: 1 });
    expect(b).toMatchObject({ ok: true, reused: 1 });
  });
});

describe('Distribution Engine — boundaries', () => {
  it('does not modify moderation / money / supply / attribution flags', () => {
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.modifiesModerationState).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.approvesOffers).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.clonesOffers).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.modifiesAttribution).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.modifiesSupplyWrite).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.secondClickPath).toBe(false);
    assertDistributionMoneyUntouched();
    assertDistributionDoesNotApprove();
    assertDistributionDoesNotPublishProviders();
    assertDealIntelligencePublicationUnchanged();
    expect(DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY.autoPublish).toBe(false);
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);
  });

  it('tracking context is metadata only (no click_id path)', () => {
    const ctx = buildDistributionTrackingContext({
      publicationId: 'p1',
      offerId: 'o1',
      destinationId: 'd1',
      provider: 'telegram',
      campaignKey: 'tg-general',
    });
    expect(ctx.source).toBe('distribution');
    expect(ctx).not.toHaveProperty('clickId');
    expect(ctx).not.toHaveProperty('conversionId');
  });

  it('migration enforces DB uniqueness and RLS service_role', () => {
    const sql = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/20260917_distribution_engine_foundation.sql'),
      'utf8',
    );
    expect(sql).toContain('distribution_publications_offer_dest_version_unique');
    expect(sql).toContain('UNIQUE (offer_id, destination_id, distribution_version)');
    expect(sql).toContain(
      'GRANT ALL ON TABLE public.distribution_publications TO service_role',
    );
    expect(sql).toContain(
      'REVOKE ALL ON TABLE public.distribution_publications FROM anon',
    );
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*FOR INSERT[\s\S]*authenticated/);
    expect(sql).not.toContain('affiliate_ledger');
    expect(sql).not.toContain('hunter_supply');
    expect(sql).not.toContain('reward_outbound_clicks');
  });

  it('enqueue source does not reference money or supply tables', () => {
    const src = readFileSync(join(process.cwd(), 'lib/distribution/enqueue.ts'), 'utf8');
    expect(src).not.toContain('affiliate_ledger');
    expect(src).not.toContain('ledger_settlements');
    expect(src).not.toContain('reward_balances');
    expect(src).not.toContain('hunter_supply');
    expect(src).not.toContain('recordAttributedClick');
    expect(src).not.toContain('sendMessage');
    expect(src).not.toContain('api.telegram');
  });

  it('moderate-offer only fire-and-forgets enqueue (no provider)', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/admin/moderate-offer/route.ts'),
      'utf8',
    );
    expect(src).toContain('enqueueDistributionForApprovedOfferFireAndForget');
    expect(src).not.toContain('api.telegram.org');
  });
});
