/**
 * Day 12.3 — current evidence / originalPrice transport (no invented originals).
 */

import { describe, expect, it } from 'vitest';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { diagnoseProvenanceCompleteness } from '@/lib/hunter/discovery/provenanceCompleteness';
import { observeStickySkuViaServer } from '@/lib/hunter/supply/observeStickySkus';
import type { MercadoLibrePriceResolution } from '@/lib/offers/resolveMercadoLibrePrice';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { assignPrimaryTerminalReason } from '@/lib/hunter/discovery/verifiedYieldTerminal';

const RICH_IMAGE = 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg';

function resolvedPrice(over: Partial<MercadoLibrePriceResolution> = {}): MercadoLibrePriceResolution {
  return {
    status: 'resolved',
    price: 261,
    originalPrice: 399,
    regularPrice: null,
    promotionPrice: null,
    currency: 'MXN',
    source: 'items_prices',
    confidence: 'high',
    resolvedBy: 'items_prices',
    httpStatus: 200,
    ...over,
  };
}

function enrichTo(
  patch: Partial<ParsedOfferMetadata>,
): typeof import('@/lib/hunter/enrichment/enrichParsedOffer').enrichParsedOfferMetadata {
  return async (meta) => ({
    meta: { ...meta, ...patch },
    changed: true,
    skippedNetwork: true,
    imageStatus: patch.imageUrl ? 'valid' : 'missing',
  });
}

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-2501022145-_JM',
    title: 'Producto MLM2501022145',
    store: 'Mercado Libre',
    imageUrl: RICH_IMAGE,
    discountPrice: 5440.37,
    originalPrice: null,
    discountPercent: 0,
    ...over,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'unknown',
      historyReady: true,
      ...(over.signals ?? {}),
    },
  };
}

