import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const fetchMlApiMock = vi.fn();

vi.mock('@/lib/integrations/mercadolibre/apiClient', () => ({
  fetchMlApi: (...args: unknown[]) => fetchMlApiMock(...args),
}));

describe('fetchMercadoLibrePublicOffer', () => {
  beforeEach(() => {
    fetchMlApiMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marca source ml_api cuando la API autenticada responde', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/items/') && path.endsWith('/prices')) {
        return { ok: false, status: 404, authenticated: true };
      }
      if (path.startsWith('/items/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            title: 'Laptop Gamer',
            price: 9999,
            original_price: 12999,
            category_id: 'MLM1144',
            pictures: [
              { secure_url: 'https://http2.mlstatic.com/D_NQ_NP_2X_111-I.webp' },
              { secure_url: 'https://http2.mlstatic.com/D_NQ_NP_2X_222-I.webp' },
            ],
          },
        };
      }
      if (path.startsWith('/products/')) {
        return { ok: false, status: 404, authenticated: true };
      }
      if (path.startsWith('/categories/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: { path_from_root: [{ name: 'Consolas' }, { name: 'Videojuegos' }] },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });

    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const result = await fetchMercadoLibrePublicOffer(
      'https://articulo.mercadolibre.com.mx/MLM-1234567890-test',
    );

    expect(result?.source).toBe('ml_api');
    expect(result?.price).toBe(9999);
    expect(result?.originalPrice).toBe(12999);
    expect(result?.pictures.length).toBeGreaterThanOrEqual(2);
    expect(result?.categoryId).toBe('MLM1144');
    expect(result?.pathNames).toContain('Videojuegos');
  });

  it('no inventa original_price cuando falta en API', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/items/') && path.endsWith('/prices')) {
        return { ok: false, status: 404, authenticated: true };
      }
      if (path.startsWith('/items/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            title: 'Producto',
            price: 500,
            pictures: [{ secure_url: 'https://http2.mlstatic.com/D_NQ_NP_2X_333-I.webp' }],
          },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });

    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const result = await fetchMercadoLibrePublicOffer(
      'https://articulo.mercadolibre.com.mx/MLM-9999999999-test',
    );

    expect(result?.price).toBe(500);
    expect(result?.originalPrice).toBeNull();
  });

  it('usa /items/{id}/prices cuando el item no trae price', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/items/') && path.endsWith('/prices')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            prices: [
              { type: 'promotion', amount: 397, regular_amount: 800 },
              { type: 'standard', amount: 800 },
            ],
          },
        };
      }
      if (path.startsWith('/items/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            title: 'Croquetas Gato',
            category_id: 'MLM1574',
            pictures: [{ secure_url: 'https://http2.mlstatic.com/D_NQ_NP_2X_444-I.webp' }],
          },
        };
      }
      if (path.startsWith('/products/')) {
        return { ok: false, status: 404, authenticated: true };
      }
      if (path.startsWith('/categories/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: { path_from_root: [{ name: 'Mascotas' }, { name: 'Alimentos' }] },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });

    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const result = await fetchMercadoLibrePublicOffer(
      'https://articulo.mercadolibre.com.mx/MLM-8888888888-test',
    );

    expect(result?.source).toBe('ml_api');
    expect(result?.price).toBe(397);
    expect(result?.originalPrice).toBe(800);
  });
});
