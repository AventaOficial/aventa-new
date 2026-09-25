export const BOT_INGEST_USER_AGENT =
  'Mozilla/5.0 (compatible; AVENTA-Bot-Ingest/3.0; +https://aventaofertas.com)';

/**
 * HTML PDP fetch UA — aligned with urlResolution/* and /api/parse-offer-url.
 * Explicit bot UA is routinely blocked by retail CDNs (403 / price-stripped shells).
 */
export const PRODUCT_PAGE_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
