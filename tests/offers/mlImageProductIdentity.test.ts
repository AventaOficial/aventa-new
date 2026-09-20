import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  mergeMlImageCandidates,
  picturesFromMlApiBody,
  isRejectedMercadoLibreImage,
} from '@/lib/offers/mlImageProvenance';
import { mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';

const fetchMlApiMock = vi.fn();

vi.mock('@/lib/integrations/mercadolibre/apiClient', () => ({
  fetchMlApi: (...args: unknown[]) => fetchMlApiMock(...args),
}));

const ITEM_ID = 'MLM1413356802';
const SIBLING_CATALOG_PIC = 'https://http2.mlstatic.com/D_NQ_NP_2X_SIBLINGPHONE99-O.webp';
const ITEM_PIC_A = 'https://http2.mlstatic.com/D_NQ_NP_2X_ITEMCOVERAAA-O.webp';
const ITEM_PIC_B = 'https://http2.mlstatic.com/D_NQ_NP_2X_ITEMGALLERYB-O.webp';
const OTHER_ITEM_PIC = 'https://http2.mlstatic.com/D_NQ_NP_2X_OTHERMODELXX-O.webp';
const THUMB = 'https://http2.mlstatic.com/D_NQ_NP_2X_ITEMCOVERAAA-I.webp';
const FULL = 'https://http2.mlstatic.com/D_NQ_NP_2X_ITEMCOVERAAA-O.webp';

describe('Mercado Libre product-bound images', () => {
  beforeEach(() => {
    fetchMlApiMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('A. URL ML válida → solo pictures del item (no galería /products)', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/items/') && path.endsWith('/prices')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: { currency_id: 'MXN', prices: [{ type: 'standard', amount: 19999 }] },
        };
      }
      if (path.includes('/sale_price')) {
        return { ok: false, status: 404, authenticated: true };
      }
      if (path.startsWith('/items/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            title: 'Smartphone flagship 256GB',
            category_id: 'MLM1055',
            pictures: [
              { id: 'ITEMCOVERAAA', secure_url: ITEM_PIC_A },
              { id: 'ITEMGALLERYB', secure_url: ITEM_PIC_B },
            ],
          },
        };
      }
      if (path.startsWith('/products/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            name: 'Catálogo familia celulares',
            pictures: [{ id: 'SIBLINGPHONE99', secure_url: SIBLING_CATALOG_PIC }],
          },
        };
      }
      if (path.startsWith('/categories/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: { path_from_root: [{ name: 'Celulares' }] },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });

    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const result = await fetchMercadoLibrePublicOffer(
      `https://articulo.mercadolibre.com.mx/${ITEM_ID.replace('MLM', 'MLM-')}-smartphone-flagship`,
    );

    expect(result?.itemId).toBe(ITEM_ID);
    expect(result?.pictures.some((u) => u.includes('SIBLINGPHONE99'))).toBe(false);
    expect(result?.pictures.length).toBeGreaterThanOrEqual(1);
    expect(result?.pictureCandidates.every((c) => c.sourceItemId === ITEM_ID)).toBe(true);
  });

  it('B. slug cambiado → misma identidad de item', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/items/') && !path.includes('/prices') && !path.includes('sale_price')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            title: 'Producto',
            pictures: [{ secure_url: ITEM_PIC_A }],
          },
        };
      }
      if (path.startsWith('/items/') && path.endsWith('/prices')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: { currency_id: 'MXN', prices: [{ type: 'standard', amount: 100 }] },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });

    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const a = await fetchMercadoLibrePublicOffer(
      `https://www.mercadolibre.com.mx/${ITEM_ID}-slug-viejo-_JM`,
    );
    const b = await fetchMercadoLibrePublicOffer(
      `https://articulo.mercadolibre.com.mx/${ITEM_ID}-slug-nuevo-totalmente-distinto-_JM`,
    );
    expect(a?.itemId).toBe(ITEM_ID);
    expect(b?.itemId).toBe(ITEM_ID);
    expect(a?.pictures[0]).toBeTruthy();
    expect(b?.pictures[0]).toBeTruthy();
  });

  it('C. producto sin galería de item → fail-closed (no inventar desde /products)', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/items/') && !path.includes('/prices') && !path.includes('sale_price')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: { title: 'Sin fotos', pictures: [] },
        };
      }
      if (path.startsWith('/products/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            name: 'Catálogo',
            pictures: [{ secure_url: SIBLING_CATALOG_PIC }],
          },
        };
      }
      if (path.startsWith('/items/') && path.endsWith('/prices')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: { currency_id: 'MXN', prices: [{ type: 'standard', amount: 50 }] },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });

    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const result = await fetchMercadoLibrePublicOffer(
      `https://articulo.mercadolibre.com.mx/${ITEM_ID}-sin-galeria`,
    );
    expect(result?.pictures ?? []).toEqual([]);
    expect(result?.pictures.some((u) => u.includes('SIBLING'))).toBe(false);
  });

  it('D. imagen de otro item → REJECT por provenance', () => {
    const merged = mergeMlImageCandidates(
      [
        [
          {
            url: ITEM_PIC_A,
            source: 'ml_api',
            sourceItemId: ITEM_ID,
            pictureId: 'A',
            isPrimary: true,
          },
          {
            url: OTHER_ITEM_PIC,
            source: 'ml_api',
            sourceItemId: 'MLM9999999999',
            pictureId: 'X',
            isPrimary: false,
          },
        ],
      ],
      { sourceItemId: ITEM_ID },
    );
    expect(merged.map((c) => c.url)).toEqual([ITEM_PIC_A]);
  });

  it('E. múltiples imágenes → todas del mismo producto', () => {
    const pics = picturesFromMlApiBody(
      {
        pictures: [
          { id: 'A', secure_url: ITEM_PIC_A },
          { id: 'B', secure_url: ITEM_PIC_B },
        ],
      },
      ITEM_ID,
    );
    expect(pics).toHaveLength(2);
    expect(pics.every((c) => c.sourceItemId === ITEM_ID)).toBe(true);
  });

  it('F. thumbnail vs full-size → mismo recurso de producto', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [THUMB],
      htmlImages: [FULL, OTHER_ITEM_PIC],
      sourceItemId: ITEM_ID,
    });
    expect(merged.some((u) => u.includes('OTHERMODEL'))).toBe(false);
    expect(merged.length).toBeGreaterThanOrEqual(1);
  });

  it('G. variación del mismo item → aceptada; otro item no', () => {
    const merged = mergeMlImageCandidates(
      [
        [
          {
            url: ITEM_PIC_A,
            source: 'ml_api',
            sourceItemId: ITEM_ID,
            pictureId: 'A',
            isPrimary: true,
          },
          {
            url: ITEM_PIC_B,
            source: 'ml_api_variation',
            sourceItemId: ITEM_ID,
            pictureId: 'B',
            isPrimary: false,
          },
          {
            url: OTHER_ITEM_PIC,
            source: 'ml_api_variation',
            sourceItemId: 'MLM0000000001',
            pictureId: 'Z',
            isPrimary: false,
          },
        ],
      ],
      { sourceItemId: ITEM_ID },
    );
    expect(merged).toHaveLength(2);
    expect(merged.every((c) => c.sourceItemId === ITEM_ID)).toBe(true);
  });

  it('H. URLs malformadas rechazadas', () => {
    expect(isRejectedMercadoLibreImage('not-a-url', ITEM_ID)).toBe(true);
    expect(isRejectedMercadoLibreImage('ftp://evil', ITEM_ID)).toBe(true);
  });

  it('I. producto inexistente → null / sin inventar imágenes', async () => {
    fetchMlApiMock.mockResolvedValue({ ok: false, status: 404, authenticated: true });
    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const result = await fetchMercadoLibrePublicOffer(
      'https://articulo.mercadolibre.com.mx/MLM-0000000000-no-existe',
    );
    expect(result == null || result.pictures.length === 0).toBe(true);
  });

  it('J. extractor bloqueado → merge vacío sin inventar', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [],
      htmlImages: [OTHER_ITEM_PIC, SIBLING_CATALOG_PIC],
      trustedHtmlImages: [],
      sourceItemId: ITEM_ID,
    });
    expect(merged).toEqual([]);
  });

  it('iPhone listing regression: /products sibling gallery never accepted as same item', async () => {
    // Property: catalog family pics must not leak into a specific listing gallery
    // (observed failure mode: wrong phone photos for a new flagship listing).
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/items/') && !path.includes('/prices') && !path.includes('sale_price')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            title: 'Apple iPhone flagship 256 GB Negro',
            pictures: [{ id: 'IPHONECOVER01', secure_url: ITEM_PIC_A }],
          },
        };
      }
      if (path.startsWith('/products/')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: {
            name: 'Celulares familia',
            pictures: [
              { id: 'SIBLINGPHONE99', secure_url: SIBLING_CATALOG_PIC },
              { id: 'OTHERMODELXX', secure_url: OTHER_ITEM_PIC },
            ],
          },
        };
      }
      if (path.startsWith('/items/') && path.endsWith('/prices')) {
        return {
          ok: true,
          authenticated: true,
          status: 200,
          data: { currency_id: 'MXN', prices: [{ type: 'standard', amount: 24999 }] },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });

    const { fetchMercadoLibrePublicOffer } = await import('@/lib/offers/mlPublicOffer');
    const result = await fetchMercadoLibrePublicOffer(
      `https://www.mercadolibre.com.mx/${ITEM_ID}-apple-iphone-flagship-256-gb-_JM`,
    );
    expect(result?.pictures.every((u) => !u.includes('SIBLING') && !u.includes('OTHERMODEL'))).toBe(
      true,
    );
    expect(result?.pictureCandidates.every((c) => c.sourceItemId === ITEM_ID)).toBe(true);
  });
});
