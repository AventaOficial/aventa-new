function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function parseLocalizedNumber(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const clean = value.replace(/[^\d,.-]/g, '').trim();
  if (!clean) return null;
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  let normalized = clean;
  if (hasComma && hasDot) {
    normalized =
      clean.lastIndexOf('.') > clean.lastIndexOf(',')
        ? clean.replace(/,/g, '')
        : clean.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    const parts = clean.split(',');
    normalized =
      parts.length === 2 && parts[1].length <= 2
        ? `${parts[0].replace(/,/g, '')}.${parts[1]}`
        : clean.replace(/,/g, '');
  }
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function inferItemId(url) {
  try {
    const parsed = new URL(url);
    const direct =
      parsed.searchParams.get('wid') ||
      parsed.searchParams.get('item_id') ||
      parsed.searchParams.get('itemId');
    if (direct) return direct.trim().toUpperCase();
    const filters = parsed.searchParams.get('pdp_filters');
    const fromFilters = filters?.match(/item_id:([A-Z]{2,6}\d+)/i)?.[1];
    if (fromFilters) return fromFilters.toUpperCase();
    const fromPath = parsed.pathname.match(/\/((?:ML|M[A-Z]{1,5})\d+)(?:[/?#-]|$)/i)?.[1];
    return fromPath ? fromPath.toUpperCase() : null;
  } catch {
    return null;
  }
}

function canonicalizeUrl(url) {
  try {
    const parsed = new URL(url);
    const itemId = inferItemId(url);
    const out = new URL(`${parsed.origin}${parsed.pathname}`);
    if (itemId) out.searchParams.set('wid', itemId);
    return out.toString();
  } catch {
    return url;
  }
}

function isMercadoLibreHost(hostname) {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  return host === 'mercadolibre.com.mx' || host.endsWith('.mercadolibre.com.mx');
}

function isProductLikeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!isMercadoLibreHost(url.hostname)) return false;
    if (inferItemId(url.href)) return true;
    return /\/p\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractJsonLikeNumberFromHtml(html, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match =
    html.match(new RegExp(`["']${escaped}["']\\s*:\\s*["']([^"']+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`["']${escaped}["']\\s*:\\s*([0-9][0-9.,]*)`, 'i'))?.[1] ??
    null;
  return parseLocalizedNumber(match);
}

function looksGenericMercadoLibreTitle(title) {
  const text = normalizeText(title).toLowerCase();
  if (!text) return true;
  return (
    text.includes('mercadolibre.com.mx') ||
    /^videojuegos\b/.test(text) ||
    /^computación\b/.test(text) ||
    /^conectividad y redes\b/.test(text) ||
    /^animales y mascotas\b/.test(text) ||
    /\ben mercado libre\b/.test(text)
  );
}

async function extractCards(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('a[href]'));
    return cards.map((anchor) => {
      const card = anchor.closest('article, div') ?? anchor.parentElement ?? anchor;
      const rawHref = anchor.getAttribute('href') || '';
      const href = rawHref.startsWith('http') ? rawHref : new URL(rawHref, location.origin).href;
      const image =
        card.querySelector('img')?.getAttribute('src') ||
        card.querySelector('img')?.getAttribute('data-src') ||
        null;
      const fraction =
        card.querySelector('[data-testid="price-part"]')?.textContent ||
        card.querySelector('.andes-money-amount__fraction')?.textContent ||
        '';
      const cents = card.querySelector('.andes-money-amount__cents')?.textContent || '';
      const original =
        card.querySelector('.andes-money-amount__discount .andes-money-amount__fraction')?.textContent ||
        card.querySelector('s .andes-money-amount__fraction')?.textContent ||
        '';
      const title =
        anchor.getAttribute('title') ||
        card.querySelector('h2, h3')?.textContent ||
        anchor.textContent ||
        '';
      return {
        href,
        title,
        image,
        priceText: `${fraction}${cents ? `.${cents}` : ''}`,
        originalText: original,
      };
    });
  });
}

async function enrichCandidate(page, candidate) {
  await page.goto(candidate.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500).catch(() => {});
  const extracted = await page.evaluate(() => {
    const title =
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.querySelector('h1')?.textContent ||
      '';
    const image =
      document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      document.querySelector('img')?.getAttribute('src') ||
      '';
    const current =
      document.querySelector('[data-testid="price-part"]')?.textContent ||
      document.querySelector('.andes-money-amount__fraction')?.textContent ||
      '';
    const currentCents = document.querySelector('.andes-money-amount__cents')?.textContent || '';
    const original =
      document.querySelector('.ui-pdp-price__original-value .andes-money-amount__fraction')?.textContent ||
      document.querySelector('s .andes-money-amount__fraction')?.textContent ||
      '';
    const soldText =
      document.querySelector('.ui-pdp-subtitle')?.textContent ||
      document.body.textContent ||
      '';
    return {
      title,
      image,
      currentText: `${current}${currentCents ? `.${currentCents}` : ''}`,
      originalText: original,
      soldText,
      url: location.href,
    };
  });
  const html = await page.content();
  const currentFromHtml =
    extractJsonLikeNumberFromHtml(html, 'price') ||
    extractJsonLikeNumberFromHtml(html, 'price_amount');
  const originalFromHtml =
    extractJsonLikeNumberFromHtml(html, 'original_price') ||
    extractJsonLikeNumberFromHtml(html, 'priceBefore');
  return {
    url: extracted.url || candidate.href,
    canonicalUrl: canonicalizeUrl(extracted.url || candidate.href),
    title: normalizeText(extracted.title || candidate.title),
    imageUrl: extracted.image || candidate.image,
    discountPrice:
      parseLocalizedNumber(extracted.currentText || candidate.priceText) || currentFromHtml,
    originalPrice:
      parseLocalizedNumber(extracted.originalText || candidate.originalText) || originalFromHtml,
    soldText: extracted.soldText || '',
  };
}

export async function discoverMercadoLibreCandidates(page, options) {
  const { seeds, maxItems, minDiscountPercent } = options;
  const out = [];
  const seen = new Set();

  for (const seed of seeds) {
    if (out.length >= maxItems) break;
    await page.goto(seed, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500).catch(() => {});
    await page.mouse.wheel(0, 2500).catch(() => {});
    await page.waitForTimeout(1200).catch(() => {});
    const cards = (await extractCards(page)).filter((card) => isProductLikeUrl(card.href));
    console.log(`[worker] seed=${seed} raw_links=${cards.length}`);
    for (const card of cards) {
      if (out.length >= maxItems) break;
      if (!card.href || seen.has(card.href)) continue;
      seen.add(card.href);
      try {
        console.log(`[worker] visiting=${card.href}`);
        const enriched = await enrichCandidate(page, card);
        if (!isProductLikeUrl(enriched.url)) continue;
        if (looksGenericMercadoLibreTitle(enriched.title)) continue;
        if (!enriched.title || !enriched.discountPrice || !enriched.originalPrice) continue;
        if (enriched.originalPrice <= enriched.discountPrice) continue;
        const discountPercent = Math.round((1 - enriched.discountPrice / enriched.originalPrice) * 100);
        if (discountPercent < minDiscountPercent) continue;
        out.push({
          url: enriched.url,
          canonicalUrl: enriched.canonicalUrl,
          title: enriched.title,
          store: 'Mercado Libre',
          imageUrl: enriched.imageUrl,
          discountPrice: enriched.discountPrice,
          originalPrice: enriched.originalPrice,
          discountPercent,
          sourceDetail: 'worker:playwright',
          signals: {
            soldQuantity: (() => {
              const match = enriched.soldText.match(/(\d+)\s+vendid/i);
              return match ? Number(match[1]) : null;
            })(),
            condition: 'new',
            listingTypeId: 'worker_seed',
            categoryId: null
          }
        });
        console.log(`[worker] accepted=${enriched.canonicalUrl} discount=${discountPercent}%`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[worker] skipped=${card.href} reason=${message}`);
      }
    }
  }

  console.log(`[worker] usable_candidates=${out.length}`);
  return out;
}
