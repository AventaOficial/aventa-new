/**
 * Live MX marketplace fetch (no auth) — Amazon + Liverpool.
 * Retail CDNs intermittently return bot-walls; we soft-skip those with NETWORK_BLOCKED
 * after proving identity + Liverpool DOM path (authoritative for this hardening pass).
 */
import { describe, expect, it } from 'vitest';
import { fetchParsedOfferMetadataDetailed } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { extractLiverpoolDomPrices } from '@/lib/offers/productExtraction/liverpoolExtract';
import { PRODUCT_PAGE_BROWSER_UA } from '@/lib/bots/ingest/ingestHttp';
import { fetchWithTimeout, HUNTER_HTTP_TIMEOUT_MS } from '@/lib/server/fetchWithTimeout';

const AMAZON_URL = 'https://www.amazon.com.mx/dp/B09V3KXJPB';
const LIVERPOOL_URL =
  'https://www.liverpool.com.mx/tienda/pdp/airpods-3-pro-inalambricos/1186100481';
const ML_URL =
  'https://articulo.mercadolibre.com.mx/MLM-3536548700-audifonos-_JM';
const LIVERPOOL_HOME = 'https://www.liverpool.com.mx/tienda/home';

async function fetchWithRetries(url: string, attempts = 3) {
  let last = await fetchParsedOfferMetadataDetailed(url);
  for (let i = 1; i < attempts && !last.meta; i++) {
    await new Promise((r) => setTimeout(r, 800 * i));
    last = await fetchParsedOfferMetadataDetailed(url);
  }
  return last;
}

describe('post-recon — live MX product fetch', () => {
  it(
    'Amazon MX: title, store, price, ASIN identity (soft NETWORK_BLOCKED)',
    async () => {
      // Identity must never depend on HTML success.
      expect(resolveIngestionIdentity(AMAZON_URL)).toEqual(
        expect.objectContaining({ key: 'amz:B09V3KXJPB', strategy: 'amazon_asin' }),
      );

      const attempt = await fetchWithRetries(AMAZON_URL);
      if (!attempt.meta) {
        console.info('[post-recon] Amazon NETWORK_BLOCKED diagnostic=', attempt.diagnostic);
        expect([
          'missing_title',
          'missing_discount_price',
          'http_error',
          'network_error',
          'timeout',
        ]).toContain(attempt.diagnostic);
        return;
      }
      expect(
        attempt.diagnostic === 'ok' || attempt.diagnostic === 'missing_original_price',
      ).toBe(true);
      const meta = attempt.meta;
      expect(meta.store.toLowerCase()).toContain('amazon');
      expect(meta.title.length).toBeGreaterThan(8);
      expect(meta.discountPrice).toBeGreaterThan(0);
      expect(resolveIngestionIdentity(meta.canonicalUrl).key).toBe('amz:B09V3KXJPB');
    },
    60_000,
  );

  it(
    'Liverpool MX: DOM/JSON-LD prices + SKU identity (not homepage)',
    async () => {
      const homeId = resolveIngestionIdentity(LIVERPOOL_HOME);
      expect(homeId.key).toBeNull();
      expect(homeId.strategy).toBe('none');

      const attempt = await fetchWithRetries(LIVERPOOL_URL, 2);
      expect(attempt.meta, `liverpool diagnostic=${attempt.diagnostic}`).not.toBeNull();
      const meta = attempt.meta!;
      expect(meta.store).toBe('Liverpool');
      expect(meta.title.toLowerCase()).toMatch(/airpods|apple/i);
      expect(meta.discountPrice).toBeGreaterThan(0);
      expect(resolveIngestionIdentity(meta.canonicalUrl)).toEqual(
        expect.objectContaining({ key: 'liv:1186100481', strategy: 'liverpool_sku' }),
      );

      const res = await fetchWithTimeout(LIVERPOOL_URL, {
        timeoutMs: HUNTER_HTTP_TIMEOUT_MS,
        headers: {
          'User-Agent': PRODUCT_PAGE_BROWSER_UA,
          Accept: 'text/html',
          'Accept-Language': 'es-MX,es;q=0.9',
        },
        redirect: 'follow',
      });
      expect(res.ok).toBe(true);
      const html = await res.text();
      const dom = extractLiverpoolDomPrices(html);
      // Prefer DOM when present; JSON-LD may be the only source on some renders.
      if (dom.discount != null) {
        expect(dom.discount).toBeGreaterThan(0);
      } else {
        expect(meta.discountPrice).toBeGreaterThan(0);
      }
    },
    60_000,
  );

  it(
    'Mercado Libre: identity from URL; HTML parse may be NETWORK_BLOCKED',
    async () => {
      const id = resolveIngestionIdentity(ML_URL);
      expect(id.key).toBe('ml:MLM3536548700');
      expect(id.strategy).toBe('ml_item');

      const attempt = await fetchParsedOfferMetadataDetailed(ML_URL);
      if (!attempt.meta) {
        expect([
          'missing_title',
          'missing_discount_price',
          'http_error',
          'network_error',
          'timeout',
        ]).toContain(attempt.diagnostic);
        console.info('[post-recon] ML HTML NETWORK_BLOCKED diagnostic=', attempt.diagnostic);
        return;
      }
      expect(metaStore(attempt.meta.store)).toMatch(/mercado/);
      expect(attempt.meta.discountPrice).toBeGreaterThan(0);
      expect(resolveIngestionIdentity(attempt.meta.canonicalUrl).key).toBe('ml:MLM3536548700');
    },
    45_000,
  );
});

function metaStore(s: string) {
  return s.toLowerCase();
}
