/**

 * Card image extraction helpers — S6.3 / Pre-Master precision.

 * Pure functions shared by worker discovery + unit tests.

 * No HTTP / Playwright / DB.

 */



/** Lazy / responsive attrs commonly present on ML listing cards. */

export const CARD_IMAGE_URL_ATTRS = [

  'src',

  'data-src',

  'data-lazy',

  'data-lazy-src',

  'data-original',

  'data-img',

  'data-image',

  'data-zoom',

  'data-srcset',

  'data-lazy-srcset',

  'srcset',

];



/** Structural selectors for the product picture column (not price/UI chrome). */

export const PRODUCT_PICTURE_SELECTORS = [

  '.poly-component__picture',

  '[class*="ui-search-result__image"]',

  '[class*="ui-search-result-image"]',

  'picture',

];



/** Ancestors that are UI chrome — never product photos. */

export const UI_CHROME_ANCESTOR_SELECTORS = [

  '.andes-money-amount',

  '[class*="andes-money-amount"]',

  '[class*="shipping"]',

  '[class*="loyalty"]',

  '[class*="ui-search-item__group--price"]',

  '[class*="poly-price"]',

  '[class*="poly-component__price"]',

  '[class*="badge"]',

  'nav',

  'header',

  'footer',

];



export function firstUrlFromSrcset(srcset) {

  if (typeof srcset !== 'string' || !srcset.trim()) return null;

  const parts = srcset

    .split(',')

    .map((part) => part.trim().split(/\s+/)[0])

    .filter(Boolean)

    .filter((u) => !/^(data|blob|javascript):/i.test(u));

  if (parts.length === 0) return null;

  // Último entry suele ser la resolución más alta (2x / Nw).

  return parts[parts.length - 1] || parts[0];

}



/**

 * Collect raw URL strings from an img-like attribute map (Node + browser tests).

 * Does not invent URLs — only reads provided attrs.

 */

export function collectRawUrlsFromImgAttrs(attrs) {

  if (!attrs || typeof attrs !== 'object') return [];

  const out = [];

  for (const key of CARD_IMAGE_URL_ATTRS) {

    const raw = attrs[key];

    if (typeof raw !== 'string' || !raw.trim()) continue;

    if (/srcset/i.test(key)) {

      const fromSet = firstUrlFromSrcset(raw);

      if (fromSet) out.push(fromSet);

    } else {

      out.push(raw.trim());

    }

  }

  if (typeof attrs.currentSrc === 'string' && attrs.currentSrc.trim()) {

    out.push(attrs.currentSrc.trim());

  }

  return out;

}



export function normalizeAbsoluteImageUrl(raw) {

  const value = typeof raw === 'string' ? raw.trim() : '';

  if (!value) return null;

  if (/^(javascript|data|blob):/i.test(value)) return null;

  if (value.startsWith('//')) return `https:${value}`;

  if (/^https?:\/\//i.test(value)) {

    try {

      const u = new URL(value);

      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

      if (/account-verification|\/login|\/registration/i.test(u.pathname)) return null;

      // Own-site / app assets are never product images.

      if (/aventaofertas\.com$/i.test(u.hostname) || /\.aventaofertas\.com$/i.test(u.hostname)) {

        return null;

      }

      return value;

    } catch {

      return null;

    }

  }

  if (value.startsWith('/')) return `https://http2.mlstatic.com${value}`;

  return null;

}



/** True for typical ML product CDN stems (D_NQ_NP / D_NP / D_Q_NP). */

export function isMercadoLibreProductCdnUrl(url) {

  if (!url || typeof url !== 'string') return false;

  return /mlstatic\.com\/.*D_(?:NQ_)?(?:NP_|Q_NP_)/i.test(url) || /mlstatic\.com\/D_(?:NQ_)?NP_/i.test(url);

}



/** Structural / path signals for UI chrome, logos, tracking — not product photos. */

