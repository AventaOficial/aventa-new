import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildModerationOutcome,
  formatMedianDecisionTime,
  formatPendingToLivePct,
  MODERATION_OUTCOME_TABLE,
  persistModerationOutcome,
} from '@/lib/moderation/outcomes';

const IMG = 'https://http2.mlstatic.com/D_NQ_NP_2X_123-O.jpg';
const OFFER_ID = '13ba7460-c56b-45bc-a69f-c3d603f314f8';
const MOD_ID = '01e5bc4f-0000-4000-8000-000000000001';
const SUBMITTED = '2026-09-14T10:00:00.000Z';
const DECIDED = '2026-09-14T12:00:00.000Z';

function botOffer(over: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    created_at: SUBMITTED,
    image_url: IMG,
    price: 585,
    original_price: 849,
    offer_url:
      'https://articulo.mercadolibre.com.mx/MLM-62559998-test-product?tag=aventa',
    link_mod_ok: true,
    is_bot: true,
    moderator_comment: '[bot-ingest]',
    bot_meta: {
      v: 1,
      source: 'ml_worker',
      signals: {
        effectiveDiscountPercent: 18,
        suspectedArtificialListPrice: false,
        historyReady: true,
        habitual30d: 700,
      },
      dealQuality: { decision: 'POTENTIAL_DEAL' },
    },
    ...over,
  };
}

describe('moderation outcome contract', () => {
  it('approve genera outcome con offer_id, priority, source', () => {
    const row = buildModerationOutcome({
      offer: botOffer(),
      decision: 'approve',
      moderatorId: MOD_ID,
      decisionAt: DECIDED,
    });
    expect(row.offer_id).toBe(OFFER_ID);
    expect(row.decision).toBe('approve');
    expect(row.moderator_id).toBe(MOD_ID);
    expect(row.priority_at_decision).toBe('P1_HIGH_VALUE');
    expect(row.source).toBe('ml_worker');
    expect(row.source_lane).toBe('machine');
    expect(row.quality_classification).toBe('POTENTIAL_DEAL');
    expect(row.affiliate_ready).toBe(true);
    expect(row.time_from_submission_ms).toBe(2 * 60 * 60 * 1000);
    expect(row.idempotency_key).toBe(`approve:${OFFER_ID}`);
  });

  it('reject genera outcome con rejection_reason', () => {
    const prevTag = process.env.ML_AFFILIATE_TAG;
    const prevPub = process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG;
    process.env.ML_AFFILIATE_TAG = 'aventa';
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = 'aventa';
    delete process.env.ML_MATT_TOOL;
    delete process.env.NEXT_PUBLIC_ML_MATT_TOOL;
    try {
      const row = buildModerationOutcome({
        offer: botOffer({
          link_mod_ok: false,
          offer_url: 'https://articulo.mercadolibre.com.mx/MLM-62559998-test-product',
        }),
        decision: 'reject',
        moderatorId: MOD_ID,
        decisionAt: DECIDED,
        rejectionReason: 'Precio engañoso',
      });
      expect(row.decision).toBe('reject');
      expect(row.rejection_reason).toBe('Precio engañoso');
      expect(row.affiliate_ready).toBe(false);
      expect(row.idempotency_key).toBe(`reject:${OFFER_ID}`);
    } finally {
      if (prevTag === undefined) delete process.env.ML_AFFILIATE_TAG;
      else process.env.ML_AFFILIATE_TAG = prevTag;
      if (prevPub === undefined) delete process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG;
      else process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG = prevPub;
    }
  });

  it('snooze genera outcome con snooze_minutes', () => {
    const row = buildModerationOutcome({
      offer: botOffer(),
      decision: 'snooze',
      moderatorId: MOD_ID,
      decisionAt: DECIDED,
      snoozeMinutes: 60,
    });
    expect(row.decision).toBe('snooze');
    expect(row.snooze_minutes).toBe(60);
    expect(row.idempotency_key).toContain('snooze:');
  });

  it('conserva artificial_discount y evidence', () => {
    const row = buildModerationOutcome({
      offer: botOffer({
        bot_meta: {
          source: 'ml_worker',
          signals: {
            effectiveDiscountPercent: 0,
            suspectedArtificialListPrice: true,
            cardDiscountSource: 'badge_reconstructed',
          },
          dealQuality: { decision: 'NO_VERIFIED_DEAL' },
        },
      }),
      decision: 'reject',
      moderatorId: MOD_ID,
      decisionAt: DECIDED,
      rejectionReason: 'Sin evidencia',
    });
    expect(row.artificial_discount).toBe(true);
    expect(row.evidence_classification).toBe('artificial_list');
    expect(row.quality_classification).toBe('NO_VERIFIED_DEAL');
  });
});

