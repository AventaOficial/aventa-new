import { describe, expect, it } from 'vitest';
import { evaluateOpportunity } from '@/lib/supply/intelligence/evaluateOpportunity';
import { observeOpportunityFromIngest } from '@/lib/supply/intelligence/observeOpportunity';
import type { OpportunityCandidate } from '@/lib/supply/intelligence/types';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

function candidate(over: Partial<OpportunityCandidate> = {}): OpportunityCandidate {
  return {
    url: 'https://articulo.mercadolibre.com.mx/MLM-9998887770-audifonos',
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-9998887770-audifonos',
    title: 'Audífonos Bluetooth premium noise cancelling',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_123-O.jpg',
    salePrice: 799,
    declaredOriginalPrice: 1999,
    declaredDiscountPercent: 60,
    signals: {
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      soldQuantity: 120,
      ratingAverage: 4.6,
      historyReady: true,
    },
    sourceId: 'ml_worker',
    ...over,
  };
}

function parsedMeta(): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-9998887770-audifonos',
    title: 'Audífonos Bluetooth premium noise cancelling',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_123-O.jpg',
    discountPrice: 799,
    originalPrice: 1999,
    discountPercent: 60,
    currency: 'MXN',
    signals: {
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
    },
  };
}

describe('S8 evaluateOpportunity', () => {
  it('verified opportunity with trusted card evidence', async () => {
    const result = await evaluateOpportunity(candidate(), {
      skipAdapterFetch: true,
      forceDryRun: true,
    });
    expect(result.decision).toBe('OPPORTUNITY');
    expect(result.score.reasonCodes).toContain('VERIFIED_OPPORTUNITY');
    expect(result.productFingerprint).toBeTruthy();
    expect(result.dryRun).toBe(true);
  });

  it('observeOpportunityFromIngest is shadow-only (no adapter fetch)', async () => {
    const result = await observeOpportunityFromIngest({
      url: parsedMeta().canonicalUrl,
      meta: parsedMeta(),
      sourceId: 'ml_worker',
    });
    expect(result.dryRun).toBe(true);
    expect(result.adapterNotes).toContain('adapter_fetch_skipped');
    expect(result.decision).toBe('OPPORTUNITY');
  });

  it('badge-only candidate rejected', async () => {
    const result = await evaluateOpportunity(
      candidate({
        signals: {
          cardDiscountSource: 'badge_reconstructed',
          cardBadgePercent: 45,
          originalPriceProvenance: 'unknown',
        },
        cardDiscountSource: 'badge_reconstructed',
        cardBadgePercent: 45,
      }),
      { skipAdapterFetch: true, forceDryRun: true },
    );
    expect(result.decision).toBe('REJECT');
    expect(result.score.reasonCodes).toContain('BADGE_RECONSTRUCTED');
  });
});
