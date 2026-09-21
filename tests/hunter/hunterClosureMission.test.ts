/**
 * Hunter Closure Mission — identity, completeness, temporal novelty,
 * stickiness, DQ, discount static guard, experiment hard wall, labels BLOCKED.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertZeroInsertAttempts,
  buildLossFunnelReport,
  buildMissionControlReport,
  buildTemporalWindows,
  computeLabelAvailability,
  computeStickinessReport,
  computeTemporalNovelty,
  reconcileDiscoveryCompleteness,
  resolveCandidateIdentity,
  scanDiscountTruthStatic,
  scanSourceForForbiddenMint,
  validateCandidateTelemetry,
} from '@/lib/hunter/candidateIntelligence';

describe('candidate identity model', () => {
  it('classifies ml_item / asin / url / fingerprint without inventing', () => {
    const ml = resolveCandidateIdentity({
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo',
    });
    expect(ml.identityType).toBe('ml_item');
    expect(ml.sourceItemId).toMatch(/MLM/i);
    expect(ml.urlOnly).toBe(false);

    const asin = resolveCandidateIdentity({
      canonicalUrl: 'https://www.amazon.com.mx/dp/B08N5WRWNW',
    });
    expect(asin.identityType).toBe('asin');
    expect(asin.sourceItemId).toBe('B08N5WRWNW');

    const urlOnly = resolveCandidateIdentity({
      canonicalUrl: 'https://www.walmart.com.mx/ip/some-product/123',
    });
    expect(urlOnly.identityType).toBe('url');
    expect(urlOnly.urlOnly).toBe(true);
    expect(urlOnly.productIdentity).toBeNull();

    const fp = resolveCandidateIdentity({
      canonicalUrl: 'https://example.com/x',
      productFingerprint: 'abc123',
    });
    expect(fp.identityType).toBe('fingerprint');

    const unknown = resolveCandidateIdentity({});
    expect(unknown.identityType).toBe('unknown');
    expect(unknown.identityKey).toBeNull();
  });
});

describe('completeness reconciliation', () => {
  it('fails on gap / conflicting terminals / missing terminal', () => {
    const ok = reconcileDiscoveryCompleteness({
      rows: [
        { url: 'https://a', decision: 'WOULD_INSERT' },
        { url: 'https://b', decision: 'REJECTED_DISCOUNT' },
        { url: 'https://c', decision: 'REJECTED_BUDGET' },
      ],
    });
    expect(ok.ok).toBe(true);
    expect(ok.gap).toBe(0);
    expect(ok.discovered).toBe(3);

    const conflict = reconcileDiscoveryCompleteness({
      rows: [
        { url: 'https://a', decision: 'WOULD_INSERT' },
        { url: 'https://a', decision: 'REJECTED_DISCOUNT' },
      ],
    });
    expect(conflict.conflictingDecisions.length).toBeGreaterThan(0);
    expect(conflict.ok).toBe(false);

    const missing = reconcileDiscoveryCompleteness({
      rows: [{ url: 'https://z', decision: 'DISCOVERED' }],
      requireTerminalBeyondDiscovered: true,
    });
    expect(missing.missingTerminal.length).toBe(1);
    expect(missing.ok).toBe(false);
  });
});

describe('temporal novelty non-overlapping', () => {
  it('returns null when baseline empty; value when present; never 0-from-null', () => {
    const windows = buildTemporalWindows('2026-09-20T00:00:00.000Z', '2026-09-21T00:00:00.000Z');
    expect(windows.baseline_24h?.until).toBe('2026-09-20T00:00:00.000Z');
    expect(windows.baseline_7d?.until).toBe('2026-09-20T00:00:00.000Z');
    expect(windows.note).toMatch(/No overlap/);

    const empty = computeTemporalNovelty({
      since: '2026-09-20T00:00:00.000Z',
      until: '2026-09-21T00:00:00.000Z',
      currentRows: [{ canonicalUrl: 'https://ml.mx/MLM-1' }],
      baseline24hRows: [],
      baseline7dRows: [],
    });
    expect(empty.novelty_24h).toBeNull();
    expect(empty.jaccard_24h).toBeNull();
    expect(empty.novelty_7d).toBeNull();
    expect(empty.jaccard_7d).toBeNull();

    const withBase = computeTemporalNovelty({
      since: '2026-09-20T00:00:00.000Z',
      until: '2026-09-21T00:00:00.000Z',
      currentRows: [
        { canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1111111111' },
        { canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-2222222222' },
      ],
      baseline24hRows: [{ canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1111111111' }],
      baseline7dRows: [
        { canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1111111111' },
        { canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-3333333333' },
      ],
    });
    expect(withBase.novelty_24h).not.toBeNull();
    expect(withBase.jaccard_24h).not.toBeNull();
    expect(withBase.novelty_24h!).toBeGreaterThan(0);
    expect(withBase.novelty_24h!).toBeLessThanOrEqual(1);
  });
});

describe('stickiness diagnostics', () => {
  it('reports repeat rates and STICKY_* flags without inventing query metadata', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      canonicalUrl: i < 18 ? 'https://example.com/same' : `https://example.com/${i}`,
      source: 'ml_api',
      rotQuery: i < 15 ? 'tv' : null,
    }));
    const s = computeStickinessReport(rows);
    expect(s.repeat_url_rate).not.toBeNull();
    expect(s.repeat_url_rate!).toBeGreaterThan(0.5);
    expect(s.diagnostics.STICKY_URL).toBe(true);
    expect(s.per_query_repeat.some((q) => q.query === 'tv')).toBe(true);
  });
});

describe('loss funnel complete pipeline', () => {
  it('includes completePipeline stages and reconciles terminals', () => {
    const report = buildLossFunnelReport([
      { decision: 'WOULD_INSERT' },
      { decision: 'REJECTED_DISCOUNT', discountClass: 'DISCOUNT_REAL_LOW', discountPercentage: 5 },
      { decision: 'REJECTED_DISCOUNT', discountClass: 'DISCOUNT_UNKNOWN', discountPercentage: null },
    ]);
    expect(report.reconciliation.matchesTotal).toBe(true);
    expect(report.completePipeline.map((p) => p.stage)).toContain('DISCOVERED');
    expect(report.completePipeline.map((p) => p.stage)).toContain('MINT_ATTEMPT');
    const mint = report.completePipeline.find((p) => p.stage === 'MINT_ATTEMPT');
    expect(mint?.candidate_count).toBe(0);
  });
});

describe('label availability BLOCKED at N=0', () => {
  it('never reports 0% precision when unlabeled', () => {
    const a = computeLabelAvailability({ totalCandidates: 100, labeled: 0 });
    expect(a.status).toBe('BLOCKED');
    expect(a.precision).toBeNull();
    expect(a.precisionDisplay).toBe('unavailable');
    expect(a.recallDisplay).toBe('unavailable');
    expect(a.fnRateDisplay).toBe('unavailable');
  });
});

describe('data quality contract', () => {
  it('marks missing discount as UNKNOWN not zero', () => {
    const r = validateCandidateTelemetry({
      canonicalUrl: 'https://x',
      source: 'ml_api',
      identityType: 'url',
      identityKey: 'url:https://x',
      discoveredAt: '2026-09-20T00:00:00.000Z',
      discountPercentage: null,
      discountClass: 'DISCOUNT_UNKNOWN',
      salePrice: 100,
      originalPrice: null,
      decision: 'REJECTED_DISCOUNT',
      reasonCode: 'unknown',
    });
    expect(['VALID', 'UNKNOWN', 'MISSING', 'INVALID']).toContain(r.overall);
    const disc = r.fields.find((f) => f.field === 'discount_percentage');
    expect(disc?.status).toBe('UNKNOWN');
  });
});

describe('discount truth static guard', () => {
  it('passes critical path (allowlist-aware)', () => {
    const root = join(process.cwd());
    const scan = scanDiscountTruthStatic(root);
    expect(scan.ok).toBe(true);
    if (!scan.ok) {
      // eslint-disable-next-line no-console
      console.error(scan.criticalViolations.slice(0, 20));
    }
  });
});

describe('experiment hard wall', () => {
  it('assertZeroInsertAttempts + experiment script must not call mint', () => {
    expect(assertZeroInsertAttempts({ insertedAttempted: 0 }).ok).toBe(true);
    const script = readFileSync(
      join(process.cwd(), 'scripts/hunter-discovery-experiment-v2.ts'),
      'utf8',
    );
    const scan = scanSourceForForbiddenMint(script);
    expect(scan.ok).toBe(true);
    expect(script).toMatch(/insertedAttempted:\s*0/);
    expect(script).not.toMatch(/insertIngestedOffer\s*\(/);
    expect(script).not.toMatch(/liquidateReward\s*\(/);
    expect(script).not.toMatch(/publishOffer\s*\(/);
  });
});

describe('mission control aggregates identity + labels', () => {
  it('exposes identityBreakdown and BLOCKED labels', () => {
    const report = buildMissionControlReport({
      candidates: [
        {
          canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890',
          source: 'ml_api',
          decision: 'WOULD_INSERT',
          discountPercentage: 50,
          discountClass: 'DISCOUNT_REAL_GOOD',
          discoveredAt: '2026-09-20T12:00:00.000Z',
        },
        {
          canonicalUrl: 'https://www.walmart.com.mx/ip/x/1',
          source: 'walmart',
          decision: 'REJECTED_DISCOUNT',
          discountClass: 'DISCOUNT_UNKNOWN',
          discountPercentage: null,
          discoveredAt: '2026-09-20T12:00:00.000Z',
        },
      ],
      since: '2026-09-20T00:00:00.000Z',
      until: '2026-09-21T00:00:00.000Z',
      baseline24hRows: [
        { canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890' },
      ],
      baseline7dRows: [
        { canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890' },
      ],
    });
    expect(report.identityBreakdown.ml_item).toBeGreaterThanOrEqual(1);
    expect(report.identityBreakdown.url).toBeGreaterThanOrEqual(1);
    expect(report.labelAvailability.status).toBe('BLOCKED');
    expect(report.temporalNovelty?.jaccard_24h).not.toBeNull();
    expect(report.lossFunnel.completePipeline.length).toBeGreaterThan(5);
    expect(report.reconciliation.gap).toBe(0);
  });
});
