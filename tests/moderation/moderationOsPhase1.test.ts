import { describe, expect, it, vi } from 'vitest';
import { releaseStaleModerationLocks } from '@/lib/moderation/releaseStaleLocks';
import { writeModerationAudit } from '@/lib/moderation/writeModerationAudit';
import { buildModeratorThroughput } from '@/lib/moderation/moderatorMetrics';
import {
  assertModeratorOwnsLock,
  moderatorOwnsActiveLock,
  tryAcquireModerationLock,
} from '@/lib/moderation/atomicModerationLock';
import { MODERATION_LOCK_STALE_MS } from '@/lib/moderation/moderationLock';
import { sortPendingOffersForModeration } from '@/lib/moderation/sortPendingOffers';
import { evaluateModerationPriority } from '@/lib/moderation/moderationPriority';

function mockReleaseClient(opts: {
  staleRows?: Array<{ id: string; locked_by: string | null; locked_at: string | null }>;
  updatedIds?: string[];
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const staleRows = opts.staleRows ?? [];
  const updatedIds = opts.updatedIds ?? staleRows.map((r) => r.id);
  const inserts: unknown[] = [];

  const offersChain: Record<string, unknown> = {};
  const oself = () => offersChain;
  offersChain.select = vi.fn(() => oself());
  offersChain.eq = vi.fn(() => oself());
  offersChain.not = vi.fn(() => oself());
  offersChain.lt = vi.fn(() => oself());
  offersChain.limit = vi.fn(async () => ({
    data: staleRows,
    error: opts.selectError ?? null,
  }));
  offersChain.update = vi.fn(() => {
    const updateChain: Record<string, unknown> = {};
    const uself = () => updateChain;
    updateChain.in = vi.fn(() => uself());
    updateChain.eq = vi.fn(() => uself());
    updateChain.lt = vi.fn(() => uself());
    updateChain.select = vi.fn(async () => ({
      data: updatedIds.map((id) => ({ id })),
      error: opts.updateError ?? null,
    }));
    return updateChain;
  });

  const logsChain: Record<string, unknown> = {};
  logsChain.insert = vi.fn(async (row: unknown) => {
    inserts.push(row);
    return { error: null };
  });

  return {
    inserts,
    from: vi.fn((table: string) => {
      if (table === 'moderation_logs') return logsChain;
      return offersChain;
    }),
  };
}

describe('FASE 1 — reclaim + audit', () => {
  it('libera locks stale y escribe audit lock_reclaimed_stale', async () => {
    const lockedAt = new Date(Date.now() - MODERATION_LOCK_STALE_MS - 10_000).toISOString();
    const client = mockReleaseClient({
      staleRows: [
        { id: 'offer-a', locked_by: 'mod-a', locked_at: lockedAt },
        { id: 'offer-b', locked_by: 'mod-b', locked_at: lockedAt },
      ],
    });

    const result = await releaseStaleModerationLocks(client as never, {
      limit: 50,
      actorUserId: 'admin-1',
    });

    expect(result.released).toBe(2);
    expect(result.audited).toBe(2);
    expect(result.offerIds).toEqual(['offer-a', 'offer-b']);
    expect(client.inserts).toHaveLength(2);
    expect(client.inserts[0]).toMatchObject({
      offer_id: 'offer-a',
      action: 'lock_reclaimed_stale',
      previous_status: 'pending',
      new_status: 'pending',
      reason: 'lease_expired',
      user_id: 'admin-1',
    });
  });

  it('idempotente cuando no hay stale', async () => {
    const client = mockReleaseClient({ staleRows: [] });
    const result = await releaseStaleModerationLocks(client as never);
    expect(result.released).toBe(0);
    expect(result.audited).toBe(0);
    expect(client.inserts).toHaveLength(0);
  });
});

describe('FASE 1 — writeModerationAudit', () => {
  it('rechaza offerId vacío', async () => {
    const supabase = { from: vi.fn() };
    const r = await writeModerationAudit(supabase as never, {
      offerId: '  ',
      userId: 'u1',
      action: 'claim',
    });
    expect(r.ok).toBe(false);
  });

  it('inserta fila de auditoría', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };
    const r = await writeModerationAudit(supabase as never, {
      offerId: 'o1',
      userId: 'u1',
      action: 'claim',
      previousStatus: 'pending',
      newStatus: 'pending',
    });
    expect(r.ok).toBe(true);
    expect(insert).toHaveBeenCalled();
  });
});

