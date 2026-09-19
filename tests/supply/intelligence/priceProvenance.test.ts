import { describe, expect, it } from 'vitest';
import { buildPriceEvidence, provenanceFromApiQuote } from '@/lib/supply/intelligence/priceProvenance';
import type { OpportunityCandidate } from '@/lib/supply/intelligence/types';

function baseCandidate(over: Partial<OpportunityCandidate> = {}): OpportunityCandidate {
  return {
    url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-test',
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-test',
    salePrice: 800,
    declaredOriginalPrice: 1600,
    declaredDiscountPercent: 50,
    signals: {
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
    },
    ...over,
  };
}

describe('S8 priceProvenance', () => {
  it('preserves trusted listing_card reference', () => {
    const built = buildPriceEvidence({ candidate: baseCandidate() });
    expect(built.referencePrice?.amount).toBe(1600);
    expect(built.referencePrice?.trusted).toBe(true);
    expect(built.referencePrice?.kind).toBe('listing_card');
    expect(built.discountPercent).toBe(50);
  });

  it('null reference when original untrusted (badge reconstructed)', () => {
    const built = buildPriceEvidence({
      candidate: baseCandidate({
        signals: {
          originalPriceProvenance: 'unknown',
          cardDiscountSource: 'badge_reconstructed',
          cardBadgePercent: 40,
        },
        cardDiscountSource: 'badge_reconstructed',
        cardBadgePercent: 40,
      }),
    });
    expect(built.referencePrice?.trusted).toBe(false);
    expect(built.referencePrice?.amount).toBeNull();
    expect(built.discountPercent).toBeNull();
  });

  it('never invents reference from API when list <= sale', () => {
    const mapped = provenanceFromApiQuote({
      adapterId: 'mercadolibre',
      saleAmount: 999,
      listAmount: 900,
    });
    expect(mapped.list).toBeNull();
  });

  it('adapter api quote becomes trusted reference when list > sale', () => {
    const built = buildPriceEvidence({
      candidate: baseCandidate({
        declaredOriginalPrice: null,
        signals: {},
      }),
      adapterSale: {
        amount: 800,
        kind: 'api_quote',
        source: 'mercadolibre',
        observedAt: '2026-01-01T00:00:00.000Z',
        trusted: true,
      },
      adapterList: {
        amount: 1200,
        kind: 'api_quote',
        source: 'mercadolibre',
        observedAt: '2026-01-01T00:00:00.000Z',
        trusted: true,
      },
    });
    expect(built.referencePrice?.amount).toBe(1200);
    expect(built.referencePrice?.trusted).toBe(true);
    expect(built.discountPercent).toBe(33);
  });
});
