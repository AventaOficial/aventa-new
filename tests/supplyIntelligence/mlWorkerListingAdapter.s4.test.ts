/**
 * S4 — ML Worker SourceAdapter dry-run tests.
 * Fixtures only; no network, no DB inserts, no Distribution.
 */

import { describe, expect, it } from 'vitest';
import type { ExternalWorkerCandidate } from '@/lib/bots/ingest/externalWorker';
import {
  DEAL_SCORE_VERSION,
  observationsAreSame,
  sourceEventsAreSame,
} from '@/lib/dealIntelligence';
import {
  buildMlWorkerSourceEventId,
  createDryRunGateConfig,
  createMlWorkerListingAdapter,
  normalizeMlWorkerListing,
  normalizedListingToRawObservation,
  runMlWorkerListingDryRun,
} from '@/lib/supplyIntelligence';

function goodCandidate(over: Partial<ExternalWorkerCandidate> = {}): ExternalWorkerCandidate {
  return {
    url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-audifonos-bluetooth',
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-audifonos-bluetooth',
    title: 'Audífonos Bluetooth noise cancelling oferta especial',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_123-O.jpg',
    discountPrice: 999,
    originalPrice: 1999,
    discountPercent: 50,
    sourceDetail: 'seed:test',
    signals: {
      soldQuantity: 200,
      ratingAverage: 4.6,
      ratingCount: 80,
      historyReady: true,
      savingsVsHabitualPct: 18,
      effectiveDiscountPercent: 50,
      suspectedArtificialListPrice: false,
    },
    ...over,
  };
}

describe('S4 ML Worker SourceAdapter', () => {
  it('1. valid source item → RawObservation', () => {
    const n = normalizeMlWorkerListing(goodCandidate());
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    const obs = normalizedListingToRawObservation(n.value);
    expect(obs.sourceEvent.sourceId).toBe('ml_worker');
    expect(obs.salePrice).toBe(999);
    expect(obs.currency).toBe('MXN');
    expect(obs.payload.evidenceHash).toBeTruthy();
  });

  it('2. source event ID determinism', () => {
    const a = buildMlWorkerSourceEventId({
      url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-x',
    });
    const b = buildMlWorkerSourceEventId({
      url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-y',
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-z',
    });
    expect(a).toBe('ml_worker:ml:MLM1234567890');
    expect(b).toBe(a);
  });

  it('3. missing external ID → rejected', () => {
    const n = normalizeMlWorkerListing(
      goodCandidate({
        url: 'https://www.mercadolibre.com.mx/ofertas',
        canonicalUrl: 'https://www.mercadolibre.com.mx/ofertas',
      }),
    );
    expect(n.ok).toBe(false);
    if (n.ok) return;
    expect(n.reason).toBe('missing_external_id');
  });

  it('3b. /up/MLMU user-product URL → accepted (worker card reality)', () => {
    const n = normalizeMlWorkerListing(
      goodCandidate({
        url: 'https://www.mercadolibre.com.mx/espejo-luz-led/up/MLMU3097285590',
        canonicalUrl: 'https://www.mercadolibre.com.mx/espejo-luz-led/up/MLMU3097285590',
      }),
    );
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.value.externalListingId).toBe('MLMU3097285590');
    expect(n.value.sourceEventId).toBe('ml_worker:ml:MLMU3097285590');
  });

  it('4. malformed URL → rejected', () => {
    const n = normalizeMlWorkerListing(goodCandidate({ url: 'not-a-url', canonicalUrl: 'not-a-url' }));
    expect(n.ok).toBe(false);
    if (n.ok) return;
    expect(n.reason).toMatch(/malformed_url|invalid/);
  });

  it('5. malformed price → rejected', () => {
    const n = normalizeMlWorkerListing(goodCandidate({ discountPrice: -1 }));
    expect(n.ok).toBe(false);
    if (n.ok) return;
    expect(n.reason).toBe('malformed_price');
  });

  it('6. missing title → rejected', () => {
    const n = normalizeMlWorkerListing(goodCandidate({ title: '   ' }));
    expect(n.ok).toBe(false);
    if (n.ok) return;
    expect(n.reason).toBe('missing_title');
  });

  it('7. missing image still normalizes (image optional at normalize)', () => {
    const n = normalizeMlWorkerListing(goodCandidate({ imageUrl: null }));
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.value.meta.imageUrl).toBe('');
  });

  it('8. currency handling → MXN on observation', () => {
    const n = normalizeMlWorkerListing(goodCandidate());
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    const obs = normalizedListingToRawObservation(n.value);
    expect(obs.currency).toBe('MXN');
  });

  it('9–10. duplicate observation / repeated source event idempotent', () => {
    const n = normalizeMlWorkerListing(goodCandidate());
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    const at = '2026-09-18T15:30:10.000Z';
    const a = normalizedListingToRawObservation(n.value, { observedAt: at });
    const b = normalizedListingToRawObservation(n.value, {
      observedAt: '2026-09-18T15:30:50.000Z',
    });
    expect(sourceEventsAreSame(a.sourceEvent, b.sourceEvent)).toBe(true);
    expect(observationsAreSame(a, b)).toBe(true);
  });

  it('11–13. normalization / provenance / parser version preserved', async () => {
    const adapter = createMlWorkerListingAdapter({ candidates: [goodCandidate()] });
    const out = await adapter.discover({ maxItems: 5, now: new Date('2026-09-18T12:00:00Z') });
    expect(adapter.canInsertOffers).toBe(false);
    expect(adapter.canPublish).toBe(false);
    expect(out.items[0]?.status).toBe('discovered');
    if (out.items[0]?.status !== 'discovered') return;
    const obs = out.items[0].observation;
    expect(obs.parserVersion).toContain('ml_worker_listing_adapter');
    expect(obs.normalizationVersion).toBeTruthy();
    expect(obs.payload.evidenceHash).toBeTruthy();
    expect(obs.provenance.captureMethod).toBe('browser_justified');
  });
});

