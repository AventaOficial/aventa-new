import { describe, it, expect, vi } from 'vitest';
import { resolveCommissionAttribution } from '../../lib/rewards/attribution/matcher';
import { encodeAventaSubId } from '../../lib/rewards/adapters/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const OFFER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLICK = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeSupabase(opts: {
  click?: { offer_id: string } | null;
  offer?: { created_by: string } | null;
  productClicks?: Array<{ id: string; offer_id: string }>;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'reward_outbound_clicks') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(async () => {
          if (opts.productClicks) {
            return { data: opts.productClicks, error: null };
          }
          return {
            data: opts.click ? [{ id: CLICK, offer_id: opts.click.offer_id }] : null,
            error: null,
          };
        }),
        maybeSingle: vi.fn().mockResolvedValue({
          data: opts.click ? { id: CLICK, offer_id: opts.click.offer_id } : null,
          error: null,
        }),
      };
    }
    if (table === 'offers') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: opts.offer ? { id: OFFER, created_by: opts.offer.created_by } : null,
          error: null,
        }),
      };
    }
    return {};
  });
  return { from } as unknown as SupabaseClient;
}

describe('Commission attribution', () => {
  it('sub-id → oferta correcta', async () => {
    const subId = encodeAventaSubId(OFFER, CLICK);
    const supabase = makeSupabase({
      click: { offer_id: OFFER },
      offer: { created_by: CREATOR },
    });
    const result = await resolveCommissionAttribution(supabase, {
      id: 'ledger-1',
      network: 'amazon',
      amount_cents: 1000,
      status: 'confirmed',
      sub_id_raw: subId,
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.match.offerId).toBe(OFFER);
      expect(result.match.creatorId).toBe(CREATOR);
      expect(result.match.method).toBe('sub_id');
      expect(result.match.confidence).toBe('high');
    }
  });

  it('producto + clic único → oferta', async () => {
    const supabase = makeSupabase({
      productClicks: [{ id: CLICK, offer_id: OFFER }],
      offer: { created_by: CREATOR },
    });
    const result = await resolveCommissionAttribution(supabase, {
      id: 'ledger-2',
      network: 'amazon',
      amount_cents: 500,
      status: 'confirmed',
      external_ref: 'B000TEST123',
      created_at: new Date().toISOString(),
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.match.method).toBe('product_click_window');
      expect(result.match.confidence).toBe('medium');
    }
  });

  it('atribución ambigua → no reward', async () => {
    const supabase = makeSupabase({
      productClicks: [
        { id: 'c1', offer_id: OFFER },
        { id: 'c2', offer_id: OFFER },
      ],
    });
    const result = await resolveCommissionAttribution(supabase, {
      id: 'ledger-3',
      network: 'amazon',
      amount_cents: 500,
      status: 'confirmed',
      external_ref: 'B000TEST123',
      created_at: new Date().toISOString(),
    });
    expect(result.matched).toBe(false);
    if (!result.matched) expect(result.confidence).toBe('low');
  });

  it('sin oferta → no reward', async () => {
    const supabase = makeSupabase({ click: null });
    const result = await resolveCommissionAttribution(supabase, {
      id: 'ledger-4',
      network: 'mercadolibre',
      amount_cents: 800,
      status: 'confirmed',
    });
    expect(result.matched).toBe(false);
    if (!result.matched) expect(result.reason).toBe('no_evidence');
  });

  it('creator_id que no coincide con offers.created_by → rechazo', async () => {
    const supabase = makeSupabase({
      offer: { created_by: CREATOR },
    });
    const wrongCreator = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const result = await resolveCommissionAttribution(supabase, {
      id: 'ledger-5',
      network: 'amazon',
      amount_cents: 500,
      status: 'confirmed',
      offer_id: OFFER,
      creator_id: wrongCreator,
    });
    expect(result.matched).toBe(false);
    if (!result.matched) expect(result.reason).toBe('creator_offer_mismatch');
  });
});
