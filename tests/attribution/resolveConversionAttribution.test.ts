import { describe, expect, it, vi } from 'vitest';
import {
  getAttributionWindowDays,
  isAttributionWindowExpired,
  isClickWithinAttributionWindow,
} from '@/lib/attribution/attributionWindow';
import {
  evaluateClickFraudSignals,
  evaluateConversionAttributionFraudSignals,
  isAuthenticatedClickEvidence,
} from '@/lib/attribution/fraudSignals';
import {
  resolveConversionAttribution,
  resolveConversionAttributionStrict,
} from '@/lib/attribution/resolveConversionAttribution';
import { REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS } from '@/lib/rewards/config';

const OFFER_CLICK = '11111111-1111-1111-1111-111111111111';
const OFFER_CLIENT = '22222222-2222-2222-2222-222222222222';
const CLICK_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_AUTH = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CREATOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeClickSupabase(opts: {
  click?: {
    id: string;
    offer_id: string;
    clicker_user_id?: string | null;
    created_at?: string;
  } | null;
  creatorId?: string | null;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'reward_outbound_clicks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.click ?? null,
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'offers') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.creatorId ? { created_by: opts.creatorId } : null,
                error: null,
              })),
            })),
          })),
        };
      }
      return {};
    }),
  };
}

describe('attributionWindow', () => {
  it('usa REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS', () => {
    expect(getAttributionWindowDays()).toBe(REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS);
  });

  it('click dentro de ventana → true', () => {
    const conversionAt = '2026-09-18T12:00:00.000Z';
    const clickAt = '2026-09-17T12:00:00.000Z';
    expect(isClickWithinAttributionWindow(clickAt, conversionAt)).toBe(true);
    expect(isAttributionWindowExpired(clickAt, conversionAt)).toBe(false);
  });

  it('click fuera de ventana → expired', () => {
    const conversionAt = '2026-09-18T12:00:00.000Z';
    const clickAt = '2026-09-01T12:00:00.000Z';
    expect(isClickWithinAttributionWindow(clickAt, conversionAt)).toBe(false);
    expect(isAttributionWindowExpired(clickAt, conversionAt)).toBe(true);
  });
});

describe('fraudSignals', () => {
  it('authenticated vs anonymous distinguishable', () => {
    expect(isAuthenticatedClickEvidence(USER_AUTH)).toBe(true);
    expect(isAuthenticatedClickEvidence(null)).toBe(false);
    expect(isAuthenticatedClickEvidence('')).toBe(false);

    expect(
      evaluateClickFraudSignals({
        clickId: CLICK_ID,
        clickerUserId: USER_AUTH,
        creatorId: CREATOR,
      }),
    ).not.toContain('anonymous_click');

    expect(
      evaluateClickFraudSignals({
        clickId: CLICK_ID,
        clickerUserId: null,
        creatorId: CREATOR,
      }),
    ).toContain('anonymous_click');
  });

  it('self_click solo con evidencia creator+clicker', () => {
    expect(
      evaluateClickFraudSignals({
        clickId: CLICK_ID,
        clickerUserId: CREATOR,
        creatorId: CREATOR,
      }),
    ).toContain('self_click');
    expect(
      evaluateClickFraudSignals({
        clickId: CLICK_ID,
        clickerUserId: USER_AUTH,
        creatorId: CREATOR,
      }),
    ).not.toContain('self_click');
  });

  it('sin click_id no marca anonymous (manual path)', () => {
    expect(
      evaluateClickFraudSignals({
        clickId: null,
        clickerUserId: null,
        creatorId: CREATOR,
      }),
    ).not.toContain('anonymous_click');
  });

  it('conflicting_offer y duplicate_conversion_key', () => {
    const flags = evaluateConversionAttributionFraudSignals({
      clickId: CLICK_ID,
      clientOfferId: OFFER_CLIENT,
      clickOfferId: OFFER_CLICK,
      withinAttributionWindow: true,
      isDuplicateConversion: true,
    });
    expect(flags).toContain('conflicting_offer');
    expect(flags).toContain('duplicate_conversion_key');
  });
});

