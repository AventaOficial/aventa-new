/**
 * READ-ONLY DOM diagnostic for ML card images. No POST / no DB.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outPath = path.join(root, 'scripts/_s63-card-image-dom-diag.json');

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
  await page.mouse.wheel(0, 1800).catch(() => {});
  await page.waitForTimeout(1200);

  const diag = await page.evaluate(() => {
    const productish = (href) => /\/p\/|\/MLM|\/up\//i.test(href || '');
    const anchors = Array.from(document.querySelectorAll('a[href]')).filter((a) =>
      productish(a.getAttribute('href') || ''),
    );
    const rows = [];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const nearestDiv = a.closest('div');
      const structural = a.closest(
        'li, article, div.poly-card, div[class*="poly-card"], div.ui-search-result, div[class*="ui-search-result"], div.andes-card',
      );
      const root = structural || nearestDiv || a.parentElement;
      const imgs = root
        ? Array.from(root.querySelectorAll('img, picture, [class*="picture"]'))
        : [];
      const sample = imgs.slice(0, 4).map((el) => {
        const style = el.getAttribute?.('style') || '';
        return {
          tag: el.tagName,
          className: String(el.className || '').slice(0, 100),
          src: el.getAttribute?.('src')?.slice(0, 140) || null,
          dataSrc: el.getAttribute?.('data-src')?.slice(0, 140) || null,
          dataLazy: el.getAttribute?.('data-lazy')?.slice(0, 140) || null,
          dataLazySrc: el.getAttribute?.('data-lazy-src')?.slice(0, 140) || null,
          srcset: (el.getAttribute?.('srcset') || '').slice(0, 100) || null,
          dataSrcset: (el.getAttribute?.('data-srcset') || '').slice(0, 100) || null,
          style: style.slice(0, 160) || null,
          bg: (getComputedStyle(el).backgroundImage || '').slice(0, 160) || null,
          outer: el.outerHTML?.slice(0, 220) || null,
        };
      });
      rows.push({
        href: href.slice(0, 120),
        rootTag: root?.tagName || null,
        rootClass: String(root?.className || '').slice(0, 100),
        usedStructural: Boolean(structural),
        imgCount: imgs.length,
        sample,
      });
      if (rows.length >= 10) break;
    }

    const allImgs = Array.from(document.querySelectorAll('img'))
      .slice(0, 8)
      .map((img) => ({
        src: img.getAttribute('src')?.slice(0, 140) || null,
        dataSrc: img.getAttribute('data-src')?.slice(0, 140) || null,
        className: String(img.className || '').slice(0, 80),
        parentClass: String(img.parentElement?.className || '').slice(0, 80),
      }));

    return {
      productAnchors: anchors.length,
      totalImgs: document.querySelectorAll('img').length,
      rows,
      allImgs,
    };
  });

  writeFileSync(outPath, JSON.stringify(diag, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, outPath, productAnchors: diag.productAnchors, totalImgs: diag.totalImgs, rowCount: diag.rows.length }, null, 2));
} finally {
  await browser.close();
}
