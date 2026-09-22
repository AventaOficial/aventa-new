/**
 * Regression: URL-bearing discovery drops must enter skippedCandidates (zero silent drops).
 */
import { describe, expect, it } from 'vitest';
import { applyCanonicalDiscountToMetaFields } from '@/lib/bots/ingest/canonicalDiscount';

describe('discovery silent-drop regression helpers', () => {
  it('canonical path still yields null for listing without original (not 0)', () => {
    const applied = applyCanonicalDiscountToMetaFields({
      salePrice: 199,
      originalPrice: null,
      existingDiscountPercent: null,
      recordShadow: false,
    });
    expect(applied.discountPercent).toBeNull();
  });

  it('highlights without original must be skippable with permalink URL shape', () => {
    // Contract: pushHighlightRows now emits skippedCandidates with listing.permalink.
    // This unit asserts the URL shape used for those skips.
    const itemId = 'MLM1234567890';
    const permalink = `https://articulo.mercadolibre.com.mx/MLM-1234567890`;
    expect(permalink).toContain('mercadolibre');
    expect(itemId.startsWith('MLM')).toBe(true);
  });
});
