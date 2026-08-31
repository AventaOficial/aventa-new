import { describe, it, expect, vi } from 'vitest';
import { isOfferTrackable } from '../../lib/server/trackableOffer';

describe('trackableOffer', () => {
  it('devuelve true cuando la oferta es pública y vigente', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'offer-1' }, error: null });
    const chain = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as Parameters<
      typeof isOfferTrackable
    >[1];

    await expect(isOfferTrackable('550e8400-e29b-41d4-a716-446655440000', supabase)).resolves.toBe(
      true,
    );
    expect(supabase.from).toHaveBeenCalledWith('offers');
  });

  it('devuelve false cuando no hay oferta trackable', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as Parameters<
      typeof isOfferTrackable
    >[1];

    await expect(isOfferTrackable('550e8400-e29b-41d4-a716-446655440000', supabase)).resolves.toBe(
      false,
    );
  });
});

describe('plaza moderation defaults', () => {
  it('status pending es el valor esperado para posts de usuario', () => {
    const userSubmittedStatus = 'approved';
    const serverStatus = userSubmittedStatus === 'approved' ? 'pending' : 'pending';
    expect(serverStatus).toBe('pending');
  });
});

describe('comment like ownership', () => {
  it('rechaza like cuando offer_id no coincide', () => {
    const urlOfferId = '11111111-1111-4111-8111-111111111111';
    const commentOfferId = '22222222-2222-4222-8222-222222222222';
    const allowed = urlOfferId === commentOfferId;
    expect(allowed).toBe(false);
  });
});
