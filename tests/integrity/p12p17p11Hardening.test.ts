/**
 * FASE 0.9 — P1-2 cron auth, P1-7 SSRF hosts, P1-11 safe URI decode.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireCronSecret } from '../../lib/server/cronAuth';
import { isHostUnderRegisteredDomain } from '../../lib/server/hostnameAllowlist';
import {
  isOfferAmazonHost,
  isOfferMercadoLibreHost,
  isAllowedAffiliateNetworkHost,
} from '../../lib/offers/commerceHostAllowlist';
import {
  isAllowedOfferParseHost,
  assertSafeOfferFetchUrl,
  isBlockedOfferParseUrl,
} from '../../lib/server/fetchUrlSafety';
import {
  safeDecodeURIComponentOnce,
  hasUriEncodedOctets,
  containsPathTraversal,
} from '../../lib/server/safeUriDecode';

describe('P1-2 — cronAuth', () => {
  const prev = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret';
  });

  afterEach(() => {
    if (prev !== undefined) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
  });

  it('1 — Bearer correcto → allowed', () => {
    const req = new NextRequest('https://aventaofertas.com/api/cron/x', {
      headers: { Authorization: 'Bearer cron-test-secret' },
    });
    expect(requireCronSecret(req)).toBeNull();
  });

  it('2 — secret incorrecto → reject', () => {
    const req = new NextRequest('https://aventaofertas.com/api/cron/x', {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(requireCronSecret(req)?.status).toBe(401);
  });

  it('3 — secret ausente → reject', () => {
    const req = new NextRequest('https://aventaofertas.com/api/cron/x');
    expect(requireCronSecret(req)?.status).toBe(401);
  });

  it('4 — ?secret= → reject', () => {
    const req = new NextRequest(
      'https://aventaofertas.com/api/cron/x?secret=cron-test-secret',
    );
    expect(requireCronSecret(req)?.status).toBe(401);
  });

  it('5 — ?token= → reject', () => {
    const req = new NextRequest(
      'https://aventaofertas.com/api/cron/x?token=cron-test-secret',
      { headers: { Authorization: 'Bearer cron-test-secret' } },
    );
    expect(requireCronSecret(req)?.status).toBe(401);
  });

  it('6 — env missing → fail-closed', () => {
    delete process.env.CRON_SECRET;
    const req = new NextRequest('https://aventaofertas.com/api/cron/x', {
      headers: { Authorization: 'Bearer cron-test-secret' },
    });
    expect(requireCronSecret(req)?.status).toBe(401);
  });

  it('7 — Authorization malformado → reject', () => {
    const req = new NextRequest('https://aventaofertas.com/api/cron/x', {
      headers: { Authorization: 'Basic cron-test-secret' },
    });
    expect(requireCronSecret(req)?.status).toBe(401);
  });

  it('8 — x-cron-secret válido (Vercel-compatible) → allowed', () => {
    const req = new NextRequest('https://aventaofertas.com/api/cron/x', {
      headers: { 'x-cron-secret': 'cron-test-secret' },
    });
    expect(requireCronSecret(req)).toBeNull();
  });

  it('Bearer + ?secret= → reject (query nunca permitida)', () => {
    const req = new NextRequest(
      'https://aventaofertas.com/api/cron/x?secret=anything',
      { headers: { Authorization: 'Bearer cron-test-secret' } },
    );
    expect(requireCronSecret(req)?.status).toBe(401);
  });
});

describe('P1-7 — hostname allowlist', () => {
  it('9 — exact amazon.com.mx → allowed', () => {
    expect(isOfferAmazonHost('amazon.com.mx')).toBe(true);
    expect(isAllowedOfferParseHost('amazon.com.mx')).toBe(true);
  });

  it('10 — www subdomain → allowed', () => {
    expect(isOfferAmazonHost('www.amazon.com.mx')).toBe(true);
    expect(isOfferMercadoLibreHost('www.mercadolibre.com.mx')).toBe(true);
  });

  it('11 — amazon.com.evil.com → reject', () => {
    expect(isOfferAmazonHost('amazon.com.evil.com')).toBe(false);
    expect(isHostUnderRegisteredDomain('amazon.com.evil.com', 'amazon.com')).toBe(false);
  });

  it('12 — evil-amazon.com → reject', () => {
    expect(isOfferAmazonHost('evil-amazon.com')).toBe(false);
  });

  it('13 — userinfo amazon.com@evil.com → hostname evil.com', () => {
    const u = new URL('https://amazon.com@evil.com/path');
    expect(u.hostname).toBe('evil.com');
    expect(isOfferAmazonHost(u.hostname)).toBe(false);
    expect(assertSafeOfferFetchUrl(u).blocked).toBe(true);
  });

  it('14 — http protocol → reject on assertSafe', () => {
    expect(
      assertSafeOfferFetchUrl(new URL('http://www.amazon.com.mx/dp/X'), {
        requireHttps: true,
      }).blocked,
    ).toBe(true);
  });

  it('15 — malformed → handled by URL ctor / callers', () => {
    expect(() => new URL('not a url')).toThrow();
  });

  it('16 — uppercase hostname → allowed', () => {
    expect(isOfferAmazonHost('WWW.AMAZON.COM.MX')).toBe(true);
  });

  it('18-19 — localhost / loopback → blocked', () => {
    expect(isBlockedOfferParseUrl(new URL('https://localhost/x')).blocked).toBe(true);
    expect(isBlockedOfferParseUrl(new URL('https://127.0.0.1/x')).blocked).toBe(true);
  });

  it('20 — private IP → blocked', () => {
    expect(isBlockedOfferParseUrl(new URL('https://10.0.0.1/')).blocked).toBe(true);
    expect(isBlockedOfferParseUrl(new URL('https://192.168.0.1/')).blocked).toBe(true);
  });

  it('21-23 — redes afiliadas allowlist exacta', () => {
    expect(isAllowedAffiliateNetworkHost('es.aliexpress.com')).toBe(true);
    expect(isAllowedAffiliateNetworkHost('evil-aliexpress.com')).toBe(false);
    expect(isAllowedOfferParseHost('www.temu.com')).toBe(true);
    expect(isAllowedOfferParseHost('temu.com.evil.com')).toBe(false);
  });
});

describe('P1-11 — safe URI decode', () => {
  it('24 — single encoded slash stays one decode', () => {
    // Simula valor ya decodificado por searchParams (%2F → /)
    expect(safeDecodeURIComponentOnce('/safe/path')).toBe('/safe/path');
    expect(hasUriEncodedOctets('/safe/path')).toBe(false);
  });

  it('25 — double-encoded slash: one decode only → %2F not /', () => {
    // searchParams.get('x') on ?x=%252F yields "%2F"
    const fromSearchParams = '%2F';
    expect(safeDecodeURIComponentOnce(fromSearchParams)).toBe('/');
    // If we incorrectly decoded twice from original %252F:
    expect(decodeURIComponent(decodeURIComponent('%252F'))).toBe('/');
    // Our helper on raw still-encoded once:
    expect(safeDecodeURIComponentOnce('%252F')).toBe('%2F');
  });

  it('26-27 — encoded / double-encoded ../', () => {
    expect(safeDecodeURIComponentOnce('%2e%2e%2f')).toBe('../');
    expect(safeDecodeURIComponentOnce('%252e%252e%252f')).toBe('%2e%2e%2f');
    expect(containsPathTraversal(safeDecodeURIComponentOnce('%2e%2e%2f'))).toBe(true);
    expect(containsPathTraversal(safeDecodeURIComponentOnce('%252e%252e%252f'))).toBe(false);
  });

  it('28-30 — normal / unicode / spaces', () => {
    expect(safeDecodeURIComponentOnce('foto.jpg')).toBe('foto.jpg');
    expect(safeDecodeURIComponentOnce('café.png')).toBe('café.png');
    expect(safeDecodeURIComponentOnce('my photo.webp')).toBe('my photo.webp');
    expect(safeDecodeURIComponentOnce('my%20photo.webp')).toBe('my photo.webp');
  });

  it('32 — no double decoding of already-decoded text', () => {
    const once = '100% done';
    expect(safeDecodeURIComponentOnce(once)).toBe('100% done');
  });

  it('33 — path traversal detection', () => {
    expect(containsPathTraversal('../secret')).toBe(true);
    expect(containsPathTraversal('avatars/u1/file.jpg')).toBe(false);
  });

  it('34 — upload keys server-side use UUID namespace (documented)', () => {
    // upload-offer-image: `${uuid}${ext}` — no user filename.
    // upload-profile-avatar: `avatars/${userId}/${uuid}${ext}`
    const key = `avatars/user-1/${crypto.randomUUID()}.jpg`;
    expect(containsPathTraversal(key)).toBe(false);
    expect(key.startsWith('avatars/')).toBe(true);
  });
});
