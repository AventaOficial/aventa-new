import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateModerationPriority,
  expiresAtOnApprove,
  createdAtOnApprove,
  type ModerationPriorityInput,
} from '@/lib/moderation/moderationPriority';
import { sortPendingOffersForModeration } from '@/lib/moderation/sortPendingOffers';

const IMG = 'https://http2.mlstatic.com/D_NQ_NP_2X_123-O.jpg';
const NOW = new Date('2026-09-14T12:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function botMeta(signals: Record<string, unknown>, dealQuality?: Record<string, unknown>) {
  return {
    v: 1,
    source: 'ml_worker',
    signals,
    ...(dealQuality ? { dealQuality } : {}),
  };
}

function input(over: Partial<ModerationPriorityInput> = {}): ModerationPriorityInput {
  return {
    price: 799,
    originalPrice: 1299,
    imageUrl: IMG,
    isBot: true,
    createdAt: hoursAgo(2),
    nowMs: NOW,
    ...over,
  };
}

describe('evaluateModerationPriority', () => {
  it('strong evidence + effective positive → HIGH_VALUE', () => {
    const r = evaluateModerationPriority(
      input({
        botMeta: botMeta(
          {
            effectiveDiscountPercent: 18,
            suspectedArtificialListPrice: false,
            habitual30d: 1100,
            historyReady: true,
            originalPriceProvenance: 'source_explicit',
            cardDiscountSource: 'pdp',
          },
          { decision: 'VERIFIED_DEAL' },
        ),
      }),
    );
    expect(r.priority).toBe('P1_HIGH_VALUE');
    expect(r.reasons.some((x) => x.code === 'effective_savings')).toBe(true);
  });

  it('non-artificial + useful history → HIGH_VALUE', () => {
    const r = evaluateModerationPriority(
      input({
        botMeta: botMeta({
          effectiveDiscountPercent: 12,
          suspectedArtificialListPrice: false,
          habitual30d: 950,
          historyReady: true,
        }),
      }),
    );
    expect(r.priority).toBe('P1_HIGH_VALUE');
  });

  it('weak listing only → INSUFFICIENT_EVIDENCE', () => {
    const r = evaluateModerationPriority(
      input({
        botMeta: botMeta({
          effectiveDiscountPercent: 0,
          suspectedArtificialListPrice: false,
          cardDiscountSource: 'badge_reconstructed',
        }),
      }),
    );
    expect(r.priority).toBe('P3_INSUFFICIENT_EVIDENCE');
    expect(r.reasons.some((x) => x.code === 'weak_listing')).toBe(true);
  });

  it('artificial + effective 0 → INSUFFICIENT_EVIDENCE (o LOW)', () => {
    const r = evaluateModerationPriority(
      input({
        botMeta: botMeta({
          effectiveDiscountPercent: 0,
          suspectedArtificialListPrice: true,
          cardDiscountSource: 'card_strikethrough',
        }),
      }),
    );
    expect(['P3_INSUFFICIENT_EVIDENCE', 'P4_LOW_VALUE']).toContain(r.priority);
  });

  it('no history → lower priority than with history', () => {
    const withHistory = evaluateModerationPriority(
      input({
        botMeta: botMeta({
          effectiveDiscountPercent: 15,
          suspectedArtificialListPrice: false,
          historyReady: true,
          habitual30d: 1000,
        }),
      }),
    );
    const noHistory = evaluateModerationPriority(
      input({
        botMeta: botMeta({
          effectiveDiscountPercent: 0,
          suspectedArtificialListPrice: false,
        }),
      }),
    );
    expect(withHistory.rank).toBeLessThan(noHistory.rank);
    expect(noHistory.priority).toBe('P3_INSUFFICIENT_EVIDENCE');
  });

  it('valid image improves priority', () => {
    const baseMeta = botMeta({
      effectiveDiscountPercent: 20,
      suspectedArtificialListPrice: false,
      habitual30d: 900,
    });
    const withImg = evaluateModerationPriority(input({ botMeta: baseMeta, imageUrl: IMG }));
    const withoutImg = evaluateModerationPriority(input({ botMeta: baseMeta, imageUrl: null }));
    expect(withImg.rank).toBeLessThanOrEqual(withoutImg.rank);
    expect(withImg.priority).toBe('P1_HIGH_VALUE');
    expect(withoutImg.priority).not.toBe('P1_HIGH_VALUE');
  });

  it('old pending can receive REVIEW without changing quality decision', () => {
    const meta = botMeta({
      effectiveDiscountPercent: 0,
      suspectedArtificialListPrice: true,
      cardDiscountSource: 'badge_reconstructed',
    });
    const fresh = evaluateModerationPriority(
      input({ botMeta: meta, createdAt: hoursAgo(2) }),
    );
    const stale = evaluateModerationPriority(
      input({ botMeta: meta, createdAt: hoursAgo(72) }),
    );
    expect(fresh.priority).toBe('P4_LOW_VALUE');
    expect(stale.priority).toBe('P2_REVIEW');
    // Quality decision untouched (no field on result; meta unchanged).
    expect((meta as { dealQuality?: unknown }).dealQuality).toBeUndefined();
  });

  it('priority NEVER changes VERIFIED/POTENTIAL/NO_VERIFIED', () => {
    const meta = botMeta(
      {
        effectiveDiscountPercent: 0,
        suspectedArtificialListPrice: true,
      },
      { decision: 'NO_VERIFIED_DEAL' },
    );
    const before = JSON.stringify(meta);
    const r = evaluateModerationPriority(input({ botMeta: meta }));
    expect(JSON.stringify(meta)).toBe(before);
    expect(r).not.toHaveProperty('decision');
    expect(r.priority).not.toMatch(/VERIFIED|POTENTIAL/);
    expect((meta.dealQuality as { decision: string }).decision).toBe('NO_VERIFIED_DEAL');
  });

  it('community/manual offers remain P2_REVIEW (not demoted)', () => {
    const r = evaluateModerationPriority(
      input({
        isBot: false,
        botMeta: null,
        imageUrl: null,
      }),
    );
    expect(r.priority).toBe('P2_REVIEW');
    expect(r.reasons.some((x) => x.code === 'community_manual')).toBe(true);
  });
});

