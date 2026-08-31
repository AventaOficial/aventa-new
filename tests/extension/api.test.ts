import { describe, it, expect, vi } from 'vitest';
import {
  fetchCooldownStatus,
  createOffer,
  type CreateOfferPayload,
} from '../../browser-extension/src/api/aventa';

describe('API extensión — estados', () => {
  it('no autenticado en cooldown → error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    await expect(
      fetchCooldownStatus('bad-token', {
        aventaBase: 'https://aventaofertas.com',
        supabaseUrl: '',
        supabaseAnonKey: '',
      }),
    ).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it('cooldown activo desde API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          exempt: false,
          canUpload: false,
          remainingSeconds: 12,
          cooldownSeconds: 15,
          reputationLevel: 1,
        }),
      }),
    );
    const status = await fetchCooldownStatus('token', {
      aventaBase: 'https://aventaofertas.com',
      supabaseUrl: '',
      supabaseAnonKey: '',
    });
    expect(status.canUpload).toBe(false);
    expect(status.remainingSeconds).toBe(12);
    vi.unstubAllGlobals();
  });

  it('publicación exitosa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, id: 'offer-1', status: 'pending' }),
      }),
    );
    const payload: CreateOfferPayload = {
      title: 'Test',
      store: 'Amazon',
      offer_url: 'https://www.amazon.com.mx/dp/B08N5WRWNW',
      price: 999,
    };
    const result = await createOffer('token', {
      aventaBase: 'https://aventaofertas.com',
      supabaseUrl: '',
      supabaseAnonKey: '',
    }, payload);
    expect(result.id).toBe('offer-1');
    vi.unstubAllGlobals();
  });

  it('oferta duplicada → 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'duplicada',
          duplicate_offer_id: 'dup-1',
          duplicate_status: 'approved',
        }),
      }),
    );
    const result = await createOffer('token', {
      aventaBase: 'https://aventaofertas.com',
      supabaseUrl: '',
      supabaseAnonKey: '',
    }, {
      title: 'Test',
      store: 'Amazon',
      offer_url: 'https://www.amazon.com.mx/dp/B08N5WRWNW',
    });
    expect(result.duplicate_offer_id).toBe('dup-1');
    vi.unstubAllGlobals();
  });
});
