/**
 * Walmart MX HTML scrape helpers for parse-offer-url.
 *
 * Desktop Chrome UA often hits PerimeterX `/blocked` (captcha).
 * Mobile Safari UA still returns usable PDP HTML with title/price in JSON-LD / __NEXT_DATA__
 * (same idea as Amazon `/gp/aw/d/` — fetch-only, identity stays `/ip/{id}`).
 */
import { isOfferWalmartHost, isWalmartExpandableHost } from '@/lib/offers/commerceHostAllowlist';
import { extractWalmartItemId } from '@/lib/offers/urlResolution/walmartResolver';

export const WALMART_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** True when the response is Walmart's anti-bot interstitial, not a product page. */
export function isWalmartBotWallHtml(html: string, finalUrl?: string | null): boolean {
  if (!html) return true;
  if (finalUrl && /\/blocked(?:\?|$)/i.test(finalUrl)) return true;
  const head = html.slice(0, 14_000);
  if (/px-captcha|_pxAppId|Verifica tu identidad|Mant[eé]n presionado/i.test(head)) {
    return true;
  }
  // Soft wall: short page without product signals.
  if (
    html.length < 20_000 &&
    /\/blocked|px-captcha/i.test(head) &&
    !/__NEXT_DATA__|itemPage|application\/ld\+json/i.test(head)
  ) {
    return true;
  }
  return false;
}

/**
 * Prefer the slug+/ip/ path when present (better SSR); else canonical `/ip/{itemId}`.
 * Leaves short hops untouched.
 */
export function walmartHtmlScrapeUrl(href: string, canonicalIp?: string | null): string {
  try {
    const u = new URL(href);
    if (!isOfferWalmartHost(u.hostname) || isWalmartExpandableHost(u.hostname)) {
      return canonicalIp || href;
    }
    const id = extractWalmartItemId(href);
    if (!id) return canonicalIp || href;
    // Keep slug path if already a product /ip/… URL.
    if (/\/ip\//i.test(u.pathname)) {
      u.search = '';
      u.hash = '';
      return u.toString();
    }
    if (canonicalIp) return canonicalIp;
    return `https://${u.hostname.startsWith('www.') ? u.hostname : `www.${u.hostname}`}/ip/${id}`;
  } catch {
    return canonicalIp || href;
  }
}