describe('S4 dry-run pipeline', () => {
  it('14. verifier rejection / low score → SUPPRESSED', async () => {
    const report = await runMlWorkerListingDryRun({
      candidates: [
        goodCandidate({
          discountPrice: 1900,
          originalPrice: 1999,
          discountPercent: 5,
          signals: { effectiveDiscountPercent: 5, soldQuantity: 1, ratingAverage: 3 },
        }),
      ],
      config: createDryRunGateConfig({ minDiscountPercent: 20, rejectBelowScore: 90 }),
      maxItems: 5,
      runId: 'test-reject',
    });
    expect(report.dryRun).toBe(true);
    expect(report.wouldInsertCount).toBe(0);
    expect(report.items.every((i) => i.offerInserted === false)).toBe(true);
    expect(
      report.items.some((i) => i.status === 'SUPPRESSED' || i.status === 'FAILED'),
    ).toBe(true);
  });

  it('15. low-quality suppression (discount gate)', async () => {
    const report = await runMlWorkerListingDryRun({
      candidates: [
        goodCandidate({
          discountPrice: 950,
          originalPrice: 1000,
          discountPercent: 5,
        }),
      ],
      config: createDryRunGateConfig({ minDiscountPercent: 20 }),
      maxItems: 3,
    });
    expect(report.wouldInsertCount).toBe(0);
    expect(report.items[0]?.status).toBe('SUPPRESSED');
  });

  it('16. duplicate offer suppression', async () => {
    const report = await runMlWorkerListingDryRun({
      candidates: [goodCandidate()],
      maxItems: 3,
      duplicateLookup: () => ({ kind: 'live' }),
    });
    expect(report.duplicateSuppressions).toBe(1);
    expect(report.items[0]?.status).toBe('DUPLICATE');
    expect(report.items[0]?.offerInserted).toBe(false);
  });

  it('17–18. would-insert candidate · dry-run never inserts', async () => {
    const report = await runMlWorkerListingDryRun({
      candidates: [goodCandidate()],
      maxItems: 5,
      runId: 'would-insert',
    });
    expect(report.wouldInsertCount).toBeGreaterThanOrEqual(1);
    expect(report.items.some((i) => i.status === 'WOULD_INSERT')).toBe(true);
    expect(report.items.every((i) => i.offerInserted === false)).toBe(true);
    expect(report.note).toMatch(/offers_inserted=0/);
    expect(report.items.find((i) => i.status === 'WOULD_INSERT')?.dealScoreVersion).toBe(
      DEAL_SCORE_VERSION,
    );
  });

  it('19–20. one bad item does not abort batch · failure isolation', async () => {
    const report = await runMlWorkerListingDryRun({
      candidates: [
        goodCandidate({ title: '' }),
        goodCandidate({
          url: 'https://articulo.mercadolibre.com.mx/MLM-2222222222-segundo',
          canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-2222222222-segundo',
          title: 'Segundo producto válido con descuento real bueno',
        }),
        goodCandidate({
          url: 'https://evil.example.com/x',
          canonicalUrl: 'https://evil.example.com/x',
        }),
      ],
      maxItems: 10,
    });
    expect(report.items.length).toBe(3);
    expect(report.normalizationFailures).toBeGreaterThanOrEqual(1);
    expect(report.discoveries + report.normalizationFailures).toBe(3);
    expect(report.items.every((i) => i.offerInserted === false)).toBe(true);
  });

  it('idempotency: two dry-runs same discovery → same identities, zero inserts', async () => {
    const candidates = [goodCandidate()];
    const a = await runMlWorkerListingDryRun({
      candidates,
      maxItems: 5,
      runId: 'idem-a',
      now: new Date('2026-09-18T12:00:00Z'),
    });
    const b = await runMlWorkerListingDryRun({
      candidates,
      maxItems: 5,
      runId: 'idem-b',
      now: new Date('2026-09-18T12:00:00Z'),
    });
    expect(a.items[0]?.sourceEventId).toBe(b.items[0]?.sourceEventId);
    expect(a.items[0]?.observationIdempotencyKey).toBe(b.items[0]?.observationIdempotencyKey);
    expect(a.wouldInsertCount).toBe(b.wouldInsertCount);
    expect(a.items.every((i) => i.offerInserted === false)).toBe(true);
  });

  it('security: non-allowlisted host rejected; adapter cannot insert/publish', async () => {
    const adapter = createMlWorkerListingAdapter({
      candidates: [
        goodCandidate({
          url: 'https://127.0.0.1/ml',
          canonicalUrl: 'https://127.0.0.1/ml',
        }),
      ],
    });
    expect(adapter.canInsertOffers).toBe(false);
    expect(adapter.canPublish).toBe(false);
    expect(adapter.canModifyRewards).toBe(false);
    const out = await adapter.discover({ maxItems: 5 });
    expect(out.items[0]?.status).toBe('rejected');
  });

  it('sample cap ≤ 50; structured dry-run report fields present', async () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      goodCandidate({
        url: `https://articulo.mercadolibre.com.mx/MLM-${1000000000 + i}-item`,
        canonicalUrl: `https://articulo.mercadolibre.com.mx/MLM-${1000000000 + i}-item`,
        title: `Producto de prueba número ${i} con título suficiente`,
      }),
    );
    const report = await runMlWorkerListingDryRun({
      candidates: many,
      maxItems: 50,
      runId: 'sample-cap',
    });
    expect(report.sampleSizeRequested).toBe(50);
    expect(report.discoveries + report.normalizationFailures).toBeLessThanOrEqual(50);
    expect(report.safety.dryRunForced).toBe(true);
    expect(report.safety.adapterCanInsertOffers).toBe(false);
    expect(typeof report.latencyMs).toBe('number');
    expect(report.scoreDistribution).toBeTruthy();
  });
});
