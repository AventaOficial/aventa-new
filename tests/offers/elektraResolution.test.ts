import { describe, expect, it } from 'vitest';
import {
  extractElektraProductId,
  resolveElektraOfferUrl,
} from '@/lib/offers/urlResolution/elektraResolver';
import { resolveOfferUrl } from '@/lib/offers/urlResolution';
import { isOfferElektraHost } from '@/lib/offers/commerceHostAllowlist';

describe('Elektra URL resolution', () => {
  it('allowlist helpers', () => {
    expect(isOfferElektraHost('www.elektra.mx')).toBe(true);
    expect(isOfferElektraHost('www.elektra.com.mx')).toBe(true);
  });

  it('extracts sku from path', () => {
    expect(extractElektraProductId('https://www.elektra.mx/producto-demo-12345678')).toBe(
      '12345678',
    );
    expect(extractElektraProductId('https://www.elektra.com.mx/p/87654321')).toBe('87654321');
  });

  it('canonicalizes with tracking stripped', async () => {
    const r = await resolveElektraOfferUrl(
      'https://www.elektra.mx/tv-oled-55443322?utm_source=share',
    );
    expect(r.provider).toBe('elektra');
    expect(r.productFingerprint).toBe('elk:55443322');
    expect(r.productIdentity).toBe('elektra_mx:sku:55443322');
    expect(r.canonicalUrl).not.toContain('utm_');
    expect(r.confidence).toBe('high');
  });

  it('fail-closed without product id', async () => {
    const r = await resolveElektraOfferUrl('https://www.elektra.mx/ofertas');
    expect(r.provider).toBe('elektra');
    expect(r.productFingerprint).toBeNull();
    expect(r.confidence).toBe('low');
  });

  it('coordinator detects elektra', async () => {
    const r = await resolveOfferUrl('https://www.elektra.mx/x-42001234');
    expect(r.provider).toBe('elektra');
    expect(r.productFingerprint).toBe('elk:42001234');
  });
});
