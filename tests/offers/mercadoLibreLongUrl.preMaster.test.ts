/**
 * Pre-Master — Mercado Libre long URL + share noise.
 * Identity authority remains S6.8 (resolveMercadoLibreListingExternalId).
 */

import { describe, expect, it } from 'vitest';
import {
  hasMercadoLibreListingIdentity,
  isMercadoLibreNavigableProductPath,
  resolveMercadoLibreItem,
  resolveMercadoLibreListingExternalId,
} from '@/lib/offers/resolveMercadoLibreItem';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import { stripOfferTrackingParams } from '@/lib/offers/parseOfferPageHtml';
import { validatePublicOfferUrl } from '@/lib/server/validatePublicOfferUrl';
import { isOfferMercadoLibreHost } from '@/lib/offers/commerceHostAllowlist';
import { resolveIdentityFromUrl } from '@/lib/dealIntelligence/identity';
import { normalizeAbsoluteImageUrl } from '../../workers/mercadolibre-worker/src/cardImage.mjs';

const UP_CLEAN = 'https://www.mercadolibre.com.mx/up/MLMU418527912';
const UP_QUERY =
  'https://www.mercadolibre.com.mx/up/MLMU418527912?pdp_filters=item_id:MLM1689875150';
const UP_TRACKING =
  'https://www.mercadolibre.com.mx/up/MLMU418527912?matt_tool=17030900&pdp_filters=item_id:MLM1689875150&ua=2jdUXTbq5hPy5a7mQyekk9cyPKP3q19lQA2kbnxzGYVj3g4s';
const UP_REAL_SHARE =
  'https://www.mercadolibre.com.mx/up/MLMU418527912?matt_tool=17030900&pdp_filters=item_id:MLM1689875150&ua=2jdUXTbq5hPy5a7mQyekk9cyPKP3q19lQA2kbnxzGYVj3g4s#origin=share&sid=share&wid=MLM1689875150&action=copy';
const UP_HASH_ONLY =
  'https://www.mercadolibre.com.mx/up/MLMU418527912#origin=share&wid=MLM1689875150';
const MLM_CLEAN =
  'https://articulo.mercadolibre.com.mx/MLM-1689875150-producto-_JM';
const MLM_QUERY =
  'https://www.mercadolibre.com.mx/p/MLM18625838?wid=MLM1689875150&matt_tool=1';
const MLM_HASH =
  'https://www.mercadolibre.com.mx/p/MLM18625838#wid=MLM1689875150&origin=share';

describe('Pre-Master — Mercado Libre long URL identity', () => {
  it('A. /up/MLMU limpio — user-product identity when no item signal', () => {
    const ext = resolveMercadoLibreListingExternalId(UP_CLEAN);
    expect(ext).toBe('MLMU418527912');
    expect(hasMercadoLibreListingIdentity(UP_CLEAN)).toBe(true);
  });

  it('B. /up/MLMU + query pdp_filters → item wins (S6.8)', () => {
    const r = resolveMercadoLibreItem(UP_QUERY);
    expect(r?.itemId).toBe('MLM1689875150');
    expect(r?.resolutionMethod).toBe('query_pdp_filters');
    expect(resolveMercadoLibreListingExternalId(UP_QUERY)).toBe('MLM1689875150');
  });

  it('C. /up/MLMU + tracking query — identity ignores matt/ua', () => {
    const r = resolveMercadoLibreItem(UP_TRACKING);
    expect(r?.itemId).toBe('MLM1689875150');
    expect(r?.canonicalUrl).not.toMatch(/matt_tool|[&?]ua=/i);
  });

  it('D. /up/MLMU + query + hash (real share URL)', () => {
    const r = resolveMercadoLibreItem(UP_REAL_SHARE);
    expect(r?.itemId).toBe('MLM1689875150');
    expect(r?.resolutionMethod).toBe('query_pdp_filters');
    expect(resolveMercadoLibreListingExternalId(UP_REAL_SHARE)).toBe('MLM1689875150');
    expect(offerUrlFingerprint(UP_REAL_SHARE)).toBe('ml:MLM1689875150');
    const id = resolveIdentityFromUrl({ url: UP_REAL_SHARE });
    expect(id.mlItemId).toBe('MLM1689875150');
    expect(id.productFingerprint).toBe('ml:MLM1689875150');
    expect(r?.canonicalUrl).not.toMatch(/#/);
    expect(r?.canonicalUrl).not.toMatch(/[&?]ua=/i);
    expect(r?.canonicalUrl).not.toMatch(/matt_tool/);
  });

  it('E. /up/MLMU + pdp_filters[item_id] explicit', () => {
    expect(resolveMercadoLibreListingExternalId(UP_QUERY)).toBe('MLM1689875150');
  });

  it('F. URL MLM tradicional', () => {
    expect(resolveMercadoLibreListingExternalId(MLM_CLEAN)).toBe('MLM1689875150');
    expect(offerUrlFingerprint(MLM_CLEAN)).toBe('ml:MLM1689875150');
  });

  it('G. URL MLM tradicional + query', () => {
    expect(resolveMercadoLibreItem(MLM_QUERY)?.itemId).toBe('MLM1689875150');
  });

  it('H. URL MLM tradicional + hash', () => {
    expect(resolveMercadoLibreItem(MLM_HASH)?.itemId).toBe('MLM1689875150');
  });

  it('I. malformed URL', () => {
    expect(resolveMercadoLibreItem('not a url')).toBeNull();
    expect(hasMercadoLibreListingIdentity('')).toBe(false);
  });

  it('J. foreign host rejected by commerce allowlist', () => {
    expect(isOfferMercadoLibreHost('evil.example')).toBe(false);
    expect(isOfferMercadoLibreHost('www.mercadolibre.com.mx')).toBe(true);
  });

  it('K. login path not a navigable product path', () => {
    expect(isMercadoLibreNavigableProductPath('/login')).toBe(false);
    expect(hasMercadoLibreListingIdentity('https://www.mercadolibre.com.mx/login')).toBe(
      false,
    );
  });

  it('L. verification path not a navigable product path', () => {
    expect(isMercadoLibreNavigableProductPath('/account-verification/xyz')).toBe(false);
    expect(
      normalizeAbsoluteImageUrl(
        'https://www.mercadolibre.com.mx/account-verification/foo.png',
      ),
    ).toBeNull();
  });

  it('hash-only wid still resolves item (identity before strip)', () => {
    expect(resolveMercadoLibreItem(UP_HASH_ONLY)?.itemId).toBe('MLM1689875150');
  });

  it('stripOfferTrackingParams drops ua/hash, keeps pdp_filters', () => {
    const cleaned = stripOfferTrackingParams(UP_REAL_SHARE);
    expect(cleaned).not.toMatch(/ua=/);
    expect(cleaned).not.toMatch(/#/);
    expect(cleaned).toMatch(/pdp_filters=item_id/);
    expect(cleaned).toMatch(/MLM1689875150/);
    expect(cleaned).not.toMatch(/matt_tool/);
  });

  it('security: javascript/data still invalid', () => {
    expect(validatePublicOfferUrl('javascript:alert(1)').ok).toBe(false);
    expect(validatePublicOfferUrl('data:text/html,hi').ok).toBe(false);
  });
});