describe('persistModerationOutcome fail-soft', () => {
  it('outcome no bloquea moderation: insert error → ok:false sin throw', async () => {
    const supabase = {
      from: () => ({
        insert: async () => ({ error: { message: 'boom', code: 'XX000' } }),
      }),
    };
    const result = await persistModerationOutcome(
      {
        offer: botOffer(),
        decision: 'approve',
        moderatorId: MOD_ID,
        decisionAt: DECIDED,
      },
      { supabase: supabase as unknown as SupabaseClient },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insert_failed');
  });

  it('idempotency: duplicate key → ok:true idempotent', async () => {
    const supabase = {
      from: () => ({
        insert: async () => ({ error: { message: 'duplicate key', code: '23505' } }),
      }),
    };
    const result = await persistModerationOutcome(
      {
        offer: botOffer(),
        decision: 'approve',
        moderatorId: MOD_ID,
        decisionAt: DECIDED,
      },
      { supabase: supabase as unknown as SupabaseClient },
    );
    expect(result).toEqual({
      ok: true,
      idempotent: true,
      offerId: OFFER_ID,
      decision: 'approve',
    });
  });

  it('table missing → ok:false table_missing (no throw)', async () => {
    const supabase = {
      from: () => ({
        insert: async () => ({
          error: { message: `${MODERATION_OUTCOME_TABLE} does not exist`, code: '42P01' },
        }),
      }),
    };
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await persistModerationOutcome(
      {
        offer: botOffer(),
        decision: 'claim',
        moderatorId: MOD_ID,
        decisionAt: DECIDED,
      },
      { supabase: supabase as unknown as SupabaseClient },
    );
    spy.mockRestore();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('table_missing');
  });
});

describe('funnel formatters + wiring contracts', () => {
  it('formatters CEO', () => {
    expect(formatPendingToLivePct(8.4)).toBe('8.4%');
    expect(formatPendingToLivePct(null)).toBe('NO_DATA');
    expect(formatMedianDecisionTime(14)).toBe('14m');
    expect(formatMedianDecisionTime(90)).toBe('1.5h');
    expect(formatMedianDecisionTime(null)).toBe('NO_DATA');
  });

  it('routes instrumentan outcomes sin bloquear decisión', () => {
    const moderate = readFileSync(
      resolve(process.cwd(), 'app/api/admin/moderate-offer/route.ts'),
      'utf8',
    );
    const snooze = readFileSync(
      resolve(process.cwd(), 'app/api/admin/moderation-snooze/route.ts'),
      'utf8',
    );
    const claim = readFileSync(
      resolve(process.cwd(), 'app/api/admin/moderation/claim-next/route.ts'),
      'utf8',
    );
    expect(moderate).toMatch(/recordModerationOutcomeFireAndForget/);
    expect(moderate).toMatch(/loadOfferSnapshotForOutcome/);
    expect(snooze).toMatch(/decision: 'snooze'/);
    expect(claim).toMatch(/decision: 'claim'/);
  });

  it('Money Truth + Rewards intactos', () => {
    const economy = readFileSync(resolve(process.cwd(), 'lib/owner/estimatedEconomy.ts'), 'utf8');
    const finance = readFileSync(
      resolve(process.cwd(), 'lib/finance/financialRecordClass.ts'),
      'utf8',
    );
    const rewards = readFileSync(resolve(process.cwd(), 'lib/rewards/programStatus.ts'), 'utf8');
    expect(economy).toMatch(/filterProductionLedgerRows/);
    expect(finance).toMatch(/SYNTHETIC_QA/);
    expect(rewards).toMatch(/isRewardsProgramActive/);
    expect(rewards).toMatch(/REWARDS_PROGRAM_ACTIVE/);
  });

  it('migración RLS fail-closed (sin insert client)', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'docs/supabase-migrations/20260914_moderation_outcomes.sql'),
      'utf8',
    );
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/GRANT ALL ON TABLE public\.moderation_outcomes TO service_role/);
    expect(sql).toMatch(/moderation_outcomes_select_staff/);
    expect(sql).not.toMatch(/FOR INSERT/);
    expect(sql).toMatch(/idempotency_key/);
  });

  it('CEO muestra Pending → Live sin mezclar revenue', () => {
    const ceo = readFileSync(
      resolve(process.cwd(), 'app/admin/owner/components/CeoControlCenter.tsx'),
      'utf8',
    );
    expect(ceo).toMatch(/Pending → Live/);
    expect(ceo).toMatch(/Median decision/);
    expect(ceo).toMatch(/Revenue confirmed/);
    expect(ceo).not.toMatch(/formatMoneyCents\(data\.moderation/);
  });
});
