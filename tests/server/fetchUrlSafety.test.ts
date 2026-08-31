import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isBlockedOfferParseUrl,
  isAllowedOfferParseHost,
  assertSafeOfferFetchUrl,
  fetchFollowingRedirectsSafely,
} from '../../lib/server/fetchUrlSafety';

describe('isBlockedOfferParseUrl', () => {
  it('bloquea localhost, loopback y metadata', () => {
    expect(isBlockedOfferParseUrl(new URL('https://localhost/x')).blocked).toBe(true);
    expect(isBlockedOfferParseUrl(new URL('https://127.0.0.1/x')).blocked).toBe(true);
    expect(isBlockedOfferParseUrl(new URL('https://169.254.169.254/latest/meta-data')).blocked).toBe(true);
  });

  it('bloquea RFC1918 y puertos no 80/443', () => {
    expect(isBlockedOfferParseUrl(new URL('https://192.168.1.10/')).blocked).toBe(true);
    expect(isBlockedOfferParseUrl(new URL('https://10.0.0.8/')).blocked).toBe(true);
    expect(isBlockedOfferParseUrl(new URL('https://172.16.0.5/')).blocked).toBe(true);
    expect(isBlockedOfferParseUrl(new URL('https://articulo.mercadolibre.com.mx:8443/')).blocked).toBe(true);
  });

  it('bloquea IPv6 privadas y link-local', () => {
    expect(isBlockedOfferParseUrl(new URL('https://[::1]/')).blocked).toBe(true);
    expect(isBlockedOfferParseUrl(new URL('https://[fe80::1]/')).blocked).toBe(true);
    expect(isBlockedOfferParseUrl(new URL('https://[fd12:3456:789a::1]/')).blocked).toBe(true);
  });

  it('permite un host de tienda HTTPS', () => {
    expect(isBlockedOfferParseUrl(new URL('https://www.amazon.com.mx/dp/B00TEST')).blocked).toBe(false);
  });
});

describe('allowlist del parser', () => {
  it('acepta ML, Amazon y redes afiliadas', () => {
    expect(isAllowedOfferParseHost('articulo.mercadolibre.com.mx')).toBe(true);
    expect(isAllowedOfferParseHost('meli.la')).toBe(true);
    expect(isAllowedOfferParseHost('amzn.to')).toBe(true);
    expect(isAllowedOfferParseHost('www.amazon.com.mx')).toBe(true);
    expect(isAllowedOfferParseHost('es.aliexpress.com')).toBe(true);
  });

  it('rechaza hosts ajenos aunque no sean privados', () => {
    expect(isAllowedOfferParseHost('evil.example.com')).toBe(false);
    const gate = assertSafeOfferFetchUrl(new URL('https://evil.example.com/p'), {
      requireHttps: true,
      requireAllowlist: true,
    });
    expect(gate.blocked).toBe(true);
  });

  it('exige HTTPS', () => {
    const gate = assertSafeOfferFetchUrl(new URL('http://www.amazon.com.mx/dp/X'), {
      requireHttps: true,
      requireAllowlist: true,
    });
    expect(gate.blocked).toBe(true);
  });
});

describe('fetchFollowingRedirectsSafely', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no sigue un redirect a metadata / RFC1918', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://169.254.169.254/latest/meta-data' },
        }),
      ),
    );
    const result = await fetchFollowingRedirectsSafely('https://meli.la/abc', {
      timeoutMs: 1000,
      requireHttps: true,
      requireAllowlist: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toMatch(/permitid|privada|host/);
    }
  });
});
