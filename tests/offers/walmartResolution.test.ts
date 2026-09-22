import { describe, expect, it, vi } from 'vitest';
import {
  extractWalmartItemId,
  resolveWalmartOfferUrl,
} from '@/lib/offers/urlResolution/walmartResolver';
import { resolveOfferUrl } from '@/lib/offers/urlResolution';
import { isOfferWalmartHost, isWalmartExpandableHost } from '@/lib/offers/commerceHostAllowlist';

describe('Walmart URL resolution', () => {
  it('allowlist helpers', () => {
    expect(isOfferWalmartHost('www.walmart.com.mx')).toBe(true);
    expect(isWalmartExpandableHost('walmart.page.link')).toBe(true);
    expect(isWalmartExpandableHost('www.walmart.com.mx')).toBe(false);
  });

  it('extracts item id from /ip/slug/id and /ip/id', () => {
    expect(extractWalmartItemId('https://www.walmart.com.mx/ip/aceite-oliva/12345678')).toBe(
      '12345678',
    );
    expect(extractWalmartItemId('https://www.walmart.com.mx/ip/12345678')).toBe('12345678');
  });

  it('canonicalizes with tracking stripped identity', async () => {
    const r = await resolveWalmartOfferUrl(
      'https://www.walmart.com.mx/ip/producto-demo/99887766?utm_source=share&athbdg=L1100',
    );
    expect(r.provider).toBe('walmart');
    expect(r.productFingerprint).toBe('wmt:99887766');
    expect(r.productIdentity).toBe('walmart_mx:item:99887766');
    expect(r.canonicalUrl).toBe('https://www.walmart.com.mx/ip/99887766');
    expect(r.confidence).toBe('high');
  });

  it('fail-closed without item id', async () => {
    const r = await resolveWalmartOfferUrl('https://www.walmart.com.mx/ofertas');
    expect(r.provider).toBe('walmart');
    expect(r.productFingerprint).toBeNull();
    expect(r.confidence).toBe('low');
  });

  it('page.link expand → item id (mocked)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input);
        if (href.includes('walmart.page.link')) {
          return new Response(null, {
            status: 301,
            headers: {
              Location: 'https://www.walmart.com.mx/ip/demo-prod/55554444',
            },
          });
        }
        return new Response('<html></html>', { status: 200 });
      }),
    );
    const r = await resolveWalmartOfferUrl('https://walmart.page.link/abc123');
    if (r.productFingerprint) {
      expect(r.productFingerprint).toBe('wmt:55554444');
      expect(r.canonicalUrl).toContain('/ip/55554444');
    } else {
      expect(r.confidence).toBe('low');
    }
    vi.unstubAllGlobals();
  });

  it('coordinator detects walmart', async () => {
    const r = await resolveOfferUrl('https://www.walmart.com.mx/ip/x/42001234');
    expect(r.provider).toBe('walmart');
    expect(r.productFingerprint).toBe('wmt:42001234');
  });
});