describe('resolveConversionAttributionStrict', () => {
  const conversionAt = '2026-09-18T12:00:00.000Z';
  const freshClickAt = '2026-09-18T11:00:00.000Z';

  it('sin click → unattributed, sin asignar usuario', async () => {
    const sb = makeClickSupabase({ click: null });
    const r = await resolveConversionAttributionStrict(sb as never, {
      offerId: OFFER_CLIENT,
      conversionAt,
    });
    expect(r.attributionStatus).toBe('unattributed');
    expect(r.clickerUserId).toBeNull();
    expect(r.isAuthenticatedClick).toBe(false);
  });

  it('click autenticado → isAuthenticatedClick true (solo DB)', async () => {
    const sb = makeClickSupabase({
      click: {
        id: CLICK_ID,
        offer_id: OFFER_CLICK,
        clicker_user_id: USER_AUTH,
        created_at: freshClickAt,
      },
    });
    const r = await resolveConversionAttributionStrict(sb as never, {
      clickId: CLICK_ID,
      conversionAt,
    });
    expect(r.attributionStatus).toBe('attributed');
    expect(r.clickerUserId).toBe(USER_AUTH);
    expect(r.isAuthenticatedClick).toBe(true);
    expect(r.fraudSignals).not.toContain('anonymous_click');
  });

  it('click anónimo → anonymous_click, sin inventar user', async () => {
    const sb = makeClickSupabase({
      click: {
        id: CLICK_ID,
        offer_id: OFFER_CLICK,
        clicker_user_id: null,
        created_at: freshClickAt,
      },
    });
    const r = await resolveConversionAttributionStrict(sb as never, {
      clickId: CLICK_ID,
      conversionAt,
    });
    expect(r.attributionStatus).toBe('attributed');
    expect(r.clickerUserId).toBeNull();
    expect(r.isAuthenticatedClick).toBe(false);
    expect(r.fraudSignals).toContain('anonymous_click');
  });

  it('conflicting offer → click offer gana + evidencia', async () => {
    const sb = makeClickSupabase({
      click: {
        id: CLICK_ID,
        offer_id: OFFER_CLICK,
        clicker_user_id: USER_AUTH,
        created_at: freshClickAt,
      },
    });
    const r = await resolveConversionAttributionStrict(sb as never, {
      clickId: CLICK_ID,
      offerId: OFFER_CLIENT,
      conversionAt,
    });
    expect(r.attributionStatus).toBe('attributed');
    expect(r.offerId).toBe(OFFER_CLICK);
    expect(r.fraudSignals).toContain('conflicting_offer');
    expect(r.conflicts).toEqual([
      {
        kind: 'conflicting_offer',
        clientOfferId: OFFER_CLIENT,
        clickOfferId: OFFER_CLICK,
        clickCreatedAt: freshClickAt,
        conversionAt,
      },
    ]);
  });

  it('ventana expirada → unresolved (fail-closed)', async () => {
    const staleClickAt = '2026-09-01T12:00:00.000Z';
    const sb = makeClickSupabase({
      click: {
        id: CLICK_ID,
        offer_id: OFFER_CLICK,
        clicker_user_id: USER_AUTH,
        created_at: staleClickAt,
      },
    });
    const r = await resolveConversionAttributionStrict(sb as never, {
      clickId: CLICK_ID,
      conversionAt,
    });
    expect(r.attributionStatus).toBe('unresolved');
    expect(r.fraudSignals).toContain('attribution_window_expired');
    expect(r.conflicts.some((c) => c.kind === 'attribution_window_expired')).toBe(true);
  });

  it('click missing → unresolved', async () => {
    const sb = makeClickSupabase({ click: null });
    const r = await resolveConversionAttributionStrict(sb as never, {
      clickId: CLICK_ID,
      conversionAt,
    });
    expect(r.attributionStatus).toBe('unresolved');
    expect(r.clickId).toBe(CLICK_ID);
  });

  it('self_click cuando creator coincide con clicker', async () => {
    const sb = makeClickSupabase({
      click: {
        id: CLICK_ID,
        offer_id: OFFER_CLICK,
        clicker_user_id: CREATOR,
        created_at: freshClickAt,
      },
      creatorId: CREATOR,
    });
    const r = await resolveConversionAttributionStrict(sb as never, {
      clickId: CLICK_ID,
      conversionAt,
    });
    expect(r.fraudSignals).toContain('self_click');
  });
});

describe('resolveConversionAttribution compat', () => {
  it('wrapper reduce resultado strict', async () => {
    const sb = makeClickSupabase({
      click: {
        id: CLICK_ID,
        offer_id: OFFER_CLICK,
        clicker_user_id: USER_AUTH,
        created_at: '2026-09-18T11:00:00.000Z',
      },
    });
    const r = await resolveConversionAttribution(sb as never, {
      clickId: CLICK_ID,
      conversionAt: '2026-09-18T12:00:00.000Z',
    });
    expect(r.attributionStatus).toBe('attributed');
    expect(r.offerId).toBe(OFFER_CLICK);
  });
});
