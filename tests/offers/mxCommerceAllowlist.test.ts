import { describe, it, expect } from 'vitest';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import {
  isAllowedMxCommerceHost,
  MX_COMMERCE_REGISTERED_DOMAINS,
} from '@/lib/offers/commerceHostAllowlist';
import { isAllowedOfferParseHost } from '@/lib/server/fetchUrlSafety';
import { inferRetailer } from '@/lib/hunter/candidateIntelligence/buildCandidateRecord';
import { HUNTER_SOURCE_COVERAGE } from '@/lib/hunter/sourceCoverage';

describe('inferStoreFromHostname — retail MX', () => {
  it('etiqueta tiendas mexicanas conocidas', () => {
    expect(inferStoreFromHostname('www.liverpool.com.mx')).toBe('Liverpool');
    expect(inferStoreFromHostname('www.coppel.com')).toBe('Coppel');
    expect(inferStoreFromHostname('www.elpalaciodehierro.com')).toBe('El Palacio de Hierro');
    expect(inferStoreFromHostname('www.bodegaaurrera.com.mx')).toBe('Bodega Aurrera');
    expect(inferStoreFromHostname('www.cyberpuerta.mx')).toBe('Cyberpuerta');
    expect(inferStoreFromHostname('www.homedepot.com.mx')).toBe('Home Depot');
    expect(inferStoreFromHostname('www.heb.com.mx')).toBe('H-E-B');
    expect(inferStoreFromHostname('www.sodimac.com.mx')).toBe('Sodimac');
    expect(inferStoreFromHostname('www.ishopmixup.com')).toBe('iShop Mixup');
    expect(inferStoreFromHostname('ebay.to')).toBe('eBay');
  });

  it('no confunde suffix parcial', () => {
    expect(inferStoreFromHostname('notliverpool.com.mx')).toBeNull();
    expect(inferStoreFromHostname('evil-coppel.com')).toBeNull();
  });
});

describe('MX commerce allowlist', () => {
  it('todos los dominios MX registrados pasan el gate de parse', () => {
    for (const domain of MX_COMMERCE_REGISTERED_DOMAINS) {
      expect(isAllowedMxCommerceHost(domain)).toBe(true);
      expect(isAllowedOfferParseHost(`www.${domain}`)).toBe(true);
      expect(isAllowedOfferParseHost(domain)).toBe(true);
    }
  });

  it('rechaza suffix spoof', () => {
    expect(isAllowedMxCommerceHost('liverpool.com.mx.evil.com')).toBe(false);
    expect(isAllowedOfferParseHost('coppel.com.attacker.test')).toBe(false);
  });
});

describe('Hunter recognition + coverage', () => {
  it('inferRetailer reconoce retailers MX ampliados', () => {
    expect(inferRetailer('https://www.liverpool.com.mx/tienda/x', 'env_urls')).toBe('liverpool_mx');
    expect(inferRetailer('https://www.coppel.com/p/1', 'env_urls')).toBe('coppel_mx');
    expect(inferRetailer('https://www.homedepot.com.mx/p/1', 'env_urls')).toBe('home_depot_mx');
    expect(inferRetailer('https://www.cyberpuerta.mx/x', 'env_urls')).toBe('cyberpuerta_mx');
    expect(inferRetailer('https://www.bodegaaurrera.com.mx/ip/1', 'env_urls')).toBe('bodega_aurrera_mx');
  });

  it('coverage lista ACTIVE/DISABLED/NOT_IMPLEMENTED coherente', () => {
    const byStatus = (s: string) => HUNTER_SOURCE_COVERAGE.filter((r) => r.status === s);
    expect(byStatus('ACTIVE').map((r) => r.retailer)).toContain('Mercado Libre México');
    expect(byStatus('DISABLED').map((r) => r.ingestSourceId)).toEqual(
      expect.arrayContaining(['walmart_mx', 'bodega_aurrera_mx', 'chedraui_mx']),
    );
    expect(byStatus('NOT_IMPLEMENTED').length).toBeGreaterThan(20);
    expect(
      HUNTER_SOURCE_COVERAGE.some(
        (r) => r.retailer === 'Liverpool' && r.status === 'DEGRADED' && r.ingestSourceId === 'liverpool_mx',
      ),
    ).toBe(true);
    expect(HUNTER_SOURCE_COVERAGE.some((r) => r.retailer === 'Home Depot México')).toBe(true);
  });
});
