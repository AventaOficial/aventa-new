/**
 * Day 12.2 — sticky reacquisition identity binding (PRODUCT ≠ LISTING).
 * Does not relax DQE/S6.1; does not invent catalog↔listing maps.
 */

import { describe, expect, it } from 'vitest';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  diagnoseProvenanceCompleteness,
  resolveStickyIdentityMatch,
} from '@/lib/hunter/discovery/provenanceCompleteness';
import { assignPrimaryTerminalReason } from '@/lib/hunter/discovery/verifiedYieldTerminal';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-4503400006-_JM',
    title: 'Producto identity binding Day12.2',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg',
    discountPrice: 1981.73,
    originalPrice: 2621,
    discountPercent: 24,
    ...over,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      historyReady: true,
      suspectedArtificialListPrice: false,
      ...(over.signals ?? {}),
    },
  };
}

describe('Day12.2 resolveStickyIdentityMatch', () => {
  it('A. catalog tip == listing item on URL → exact_item_id', () => {
    const r = resolveStickyIdentityMatch({
      expectedTipId: 'MLM4503400006',
      urlItemId: 'MLM4503400006',
      acquiredListingItemId: 'MLM4503400006',
      catalogProductId: 'MLM4503400006',
    });
    expect(r.matched).toBe(true);
    expect(r.method).toBe('exact_item_id');
  });

  it('B. catalog tip ≠ listing but products/items binding present → match', () => {
    const r = resolveStickyIdentityMatch({
      expectedTipId: 'MLM63084226',
      urlItemId: 'MLM4503400006',
      acquiredListingItemId: 'MLM4503400006',
      catalogProductId: 'MLM63084226',
    });
    expect(r.matched).toBe(true);
    expect(r.method).toBe('catalog_to_listing_via_products_items');
  });

  it('C. variant/listing differs from acquired listing → mismatch', () => {
    const r = resolveStickyIdentityMatch({
      expectedTipId: 'MLM63084226',
      urlItemId: 'MLM9999999999',
      acquiredListingItemId: 'MLM4503400006',
      catalogProductId: 'MLM63084226',
    });
    expect(r.matched).toBe(false);
    expect(r.detail).toContain('product_id_url_mismatch');
  });

  it('D. different listing of same catalog without acquired listing signal → mismatch', () => {
    const r = resolveStickyIdentityMatch({
      expectedTipId: 'MLM63084226',
      urlItemId: 'MLM4503400006',
      acquiredListingItemId: null,
      catalogProductId: 'MLM63084226',
    });
    expect(r.matched).toBe(false);
  });

  it('E. no reliable mapping → mismatch', () => {
    const r = resolveStickyIdentityMatch({
      expectedTipId: 'MLM111',
      urlItemId: 'MLM222',
      acquiredListingItemId: 'MLM333',
      catalogProductId: 'MLM111',
    });
    expect(r.matched).toBe(false);
  });
});

describe('Day12.2 diagnoseProvenanceCompleteness with binding', () => {
  it('B. catalog→listing via signals does NOT emit identity_mismatch', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta({
        signals: {
          mlCatalogProductId: 'MLM63084226',
          mlListingItemId: 'MLM4503400006',
          mlIdentityMatchMethod: 'catalog_to_listing_via_products_items',
          historyReady: true,
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance: 'source_explicit',
        },
      }),
      expectedProductId: 'MLM63084226',
    });
    expect(report.gap).not.toBe('identity_mismatch');
    expect(report.diagnosticCodes).not.toContain('PROVENANCE_IDENTITY_MISMATCH');
    expect(report.identityMatchMethod).toBe('catalog_to_listing_via_products_items');
    // Still requires trusted original etc. — may be complete if signals trust.
    expect(report.complete).toBe(true);
  });

  it('E. without listing binding signal → identity_mismatch preserved', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta({
        signals: {
          historyReady: true,
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance: 'source_explicit',
        },
      }),
      expectedProductId: 'MLM63084226',
    });
    expect(report.complete).toBe(false);
    expect(report.gap).toBe('identity_mismatch');
    expect(report.diagnosticCodes).toContain('PROVENANCE_IDENTITY_MISMATCH');
  });

  it('does not mark complete when binding ok but original missing', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta({
        originalPrice: null,
        discountPercent: 0,
        signals: {
          mlCatalogProductId: 'MLM63084226',
          mlListingItemId: 'MLM4503400006',
          historyReady: true,
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance: 'unknown',
        },
      }),
      expectedProductId: 'MLM63084226',
    });
    expect(report.gap).toBe('missing_current_original');
    expect(report.identityMatchMethod).toBe('catalog_to_listing_via_products_items');
    expect(report.complete).toBe(false);
  });

  it('A. exact tip==url still complete', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta({
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-_JM',
        signals: {
          mlCatalogProductId: 'MLM1234567890',
          mlListingItemId: 'MLM1234567890',
          historyReady: true,
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance: 'source_explicit',
        },
      }),
      expectedProductId: 'MLM1234567890',
    });
    expect(report.complete).toBe(true);
    expect(report.identityMatchMethod).toBe('exact_item_id');
  });
});

describe('Day12.2 terminal / safety unchanged by identity bind', () => {
  it('identity bind does not erase PARTIAL_NO_HISTORY terminal authority', () => {
    const terminal = assignPrimaryTerminalReason({
      dryRun: true,
      identityValid: true,
      extracted: true,
      fetchBlocked: false,
      historyReady: false,
      dqeDecision: 'VERIFIED_DEAL',
      s61WouldInsert: true,
      s61QualityDecision: 'VERIFIED_OPPORTUNITY',
      reasonCodes: ['VERIFIED_PDP_PRICE', 'PARTIAL_NO_HISTORY'],
    });
    expect(terminal).toBe('INSUFFICIENT_HISTORY');
  });

  it('machine pending remains off', () => {
    expect(isMachinePendingWriteEnabled()).toBe(false);
  });
});
