import { describe, expect, it } from 'vitest';
import { recoverMissingMercadoLibrePictures } from '@/lib/offers/mlPublicOffer';

const ITEM = 'MLM1413356802';
const COVER = 'https://http2.mlstatic.com/D_NQ_NP_2X_18625838-F.webp';

describe('recuperación de imágenes de Mercado Libre', () => {
  it('si el item ya tiene fotos, no las sustituye por el catálogo', () => {
    const existing = [{
      url: 'https://http2.mlstatic.com/D_NQ_NP_2X_1413356802-F.webp',
      source: 'ml_api' as const,
      sourceItemId: ITEM,
      pictureId: null,
      isPrimary: true,
    }];
    const out = recoverMissingMercadoLibrePictures({
      existing,
      item: null,
      productPictures: [{ url: COVER }],
      itemId: ITEM,
    });
    expect(out).toBe(existing);
  });

  it('sin galería del item usa el thumbnail de ese mismo item', () => {
    const out = recoverMissingMercadoLibrePictures({
      existing: [],
      item: { secure_thumbnail: 'https://http2.mlstatic.com/D_NQ_NP_2X_1413356802-F.webp' },
      productPictures: [{ url: COVER }],
      itemId: ITEM,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toContain('1413356802');
    expect(out[0]?.sourceItemId).toBe(ITEM);
  });

  it('sin thumbnail usa una sola portada del producto de catálogo', () => {
    const out = recoverMissingMercadoLibrePictures({
      existing: [],
      item: {},
      productPictures: [
        { url: COVER },
        { url: 'https://http2.mlstatic.com/D_NQ_NP_2X_999-F.webp' },
      ],
      itemId: ITEM,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toBe(COVER);
  });

  it('no inventa una imagen si no hay ninguna fuente', () => {
    expect(recoverMissingMercadoLibrePictures({
      existing: [],
      item: {},
      productPictures: [],
      itemId: ITEM,
    })).toEqual([]);
  });
});
