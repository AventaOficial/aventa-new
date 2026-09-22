/**
 * Amazon HTML scrape helpers for parse-offer-url.
 *
 * `/dp/{ASIN}` often returns a bot wall to datacenter IPs; `/gp/aw/d/{ASIN}`
 * (mobile product page) still returns usable title/price/gallery HTML.
 * Canonical identity stays `/dp/{ASIN}` — this is fetch-only.
 */
import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { isAmazonExpandableHost, isOfferAmazonHost } from '@/lib/offers/commerceHostAllowlist';

/** True when the response is Amazon's anti-bot interstitial, not a product page. */
export function isAmazonBotWallHtml(html: string): boolean {
  if (!html) return true;
  const head = html.slice(0, 12_000);
  if (/opfcaptcha|validateCaptcha|api-services-support@amazon\.com|automated access/i.test(head)) {
    return true;
  }
  // Short soft wall pages (title Amazon.com.mx, no product body).
  if (html.length < 12_000 && /<title[^>]*>\s*Amazon\./i.test(head) && !/productTitle|colorImages|asin/i.test(head)) {
    return true;
  }
  return false;
}

/**
 * Rewrite marketplace product URLs to the mobile HTML path that scrapes reliably.
 * Leaves short hops and non-Amazon hosts untouched.
 */
export function amazonHtmlScrapeUrl(href: string): string {
  const asin = extractAmazonAsin(href);
  if (!asin) return href;
  try {
    const u = new URL(href);
    if (!isOfferAmazonHost(u.hostname) || isAmazonExpandableHost(u.hostname)) return href;
    u.pathname = `/gp/aw/d/${asin}`;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return href;
  }
}
