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

async function extractCards(page) {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll('a[href*="mercadolibre.com.mx"], a[href*="meli.la"]')
    );
    return cards.map((anchor) => {
      const card = anchor.closest('article, div') ?? anchor.parentElement ?? anchor;
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
      const href = anchor.href || '';
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
  await page.goto(candidate.href, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
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
  return {
    url: extracted.url || candidate.href,
    canonicalUrl: canonicalizeUrl(extracted.url || candidate.href),
    title: normalizeText(extracted.title || candidate.title),
    imageUrl: extracted.image || candidate.image,
    discountPrice: parseLocalizedNumber(extracted.currentText || candidate.priceText),
    originalPrice: parseLocalizedNumber(extracted.originalText || candidate.originalText),
    soldText: extracted.soldText || '',
  };
}

export async function discoverMercadoLibreCandidates(page, options) {
  const { seeds, maxItems, minDiscountPercent } = options;
  const out = [];
  const seen = new Set();

  for (const seed of seeds) {
    if (out.length >= maxItems) break;
    await page.goto(seed, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const cards = await extractCards(page);
    for (const card of cards) {
      if (out.length >= maxItems) break;
      if (!card.href || seen.has(card.href)) continue;
      seen.add(card.href);
      try {
        const enriched = await enrichCandidate(page, card);
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
      } catch {
        // Ignorar fallos individuales y seguir con el lote.
      }
    }
  }

  return out;
}