describe('expiresAtOnApprove (approved → feed liquidity)', () => {
  it('null → now + 7d', () => {
    const out = expiresAtOnApprove(null, NOW);
    expect(new Date(out).getTime()).toBe(NOW + 7 * 24 * 60 * 60 * 1000);
  });

  it('past expiry → refresh + 7d', () => {
    const past = new Date(NOW - 60_000).toISOString();
    const out = expiresAtOnApprove(past, NOW);
    expect(new Date(out).getTime()).toBe(NOW + 7 * 24 * 60 * 60 * 1000);
  });

  it('future expiry → preserve', () => {
    const future = new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(expiresAtOnApprove(future, NOW)).toBe(future);
  });
});

describe('createdAtOnApprove (home period=day)', () => {
  it('marca go-live = now para entrar al feed del día', () => {
    expect(createdAtOnApprove(NOW)).toBe(new Date(NOW).toISOString());
  });
});

describe('sortPendingOffersForModeration uses priority', () => {
  it('HIGH_VALUE before INSUFFICIENT_EVIDENCE', () => {
    const high = {
      id: 'high',
      title: 'good',
      price: 100,
      original_price: 200,
      image_url: IMG,
      created_at: hoursAgo(1),
      is_bot: true,
      bot_meta: botMeta({
        effectiveDiscountPercent: 22,
        suspectedArtificialListPrice: false,
        historyReady: true,
        habitual30d: 180,
      }),
    };
    const low = {
      id: 'low',
      title: 'weak',
      price: 100,
      original_price: 500,
      image_url: IMG,
      created_at: hoursAgo(1),
      is_bot: true,
      bot_meta: botMeta({
        effectiveDiscountPercent: 0,
        suspectedArtificialListPrice: true,
        cardDiscountSource: 'badge_reconstructed',
      }),
    };
    const sorted = sortPendingOffersForModeration([low, high]);
    expect(sorted.map((o) => o.id)).toEqual(['high', 'low']);
  });

  it('tie-break determinista: mismo rank → created_at ASC (FIFO)', () => {
    const meta = botMeta({
      effectiveDiscountPercent: 20,
      suspectedArtificialListPrice: false,
      historyReady: true,
      habitual30d: 200,
    });
    const older = {
      id: 'older',
      title: 'a',
      price: 100,
      original_price: 200,
      image_url: IMG,
      category: 'tecnologia',
      created_at: hoursAgo(5),
      is_bot: true,
      bot_meta: meta,
    };
    const newer = {
      id: 'newer',
      title: 'b',
      price: 100,
      original_price: 200,
      image_url: IMG,
      category: 'tecnologia',
      created_at: hoursAgo(1),
      is_bot: true,
      bot_meta: meta,
    };
    const sorted = sortPendingOffersForModeration([newer, older]);
    expect(sorted.map((o) => o.id)).toEqual(['older', 'newer']);
  });

  it('snooze activo va al final sin perder prioridad relativa', () => {
    const meta = botMeta({
      effectiveDiscountPercent: 20,
      suspectedArtificialListPrice: false,
      historyReady: true,
      habitual30d: 200,
    });
    const snoozed = {
      id: 'snoozed',
      title: 's',
      price: 100,
      original_price: 200,
      image_url: IMG,
      created_at: hoursAgo(1),
      is_bot: true,
      snoozed_until: new Date(NOW + 60_000).toISOString(),
      bot_meta: meta,
    };
    const ready = {
      id: 'ready',
      title: 'r',
      price: 100,
      original_price: 200,
      image_url: IMG,
      created_at: hoursAgo(2),
      is_bot: true,
      bot_meta: meta,
    };
    const sorted = sortPendingOffersForModeration([snoozed, ready]);
    expect(sorted.map((o) => o.id)).toEqual(['ready', 'snoozed']);
  });
});

