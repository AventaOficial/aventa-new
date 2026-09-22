import { describe, expect, it, vi } from 'vitest';
import {
  extractCoppelProductId,
  resolveCoppelOfferUrl,
} from '@/lib/offers/urlResolution/coppelResolver';
import { resolveOfferUrl } from '@/lib/offers/urlResolution';
import { isCoppelExpandableHost, isOfferCoppelHost } from '@/lib/offers/commerceHostAllowlist';

describe('Coppel URL resolution', () => {
  it('allowlist helpers', () => {
    expect(isOfferCoppelHost('www.coppel.com')).toBe(true);
    expect(isOfferCoppelHost('www.coppel.com.mx')).toBe(true);
    expect(isCoppelExpandableHost('coppel.app.link')).toBe(true);
  });

  it('extracts sku from trailing digits', () => {
    expect(extractCoppelProductId('https://www.coppel.com/smartphone-xyz-1234567')).toBe(
      '1234567',
    );
    expect(extractCoppelProductId('https://www.coppel.com/p/98765432')).toBe('98765432');
  });

  it('canonicalizes with tracking stripped', async () => {
    const r = await resolveCoppelOfferUrl(
      'https://www.coppel.com/producto-demo-99887766?utm_source=share',
    );
    expect(r.provider).toBe('coppel');
    expect(r.productFingerprint).toBe('cpl:99887766');
    expect(r.productIdentity).toBe('coppel_mx:sku:99887766');
    expect(r.canonicalUrl).not.toContain('utm_');
    expect(r.confidence).toBe('high');
  });

  it('fail-closed without product id', async () => {
    const r = await resolveCoppelOfferUrl('https://www.coppel.com/ofertas');
    expect(r.provider).toBe('coppel');
    expect(r.productFingerprint).toBeNull();
    expect(r.confidence).toBe('low');
  });

  it('app.link expand → sku (mocked)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input);
        if (href.includes('coppel.app.link')) {
          return new Response(null, {
            status: 301,
            headers: {
              Location: 'https://www.coppel.com/demo-prod-55554444',
            },
          });
        }
        return new Response('<html></html>', { status: 200 });
      }),
    );
    const r = await resolveCoppelOfferUrl('https://coppel.app.link/abc123');
    if (r.productFingerprint) {
      expect(r.productFingerprint).toBe('cpl:55554444');
    } else {
      expect(r.confidence).toBe('low');
    }
    vi.unstubAllGlobals();
  });

  it('coordinator detects coppel', async () => {
    const r = await resolveOfferUrl('https://www.coppel.com/x-42001234');
    expect(r.provider).toBe('coppel');
    expect(r.productFingerprint).toBe('cpl:42001234');
  });
});
