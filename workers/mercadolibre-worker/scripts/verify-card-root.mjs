/**
 * Verify resolveListingCardRoot reaches poly-card (not poly-card__content).
 * READ-ONLY.
 */
import { chromium } from 'playwright';
import {
  pickBestCardImageUrl,
  resolveListingCardRoot,
} from '../src/cardImage.mjs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 1400 },
  });
  await page.goto('https://www.mercadolibre.com.mx/ofertas', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 2200).catch(() => {});
  await page.waitForTimeout(1200);

  // Inject resolver into page by serializing the algorithm (same as extractCards).
  const stats = await page.evaluate(() => {
    const classTokens = (el) => {
      const raw = el?.className;
      if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean);
      return [];
    };
    const isCardRoot = (el) => {
      if (!el || el.nodeType !== 1) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'li' || tag === 'article') return true;
      const tokens = classTokens(el);
      return (
        tokens.includes('poly-card') ||
        tokens.includes('ui-search-result') ||
        tokens.includes('andes-card') ||
        tokens.includes('ui-search-layout__item')
      );
    };
    const resolve = (anchor) => {
      const exact = anchor.closest(
        'li.ui-search-layout__item, li.ui-search-layout--grid__grid, li, article, div.poly-card, div.ui-search-result, div.andes-card',
      );
      if (exact && isCardRoot(exact)) return exact;
      let node = anchor.parentElement;
      let fallbackWithImg = null;
      for (let depth = 0; depth < 12 && node; depth += 1) {
        if (isCardRoot(node)) return node;
        if (
          !fallbackWithImg &&
          node.querySelector?.(
            'img, picture, .poly-component__picture, [class*="ui-search-result__image"]',
          )
        ) {
          fallbackWithImg = node;
        }
        node = node.parentElement;
      }
      return fallbackWithImg ?? anchor.parentElement ?? anchor;
    };

    const firstUrlFromSrcset = (srcset) => {
      if (typeof srcset !== 'string' || !srcset.trim()) return null;
      const parts = srcset
        .split(',')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean)
        .filter((u) => !/^(data|blob|javascript):/i.test(u));
      return parts.length ? parts[parts.length - 1] || parts[0] : null;
    };

    let withImg = 0;
    let without = 0;
    let contentRoot = 0;
    let polyRoot = 0;
    const samples = [];
    const anchors = Array.from(document.querySelectorAll('a[href]')).filter((a) =>
      /\/p\/|\/MLM|\/up\//i.test(a.getAttribute('href') || ''),
    );
    for (const a of anchors.slice(0, 40)) {
      const root = resolve(a);
      const cls = String(root?.className || '');
      if (cls.split(/\s+/).includes('poly-card__content')) contentRoot += 1;
      if (cls.split(/\s+/).includes('poly-card')) polyRoot += 1;
      const imgs = root ? Array.from(root.querySelectorAll('img')) : [];
      const candidates = [];
      for (const img of imgs) {
        candidates.push(img.getAttribute('src'));
        candidates.push(img.getAttribute('data-src'));
        candidates.push(firstUrlFromSrcset(img.getAttribute('srcset') || ''));
        candidates.push(firstUrlFromSrcset(img.getAttribute('data-srcset') || ''));
      }
      const hit = candidates.some(
        (u) => typeof u === 'string' && /mlstatic/i.test(u) && !/placeholder/i.test(u),
      );
      if (hit) withImg += 1;
      else without += 1;
      if (samples.length < 5) {
        samples.push({
          rootClass: cls.slice(0, 80),
          imgCount: imgs.length,
          firstSrc: imgs[0]?.getAttribute('src')?.slice(0, 100) || null,
          hit,
        });
      }
    }
    return { checked: withImg + without, withImg, without, contentRoot, polyRoot, samples };
  });

  console.log(JSON.stringify({ ok: true, stats }, null, 2));
  // Keep Node-side exports warm for lint/import check.
  void resolveListingCardRoot;
  void pickBestCardImageUrl;
} finally {
  await browser.close();
}
