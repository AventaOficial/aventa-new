import { describe, expect, it } from 'vitest';
import { normalizeCandidateUrl } from '@/lib/mcp/candidates';
import {
  classifyOfferPageKind,
  isAliExpressProductUrl,
  isSupportedRetailerProductUrl,
} from '@/lib/offers/retailerProductUrl';

const ALIEXPRESS_PRODUCT =
  'https://es.aliexpress.com/item/1005008053909443.html?spm=a2g0o.productlist.main.1.2f6d5c0dc0hlJ1&algo_pvid=1a9e8319-a408-46d1-883a-41d8fdc326f3&algo_exp_id=1a9e8319-a408-46d1-883a-41d8fdc326f3-0&pdp_ext_f=%7B%22order%22%3A%22-1%22%7D&pdp_npi=6%40dis%21MXN%2135065.93%2134011.99&curPageLogUid=I8nLhl6Css0r&utparam-url=scene%3Asearch';

describe('AliExpress product URL support', () => {
  it('recognizes a canonical numeric AliExpress product path', () => {
    expect(isAliExpressProductUrl('https://es.aliexpress.com/item/1005008053909443.html')).toBe(true);
    expect(isSupportedRetailerProductUrl(ALIEXPRESS_PRODUCT)).toBe(true);
    expect(classifyOfferPageKind(ALIEXPRESS_PRODUCT)).toBe('PRODUCT');
  });

  it('accepts the product URL with tracking parameters and strips the query', () => {
    expect(normalizeCandidateUrl(ALIEXPRESS_PRODUCT)).toEqual({
      ok: true,
      url: 'https://es.aliexpress.com/item/1005008053909443.html',
    });
  });

  it('preserves existing Liverpool product classification', () => {
    expect(isSupportedRetailerProductUrl('https://www.liverpool.com.mx/tienda/pdp/tenis/123456')).toBe(true);
  });

  it('does not classify AliExpress home/search pages or spoof domains as products', () => {
    expect(classifyOfferPageKind('https://es.aliexpress.com/')).toBe('HOME');
    expect(classifyOfferPageKind('https://es.aliexpress.com/search?spm=tracking')).toBe('SEARCH');
    expect(isAliExpressProductUrl('https://es.aliexpress.com.evil.test/item/1005008053909443.html')).toBe(false);
    expect(isSupportedRetailerProductUrl('https://es.aliexpress.com.evil.test/item/1005008053909443.html')).toBe(false);
  });
});
