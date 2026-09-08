import { describe, expect, it } from 'vitest';
import { normalizePaapiItem, type PaapiItem } from '@/lib/bots/ingest/amazonPaapi';

function item(over: Partial<PaapiItem> = {}): PaapiItem {
  return {
    DetailPageURL: 'https://www.amazon.com.mx/dp/B08N5WRWNW',
    ItemInfo: { Title: { DisplayValue: 'Echo Dot 5ta gen con reloj' } },
    Images: {
      Primary: { Large: { URL: 'https://m.media-amazon.com/images/I/71ABCDEFGH._AC_SL1500_.jpg' } },
    },
    Offers: { Listings: [{ Price: { Amount: 799, Savings: { Amount: 200, Percentage: 20 } } }] },
    ...over,
  };
}

describe('normalizePaapiItem', () => {
  it('C. sin imagen → candidato con image missing, no se descarta', () => {
    const meta = normalizePaapiItem(
      item({
        Images: { Primary: {} },
      })
    );
    expect(meta).not.toBeNull();
    expect(meta?.imageUrl).toBe('');
    expect(meta?.title).toContain('Echo Dot');
    expect(meta?.discountPrice).toBe(799);
  });

  it('imagen inválida (logo) → missing, sigue vivo', () => {
    const meta = normalizePaapiItem(
      item({
        Images: { Primary: { Large: { URL: 'https://m.media-amazon.com/images/logo.png' } } },
      })
    );
    expect(meta).not.toBeNull();
    expect(meta?.imageUrl).toBe('');
  });

  it('sin título o sin precio → null', () => {
    expect(normalizePaapiItem(item({ ItemInfo: { Title: { DisplayValue: '' } } }))).toBeNull();
    expect(normalizePaapiItem(item({ Offers: { Listings: [{ Price: { Amount: 0 } }] } }))).toBeNull();
  });

  it('con imagen válida la conserva', () => {
    const meta = normalizePaapiItem(item());
    expect(meta?.imageUrl).toContain('71ABCDEFGH');
  });
});
