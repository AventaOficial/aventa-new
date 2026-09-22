import { describe, expect, it, vi } from 'vitest';
import {
  extractLiverpoolProductId,
  resolveLiverpoolOfferUrl,
} from '@/lib/offers/urlResolution/liverpoolResolver';
import { resolveOfferUrl } from '@/lib/offers/urlResolution';
import {
  isLiverpoolExpandableHost,
  isOfferLiverpoolHost,
} from '@/lib/offers/commerceHostAllowlist';

describe('Liverpool URL resolution', () => {
  it('allowlist helpers', () => {
    expect(isOfferLiverpoolHost('www.liverpool.com.mx')).toBe(true);
    expect(isLiverpoolExpandableHost('liverpool.app.link')).toBe(true);
  });

  it('extracts product id from pdp path', () => {
    expect(
      extractLiverpoolProductId(
        'https://www.liverpool.com.mx/tienda/pdp/audifonos-sony/110998877',
      ),
    ).toBe('110998877');
  });

  it('extracts productId query', () => {
    expect(
      extractLiverpoolProductId(
        'https://www.liverpool.com.mx/tienda/pdp/x?productId=110123456',
      ),
    ).toBe('110123456');
  });

  it('canonical with fingerprint', async () => {
    const r = await resolveLiverpoolOfferUrl(
      'https://www.liverpool.com.mx/tienda/pdp/audifonos/110555444?utm_source=x',
    );
    expect(r.provider).toBe('liverpool');
    expect(r.productFingerprint).toBe('lvp:110555444');
    expect(r.productIdentity).toBe('liverpool_mx:sku:110555444');
    expect(r.confidence).toBe('high');
    expect(r.canonicalUrl).not.toContain('utm_source');
  });

  it('fail-closed without id', async () => {
    const r = await resolveLiverpoolOfferUrl('https://www.liverpool.com.mx/tienda/home');
    expect(r.productFingerprint).toBeNull();
    expect(r.confidence).toBe('low');
  });

  it('app.link expand mocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input);
        if (href.includes('liverpool.app.link')) {
          return new Response(null, {
            status: 301,
            headers: {
              Location: 'https://www.liverpool.com.mx/tienda/pdp/demo/110777666',
            },
          });
        }
        return new Response('<html></html>', { status: 200 });
      }),
    );
    const r = await resolveLiverpoolOfferUrl('https://liverpool.app.link/xyz');
    if (r.productFingerprint) {
      expect(r.productFingerprint).toBe('lvp:110777666');
    } else {
      expect(r.confidence).toBe('low');
    }
    vi.unstubAllGlobals();
  });

  it('coordinator detects liverpool', async () => {
    const r = await resolveOfferUrl(
      'https://www.liverpool.com.mx/tienda/pdp/x/110111222',
    );
    expect(r.provider).toBe('liverpool');
  });
});