describe('Day12.3 original evidence fixtures', () => {
  it('A. current + original on /prices → provenance can complete', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM2501022145',
      nicheId: 'continuous_discovery',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () => resolvedPrice({ price: 5440.37, originalPrice: 7599 }),
        enrichMeta: enrichTo({
          title: 'Audífonos Bluetooth con cancelación',
          imageUrl: RICH_IMAGE,
          discountPrice: 5440.37,
          originalPrice: 7599,
        }),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.meta).not.toBeNull();
    expect(obs.meta?.originalPrice).toBe(7599);
    expect(obs.provenance.originalRecoveredVia).toBe('prices_endpoint');
    const report = diagnoseProvenanceCompleteness({
      meta: obs.meta,
      expectedProductId: 'MLM2501022145',
    });
    expect(report.gap).not.toBe('identity_mismatch');
    expect(report.complete).toBe(true);
    // Durable obs contract: original_source mirrors original_recovered_via.
    const { buildCandidateObservation } = await import(
      '@/lib/hunter/discovery/discoveryObservability'
    );
    const durable = buildCandidateObservation({
      url: obs.offerUrl,
      sourceId: 'sticky_near_ready',
      productId: 'MLM2501022145',
      historyReady: true,
      meta: obs.meta,
      acquisitionPath: 'sticky_observe',
      originalRecoveredVia: 'prices_endpoint',
      qualityDecision: 'SUPPRESSED',
      wouldInsert: false,
      dqeDecision: null,
      primaryTerminal: 'PROVENANCE_FAILURE',
      reasonCodes: [],
      provenanceDiag: report,
    });
    expect(durable.original_source).toBe('prices_endpoint');
    expect(durable.original_recovered_via).toBe(durable.original_source);
    expect(durable.original_price_provenance).toBeTruthy();
  });

  it('B. current on /prices + original via products/items → complete', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM75107099',
      nicheId: 'continuous_discovery',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () =>
          resolvedPrice({ price: 859, originalPrice: null, regularPrice: null }),
        enrichMeta: enrichTo({
          title: 'Producto catalog tip con listing',
          imageUrl: RICH_IMAGE,
        }),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
        fetchApi: async (path: string) => {
          if (path.endsWith('/items')) {
            return {
              ok: true,
              status: 200,
              authenticated: true,
              data: {
                results: [{ item_id: 'MLM6202727240', price: 859, original_price: 1499 }],
              },
            };
          }
          if (path.includes('/products/')) {
            return {
              ok: true,
              status: 200,
              authenticated: true,
              data: { name: 'Producto catalog tip con listing', pictures: [{ secure_url: RICH_IMAGE }] },
            };
          }
          return { ok: false, status: 404, authenticated: true, data: null };
        },
      },
    });
    expect(obs.provenance.originalRecoveredVia).toBe('products_items');
    expect(obs.meta?.originalPrice).toBe(1499);
    const report = diagnoseProvenanceCompleteness({
      meta: obs.meta,
      expectedProductId: 'MLM75107099',
    });
    expect(report.complete).toBe(true);
    expect(report.identityMatchMethod).toBe('catalog_to_listing_via_products_items');
  });

  it('C. current only → missing_current_original (honest)', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM2501022145',
      nicheId: 'continuous_discovery',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () =>
          resolvedPrice({ price: 5440.37, originalPrice: null, regularPrice: null }),
        enrichMeta: enrichTo({ title: '', imageUrl: '' }),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
        fetchApi: async () => ({
          ok: true,
          status: 200,
          authenticated: true,
          data: { results: [{ item_id: 'MLM2501022145', price: 5440.37 }] },
        }),
      },
    });
    // Day 12.3: meta retained for provenance even with thin title.
    expect(obs.meta).not.toBeNull();
    expect(obs.meta?.discountPrice).toBe(5440.37);
    expect(obs.meta?.originalPrice).toBeNull();
    expect(obs.provenance.originalRecoveredVia).toBe('unavailable');
    const report = diagnoseProvenanceCompleteness({
      meta: obs.meta,
      expectedProductId: 'MLM2501022145',
    });
    expect(report.complete).toBe(false);
    expect(report.gap).toBe('missing_current_original');
    expect(report.diagnosticCodes).toContain('PROVENANCE_MISSING_CURRENT_EVIDENCE');
  });

  it('D. original on different listing without binding → identity_mismatch', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta({
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-9999999999-_JM',
        originalPrice: 7599,
        signals: {
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance: 'source_explicit',
          historyReady: true,
          // acquired listing does not match URL
          mlCatalogProductId: 'MLM2501022145',
          mlListingItemId: 'MLM8888888888',
        },
      }),
      expectedProductId: 'MLM2501022145',
    });
    expect(report.gap).toBe('identity_mismatch');
    expect(report.complete).toBe(false);
  });

  it('E. stale / absent current evidence → stale_or_absent_current', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta({ originalPrice: 175, discountPrice: 130 }),
      expectedProductId: 'MLM2177969823',
      currentEvidenceAbsent: true,
    });
    expect(report.gap).toBe('stale_or_absent_current');
    expect(report.diagnosticCodes).toContain('PROVENANCE_STALE_EVIDENCE');
  });

  it('F. explicit original source_explicit + matching identity → complete', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta({
        originalPrice: 7599,
        discountPrice: 5440.37,
        discountPercent: 28,
        signals: {
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance: 'source_explicit',
          historyReady: true,
          mlCatalogProductId: 'MLM2501022145',
          mlListingItemId: 'MLM2501022145',
        },
      }),
      expectedProductId: 'MLM2501022145',
    });
    expect(report.complete).toBe(true);
    expect(report.identityMatchMethod).toBe('exact_item_id');
  });
});

describe('Day12.3 terminal + safety', () => {
  it('INVALID_ORIGINAL_PRICE still maps to PROVENANCE_FAILURE', () => {
    const terminal = assignPrimaryTerminalReason({
      dryRun: true,
      identityValid: true,
      extracted: true,
      fetchBlocked: false,
      historyReady: true,
      dqeDecision: 'NO_VERIFIED_DEAL',
      s61WouldInsert: false,
      s61QualityDecision: 'SUPPRESSED',
      reasonCodes: ['INVALID_ORIGINAL_PRICE', 'PROVENANCE_MISSING_CURRENT_EVIDENCE'],
    });
    expect(terminal).toBe('PROVENANCE_FAILURE');
  });

  it('machine pending remains off', () => {
    expect(isMachinePendingWriteEnabled()).toBe(false);
  });
});
