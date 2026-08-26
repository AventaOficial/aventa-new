import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/integrations/mercadolibre/tokenRefresh', () => ({
  getValidAccessToken: vi.fn(async () => 'APP_USR-test-token'),
  refreshMercadoLibreAccessToken: vi.fn(async () => 'APP_USR-refreshed'),
}));

vi.mock('@/lib/integrations/mercadolibre/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/mercadolibre/oauth')>();
  return {
    ...actual,
    isMlOAuthEnabled: vi.fn(() => true),
  };
});

describe('fetchMlApi', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'MLM1' }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('returns authenticated data on 200', async () => {
    const { fetchMlApi } = await import('@/lib/integrations/mercadolibre/apiClient');
    const result = await fetchMlApi('/items/MLM123');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authenticated).toBe(true);
      expect(result.data).toEqual({ id: 'MLM1' });
    }
  });

  it('retries once after 401', async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { refreshMercadoLibreAccessToken } = await import(
      '@/lib/integrations/mercadolibre/tokenRefresh'
    );
    const { fetchMlApi } = await import('@/lib/integrations/mercadolibre/apiClient');

    const result = await fetchMlApi('/items/MLM123');
    expect(refreshMercadoLibreAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });
});