/** Espejo de getHomeFeed eligibility (status + expires + period=day created_at). */
function isHomeFeedEligible(row: {
  status: string;
  expires_at: string | null;
  created_at: string;
  nowMs?: number;
  periodHours?: number;
}): boolean {
  const now = row.nowMs ?? NOW;
  if (row.status !== 'approved' && row.status !== 'published') return false;
  if (row.expires_at != null) {
    const exp = new Date(row.expires_at).getTime();
    if (Number.isFinite(exp) && exp < now) return false;
  }
  const periodMs = (row.periodHours ?? 24) * 3_600_000;
  const created = new Date(row.created_at).getTime();
  if (!Number.isFinite(created) || created < now - periodMs) return false;
  return true;
}

describe('pending → approve → feed eligibility', () => {
  it('pending viejo + approve (expires+created refresh) → elegible period=day', () => {
    const pendingCreated = hoursAgo(60);
    const afterApprove = {
      status: 'approved',
      expires_at: expiresAtOnApprove(null, NOW),
      created_at: createdAtOnApprove(NOW),
    };
    expect(isHomeFeedEligible({ status: 'pending', expires_at: null, created_at: pendingCreated })).toBe(
      false,
    );
    expect(
      isHomeFeedEligible({
        status: afterApprove.status,
        expires_at: afterApprove.expires_at,
        created_at: afterApprove.created_at,
      }),
    ).toBe(true);
  });

  it('rejected NO es elegible', () => {
    expect(
      isHomeFeedEligible({
        status: 'rejected',
        expires_at: expiresAtOnApprove(null, NOW),
        created_at: createdAtOnApprove(NOW),
      }),
    ).toBe(false);
  });

  it('expired NO es elegible', () => {
    expect(
      isHomeFeedEligible({
        status: 'approved',
        expires_at: hoursAgo(1),
        created_at: createdAtOnApprove(NOW),
      }),
    ).toBe(false);
  });

  it('approved con created_at viejo (sin go-live) NO entra a period=day', () => {
    expect(
      isHomeFeedEligible({
        status: 'approved',
        expires_at: expiresAtOnApprove(null, NOW),
        created_at: hoursAgo(60),
      }),
    ).toBe(false);
  });
});

describe('mission source contracts (no money / no auto-approve)', () => {
  it('moderate-offer usa expiresAtOnApprove + createdAtOnApprove y limpia locks', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/api/admin/moderate-offer/route.ts'), 'utf8');
    expect(src).toMatch(/expiresAtOnApprove/);
    expect(src).toMatch(/createdAtOnApprove/);
    expect(src).toMatch(/LOCK_CLEAR/);
    expect(src).not.toMatch(/BOT_INGEST_AUTO_APPROVE|autoApproveEnabled/);
  });

  it('claim ordena vía sortPendingOffersForModeration (prioridad conectada)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/moderation/claimNextModerationOffer.ts'),
      'utf8',
    );
    expect(src).toMatch(/sortPendingOffersForModeration/);
    expect(src).toMatch(/bot_meta/);
    expect(src).toMatch(/tryAcquireModerationLock/);
  });

  it('Money Truth + Rewards fail-closed intactos (archivos no tocados por esta misión)', () => {
    const economy = readFileSync(resolve(process.cwd(), 'lib/owner/estimatedEconomy.ts'), 'utf8');
    const finance = readFileSync(
      resolve(process.cwd(), 'lib/finance/financialRecordClass.ts'),
      'utf8',
    );
    const rewards = readFileSync(resolve(process.cwd(), 'lib/rewards/programStatus.ts'), 'utf8');
    expect(economy).toMatch(/filterProductionLedgerRows/);
    expect(economy).toMatch(/NO_DATA/);
    expect(finance).toMatch(/SYNTHETIC_QA/);
    expect(rewards).toMatch(/isRewardsProgramActive/);
    expect(rewards).toMatch(/REWARDS_PROGRAM_ACTIVE/);
  });
});