export function isLikelyUiOrSiteChromeImage(url) {

  if (!url || typeof url !== 'string') return true;

  const lower = url.toLowerCase();

  let host = '';

  let path = lower;

  try {

    const u = new URL(lower.startsWith('//') ? `https:${lower}` : lower);

    host = u.hostname;

    path = u.pathname;

  } catch {

    /* keep path = lower */

  }

  if (host === 'aventaofertas.com' || host.endsWith('.aventaofertas.com')) return true;

  if (/\/storage\/splinter/i.test(path)) return true;

  if (/logo-email|\/logo\.(?:png|webp|jpg|jpeg|svg)(?:$|[?#])/i.test(path)) return true;

  if (/favicon|avatar|seller[-_]?logo|meli-logo|nav-icon|icon[_-]?ui/i.test(lower)) return true;

  if (/loyalty|shipping-icon|free.?ship.?badge|andes-badge|price-tag/i.test(lower)) return true;

  if (/placeholder|pixel|spacer|blank\.|data:image\/svg|\.svg(\?|$)|1x1|tracking|sprite/i.test(lower)) {

    return true;

  }

  if (/\/adsystem\/|doubleclick\.net|beacon/i.test(lower)) return true;

  return false;

}



export function scoreCardImageCandidate(url) {

  if (!url || typeof url !== 'string') return -1;

  const u = url.trim();

  if (!u || /^(data|blob|javascript):/i.test(u)) return -1;

  if (isLikelyUiOrSiteChromeImage(u)) return 0;

  // Typical ML product CDN resource ids.

  if (isMercadoLibreProductCdnUrl(u)) return 12;

  if (/mlstatic|meli/i.test(u)) return 4; // generic mlstatic without product stem — weak

  if (/^https:\/\//i.test(u)) return 5;

  if (/^http:\/\//i.test(u)) return 3;

  return 1;

}



/**

 * Elige la mejor URL de imagen de card entre candidatas (src, data-src, srcset…).

 */

export function pickBestCardImageUrl(rawCandidates, origin = 'https://www.mercadolibre.com.mx') {

  let best = null;

  let bestScore = -1;

  for (const raw of rawCandidates) {

    if (typeof raw !== 'string' || !raw.trim()) continue;

    let value = raw.trim();

    if (value.startsWith('//')) value = `https:${value}`;

    else if (value.startsWith('/')) {

      try {

        value = new URL(value, origin).href;

      } catch {

        value = normalizeAbsoluteImageUrl(value) || value;

      }

    }

    const abs = normalizeAbsoluteImageUrl(value);

    if (!abs) continue;

    const score = scoreCardImageCandidate(abs);

    if (score > bestScore) {

      bestScore = score;

      best = abs;

    }

  }

  return bestScore > 0 ? best : null;

}



function classTokens(el) {

  const raw = el?.className;

  if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean);

  if (raw && typeof raw.baseVal === 'string') return raw.baseVal.split(/\s+/).filter(Boolean);

  return [];

}



/**

 * Prefer listing-card containers that include the product picture.

 *

 * BUG (S5.5/S6.3): `closest('div[class*="poly-card"]')` matches

 * `poly-card__content` (title/price column) and EXCLUDES the sibling image

 * column under the real `poly-card` root → imageUrl=null always.

 *

 * Pre-Master: bare `li` is NOT a card root (too coarse — can include chrome).

 */

export function resolveListingCardRoot(anchor) {

  if (!anchor || typeof anchor.closest !== 'function') return null;



  const isCardRoot = (el) => {

    if (!el || el.nodeType !== 1) return false;

    const tag = (el.tagName || '').toLowerCase();

    const tokens = classTokens(el);

    if (tag === 'li') {

      return (

        tokens.includes('ui-search-layout__item') ||

        tokens.some((t) => t.startsWith('ui-search-layout'))

      );

    }

    if (tag === 'article') return true;

    return (

      tokens.includes('poly-card') ||

      tokens.includes('ui-search-result') ||

      tokens.includes('andes-card') ||

      tokens.includes('ui-search-layout__item')

    );

  };



  // Exact class match — never substring `poly-card__content`; no bare `li`.

  const exact = anchor.closest(

    'li.ui-search-layout__item, li.ui-search-layout--grid__grid, article, div.poly-card, div.ui-search-result, div.andes-card',

  );

  if (exact && isCardRoot(exact)) return exact;



  let node = anchor.parentElement;

  let fallbackWithImg = null;

  for (let depth = 0; depth < 12 && node; depth += 1) {

    if (isCardRoot(node)) return node;

    if (

      !fallbackWithImg &&

      typeof node.querySelector === 'function' &&

      node.querySelector('img, picture, .poly-component__picture, [class*="ui-search-result__image"]')

    ) {

      fallbackWithImg = node;

    }

    node = node.parentElement;

  }

  return fallbackWithImg ?? anchor.parentElement ?? anchor;

}



function isUnderUiChrome(el) {

  if (!el || typeof el.closest !== 'function') return false;

  return Boolean(el.closest(UI_CHROME_ANCESTOR_SELECTORS.join(',')));

}



/**

 * Collect img/source URLs under a card root, preferring the product picture column.

 * Excludes nodes under price/shipping/loyalty chrome.

 */

export function collectImgCandidatesFromCard(root) {

  const out = [];

  if (!root || typeof root.querySelectorAll !== 'function') return out;



  const pushFromEl = (el) => {

    if (!el || isUnderUiChrome(el)) return;

    for (const attr of CARD_IMAGE_URL_ATTRS) {

      const raw = typeof el.getAttribute === 'function' ? el.getAttribute(attr) : null;

      if (typeof raw !== 'string' || !raw.trim()) continue;

      if (/srcset/i.test(attr)) {

        const fromSet = firstUrlFromSrcset(raw);

        if (fromSet) out.push(fromSet);

      } else {

        out.push(raw.trim());

      }

    }

    if (typeof el.currentSrc === 'string' && el.currentSrc.trim()) {

      out.push(el.currentSrc.trim());

    }

  };



  const pictureRoots = [];

  for (const sel of PRODUCT_PICTURE_SELECTORS) {

    try {

      pictureRoots.push(...Array.from(root.querySelectorAll(sel)));

    } catch {

      /* invalid selector in some environments */

    }

  }



  const scoped =

    pictureRoots.length > 0

      ? pictureRoots.flatMap((pr) => [

          ...Array.from(pr.querySelectorAll?.('img') ?? []),

          ...(pr.tagName && pr.tagName.toLowerCase() === 'img' ? [pr] : []),

          ...Array.from(pr.querySelectorAll?.('source') ?? []),

        ])

      : [

          ...Array.from(root.querySelectorAll('img')),

          ...Array.from(root.querySelectorAll('picture source')),

        ];



  for (const el of scoped) pushFromEl(el);

  return out;

}


