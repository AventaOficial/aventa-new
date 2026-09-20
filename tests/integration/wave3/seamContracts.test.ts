import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { seamS8toS9 } from '@/lib/wave3/seams/contracts';
import { assertWave3StagingOnly, WAVE3_STAGING_REF } from '@/lib/wave3/guards';

describe('WAVE3 seam contracts', () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env = {
      ...prev,
      NODE_ENV: 'test',
      SUPPLY_AUTOMATION_ENABLED: 'true',
      MONEY_PATH_FROZEN: 'true',
    };
    delete process.env.VERCEL_ENV;
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it('S8→S9 eligible for verified opportunity', async () => {
    const { decision, diagnostic } = await seamS8toS9({
      candidate: {
        url: 'https://articulo.mercadolibre.com.mx/MLM-W3SEAM1',
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-W3SEAM1',
        title: 'Wave3 Seam Headphones Bluetooth ANC Premium',
        imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_w3seam.jpg',
        salePrice: 799,
        declaredOriginalPrice: 1999,
        signals: {
          originalPriceProvenance: 'listing_card',
          cardDiscountSource: 'card_strikethrough',
          historyReady: true,
        },
      },
      skipAdapterFetch: true,
      mode: 'dry_run',
    });
    expect(diagnostic.seam).toBe('S8→S9');
    expect(decision.code).toBe('ELIGIBLE');
    expect(decision.s8Decision).toBe('OPPORTUNITY');
  });

  it('S8→S9 fail-closed without image', async () => {
    const { decision } = await seamS8toS9({
      candidate: {
        url: 'https://articulo.mercadolibre.com.mx/MLM-W3SEAM2',
        title: 'No image item bluetooth',
        salePrice: 100,
        declaredOriginalPrice: 200,
        imageUrl: null,
        signals: {
          originalPriceProvenance: 'listing_card',
          cardDiscountSource: 'card_strikethrough',
        },
      },
      skipAdapterFetch: true,
    });
    expect(decision.eligible).toBe(false);
  });

  it('staging guard accepts staging ref', () => {
    const g = assertWave3StagingOnly({
      AVENTA_SUPABASE_TARGET: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: `https://${WAVE3_STAGING_REF}.supabase.co`,
      AVENTA_EXPECTED_SUPABASE_REF: WAVE3_STAGING_REF,
      VERCEL_ENV: 'preview',
      NODE_ENV: 'test',
    });
    expect(g.ok).toBe(true);
  });
});