describe('FASE 1 — ownership / claim rules', () => {
  const now = new Date().toISOString();

  it('dos moderadores: B no puede decidir lock de A', () => {
    const r = assertModeratorOwnsLock({ locked_by: 'mod-a', locked_at: now }, 'mod-b');
    expect(r.ok).toBe(false);
  });

  it('approve sin ownership falla', () => {
    const r = assertModeratorOwnsLock({ locked_by: null, locked_at: null }, 'mod-a');
    expect(r.ok).toBe(false);
  });

  it('approve con ownership válido funciona', () => {
    expect(assertModeratorOwnsLock({ locked_by: 'mod-a', locked_at: now }, 'mod-a').ok).toBe(true);
  });

  it('lease expirado permite reclaim (ownership stale)', () => {
    const stale = new Date(Date.now() - MODERATION_LOCK_STALE_MS - 1000).toISOString();
    expect(moderatorOwnsActiveLock({ locked_by: 'mod-a', locked_at: stale }, 'mod-a')).toBe(false);
  });

  it('claim repetido (mismo moderador) es elegible en tryAcquire filtro', async () => {
    // Simula UPDATE condicional: locked_by.eq.moderator → claimed true
    const select = vi.fn(async () => ({ data: { id: 'o1' }, error: null }));
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.update = vi.fn(() => self());
    chain.eq = vi.fn(() => self());
    chain.or = vi.fn(() => self());
    chain.select = vi.fn(() => self());
    chain.maybeSingle = select;
    const supabase = { from: vi.fn(() => chain) };

    const r = await tryAcquireModerationLock(supabase as never, 'o1', 'mod-a');
    expect(r.claimed).toBe(true);
  });
});

describe('FASE 1 — priority ordering', () => {
  it('P1 high-value ordena antes que low-value', () => {
    const now = Date.now();
    const high = {
      id: 'h',
      created_at: new Date(now).toISOString(),
      price: 899,
      original_price: 1899,
      image_url: 'https://example.com/img.jpg',
      is_bot: true,
      category: 'belleza',
      snoozed_until: null,
      bot_meta: {
        signals: {
          historyReady: true,
          effectiveDiscountPercent: 40,
          savingsVsHabitualPct: 25,
          priceLowest90d: 850,
          priceVsLowest90dPct: -2,
          suspectedArtificialListPrice: false,
        },
        dealQuality: { decision: 'VERIFIED_DEAL' },
      },
    };
    const low = {
      id: 'l',
      created_at: new Date(now).toISOString(),
      price: 49,
      original_price: 55,
      image_url: null,
      is_bot: true,
      category: 'other',
      snoozed_until: null,
      bot_meta: {
        signals: {
          suspectedArtificialListPrice: true,
          effectiveDiscountPercent: 0,
          historyReady: false,
        },
        dealQuality: { decision: 'NO_VERIFIED_DEAL' },
      },
    };

    const pHigh = evaluateModerationPriority({
      price: high.price,
      originalPrice: high.original_price,
      imageUrl: high.image_url,
      isBot: true,
      createdAt: high.created_at,
      botMeta: high.bot_meta,
      nowMs: now,
    });
    const pLow = evaluateModerationPriority({
      price: low.price,
      originalPrice: low.original_price,
      imageUrl: low.image_url,
      isBot: true,
      createdAt: low.created_at,
      botMeta: low.bot_meta,
      nowMs: now,
    });
    expect(pHigh.rank).toBeLessThanOrEqual(pLow.rank);

    const sorted = sortPendingOffersForModeration([low, high] as never);
    expect(sorted.map((o) => o.id)[0]).toBe('h');
  });
});

describe('FASE 1 — moderator metrics', () => {
  it('agrega approved/rejected/reclaimed por moderador', async () => {
    const rows = [
      { user_id: 'm1', action: 'approved' },
      { user_id: 'm1', action: 'rejected' },
      { user_id: 'm2', action: 'approved' },
      { user_id: null, action: 'lock_reclaimed_stale' },
    ];
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          gte: vi.fn(() => ({
            lte: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: rows, error: null })),
            })),
          })),
        })),
      })),
    };

    const snap = await buildModeratorThroughput(supabase as never);
    expect(snap.totals.approved).toBe(2);
    expect(snap.totals.rejected).toBe(1);
    expect(snap.totals.reclaimed).toBe(1);
    expect(snap.byModerator.find((r) => r.moderatorId === 'm1')?.decisions).toBe(2);
  });
});

describe('FASE 1 — safety boundaries', () => {
  it('mobile replace-link → approve loop contract intacto', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const approve = fs.readFileSync(
      path.resolve(process.cwd(), 'app/api/admin/moderate-offer/route.ts'),
      'utf8',
    );
    const update = fs.readFileSync(
      path.resolve(process.cwd(), 'app/api/admin/update-offer/route.ts'),
      'utf8',
    );
    expect(approve).toMatch(/assertModeratorOwnsLock/);
    expect(approve).toMatch(/assertOfferReadyForAffiliateApproval/);
    expect(update).toMatch(/assertModeratorOwnsLock/);
  });

  it('Supply WRITE / DQE / Deal Score thresholds untouched by this change set', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dealSignals = fs.readFileSync(
      path.resolve(process.cwd(), 'lib/hunter/supply/dealSignals.ts'),
      'utf8',
    );
    const engine = fs.readFileSync(
      path.resolve(process.cwd(), 'lib/hunter/supply/engine.ts'),
      'utf8',
    );
    expect(dealSignals).toMatch(/priceClass === 'false_discount'/);
    expect(dealSignals).toMatch(/Math\.min\(score, 35\)/);
    expect(engine).toMatch(/deal\.dealScore >= 35/);
    expect(engine).toMatch(/SUPPLY_ENGINE_WRITE/);
  });
});
