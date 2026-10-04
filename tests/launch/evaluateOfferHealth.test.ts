import { describe, expect, it } from 'vitest';
import {
  evaluateOfferHealthFromParse,
  isConfirmedGoneDiagnostic,
} from '@/lib/offers/evaluateOfferHealth';
import type { ParsedOfferMetadataAttempt } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

const meta = (discountPrice: number): ParsedOfferMetadataAttempt['meta'] => ({
  canonicalUrl: 'https://example.com/p',
  title: 'Producto',
  store: 'Example',
  imageUrl: 'https://example.com/i.jpg',
  discountPrice,
  originalPrice: null,
  discountPercent: null,
});

describe('evaluateOfferHealthFromParse', () => {
  it('parse failures are inconclusive, never out_of_stock', () => {
    for (const diagnostic of ['missing_title', 'missing_discount_price', 'missing_original_price'] as const) {
      const r = evaluateOfferHealthFromParse(1000, { meta: null, diagnostic });
      expect(r.status).toBe('unknown');
      expect(r.skipped).toBe(true);
    }
  });

  it('only 404/410 confirm out_of_stock', () => {
    for (const httpStatus of [404, 410]) {
      const r = evaluateOfferHealthFromParse(1000, { meta: null, diagnostic: 'http_error', httpStatus });
      expect(r).toMatchObject({ status: 'out_of_stock', skipped: false, diagnostic: `http_${httpStatus}` });
    }
    for (const httpStatus of [403, 429, 500, 503, null]) {
      const r = evaluateOfferHealthFromParse(1000, { meta: null, diagnostic: 'http_error', httpStatus });
      expect(r.status).toBe('unknown');
      expect(r.skipped).toBe(true);
    }
  });

  it('network-level failures stay transient', () => {
    for (const diagnostic of ['timeout', 'network_error', 'blocked_url', 'invalid_url'] as const) {
      expect(evaluateOfferHealthFromParse(1000, { meta: null, diagnostic }).skipped).toBe(true);
    }
  });

  it('live price drives available vs price_changed', () => {
    expect(evaluateOfferHealthFromParse(1000, { meta: meta(1000), diagnostic: 'ok' }).status).toBe('available');
    expect(evaluateOfferHealthFromParse(1000, { meta: meta(1200), diagnostic: 'ok' }).status).toBe('price_changed');
  });
});

describe('isConfirmedGoneDiagnostic', () => {
  it('accepts only confirmed gone diagnostics', () => {
    expect(isConfirmedGoneDiagnostic('http_404')).toBe(true);
    expect(isConfirmedGoneDiagnostic('http_410|auto_expire_streak=2')).toBe(true);
    expect(isConfirmedGoneDiagnostic('http_error')).toBe(false);
    expect(isConfirmedGoneDiagnostic('missing_title')).toBe(false);
    expect(isConfirmedGoneDiagnostic('http_4040')).toBe(false);
    expect(isConfirmedGoneDiagnostic(null)).toBe(false);
  });
});
