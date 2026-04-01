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

function parseMoneyParts(fraction, cents) {
  const f = normalizeText(fraction || '');
  const c = normalizeText(cents || '');
  if (!f) return null;
  if (!c) return parseLocalizedNumber(f);
  return parseLocalizedNumber(`${f}.${c}`);
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

function collectJsonLikeNumbersFromHtml(html, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`["']${escaped}["']\\s*:\\s*(?:(["'])([^"']+)\\1|([0-9][0-9.,]*))`, 'gi');
  const out = [];
  let match;
  while ((match = re.exec(html)) !== null) {
    const raw = match[2] ?? match[3] ?? '';
    const parsed = parseLocalizedNumber(raw);
    if (parsed != null) out.push(parsed);
  }
  return out;
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

function isBlockedNonProductPath(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (
      /\/glossary\//i.test(url.pathname) ||
      /\/ofertas(?:\/|$)/i.test(url.pathname) ||
      /\/categorias?/i.test(url.pathname)
    );
  } catch {
    return true;
  }
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
      const discountBadge =
        card.querySelector('.andes-money-amount__discount')?.textContent ||
        Array.from(card.querySelectorAll('span, div'))
          .map((node) => node.textContent || '')
          .find((text) => /%/.test(text) && /(off|dto|descuento)/i.test(text)) ||
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
        discountBadge,
      };
    });
  });
}

async function enrichCandidate(page, candidate) {
  await page.goto(candidate.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500).catch(() => {});
  const extracted = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((node) => node.textContent || '')
      .filter(Boolean);
    const currentFractionNode =
      document.querySelector('.ui-pdp-price__second-line .andes-money-amount__fraction') ||
      document.querySelector('.ui-pdp-price__main-container .andes-money-amount__fraction') ||
      document.querySelector('[data-testid="price-part"]') ||
      document.querySelector('.andes-money-amount__fraction');
    const currentCentsNode =
      document.querySelector('.ui-pdp-price__second-line .andes-money-amount__cents') ||
      document.querySelector('.ui-pdp-price__main-container .andes-money-amount__cents') ||
      document.querySelector('.andes-money-amount__cents');
    const originalFractionNode =
      document.querySelector('.ui-pdp-price__original-value .andes-money-amount__fraction') ||
      document.querySelector('.ui-pdp-price__subtitles .andes-money-amount__fraction') ||
      document.querySelector('s .andes-money-amount__fraction');
    const originalCentsNode =
      document.querySelector('.ui-pdp-price__original-value .andes-money-amount__cents') ||
      document.querySelector('.ui-pdp-price__subtitles .andes-money-amount__cents') ||
      document.querySelector('s .andes-money-amount__cents');
    const title =
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.querySelector('h1')?.textContent ||
      '';
    const image =
      document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      document.querySelector('img')?.getAttribute('src') ||
      '';
    const current = currentFractionNode?.textContent || '';
    const currentCents = currentCentsNode?.textContent || '';
    const original = originalFractionNode?.textContent || '';
    const originalCents = originalCentsNode?.textContent || '';
    const soldText =
      document.querySelector('.ui-pdp-subtitle')?.textContent ||
      document.body.textContent ||
      '';
    return {
      title,
      image,
      currentText: `${current}${currentCents ? `.${currentCents}` : ''}`,
      originalText: original,
      currentFraction: current,
      currentCents,
      originalFraction: original,
      originalCents,
      soldText,
      url: location.href,
      scripts,
      pathname: location.pathname,
    };
  });
  const html = await page.content();
  const currentFromSelectors =
    parseMoneyParts(extracted.currentFraction, extracted.currentCents) ||
    parseLocalizedNumber(extracted.currentText || candidate.priceText);
  const originalFromSelectors =
    parseMoneyParts(extracted.originalFraction, extracted.originalCents) ||
    parseLocalizedNumber(extracted.originalText || candidate.originalText);

  const currentCandidates = [
    currentFromSelectors,
    extractJsonLikeNumberFromHtml(html, 'price'),
    extractJsonLikeNumberFromHtml(html, 'price_amount'),
    extractJsonLikeNumberFromHtml(html, 'amount'),
    ...collectJsonLikeNumbersFromHtml(html, 'price'),
  ].filter((value) => value != null);

  const originalCandidates = [
    originalFromSelectors,
    extractJsonLikeNumberFromHtml(html, 'original_price'),
    extractJsonLikeNumberFromHtml(html, 'priceBefore'),
    extractJsonLikeNumberFromHtml(html, 'regular_amount'),
    ...collectJsonLikeNumbersFromHtml(html, 'original_price'),
    ...collectJsonLikeNumbersFromHtml(html, 'regular_amount'),
  ].filter((value) => value != null);

  let currentFromLdJson = null;
  let originalFromLdJson = null;
  for (const raw of extracted.scripts || []) {
    if (raw.length > 500000) continue;
    try {
      const parsed = JSON.parse(raw);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (Array.isArray(node)) {
          stack.push(...node);
          continue;
        }
        if (node['@graph']) stack.push(node['@graph']);
        if (node.offers) stack.push(node.offers);
        if (currentFromLdJson == null) {
          currentFromLdJson =
            parseLocalizedNumber(String(node.price ?? '')) ||
            parseLocalizedNumber(String(node.lowPrice ?? '')) ||
            currentFromLdJson;
        }
        if (originalFromLdJson == null) {
          originalFromLdJson =
            parseLocalizedNumber(String(node.highPrice ?? '')) ||
            parseLocalizedNumber(String(node.priceBefore ?? '')) ||
            originalFromLdJson;
        }
      }
    } catch {
      // Ignorar JSON-LD inválido.
    }
  }

  if (currentFromLdJson != null) currentCandidates.push(currentFromLdJson);
  if (originalFromLdJson != null) originalCandidates.push(originalFromLdJson);

  const discountPrice = currentCandidates.find((value) => Number.isFinite(value) && value > 0) ?? null;
  const originalPrice =
    originalCandidates
      .filter((value) => Number.isFinite(value) && value > 0)
      .find((value) => discountPrice != null && value > discountPrice) ?? null;

  return {
    url: extracted.url || candidate.href,
    canonicalUrl: canonicalizeUrl(extracted.url || candidate.href),
    title: normalizeText(extracted.title || candidate.title),
    imageUrl: extracted.image || candidate.image,
    discountPrice,
    originalPrice,
    soldText: extracted.soldText || '',
    pathname: extracted.pathname || '',
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
        if (isBlockedNonProductPath(card.href)) {
          console.log(`[worker] skipped=${card.href} reason=url_no_producto`);
          continue;
        }
        const enriched = await enrichCandidate(page, card);
        const initialLooksProduct = isProductLikeUrl(card.href) && !isBlockedNonProductPath(card.href);
        const finalLooksProduct = isProductLikeUrl(enriched.url) && !isBlockedNonProductPath(enriched.url);
        const hasPdpSignals =
          !!inferItemId(enriched.url || card.href) ||
          /\/p\//i.test(enriched.pathname || '') ||
          (!!enriched.title && !looksGenericMercadoLibreTitle(enriched.title)) ||
          (!!enriched.discountPrice && !!enriched.imageUrl);

        if (!finalLooksProduct && !initialLooksProduct && !hasPdpSignals) {
          console.log(
            `[worker] skipped=${card.href} reason=url_final_no_producto final=${enriched.url}`
          );
          continue;
        }
        if (looksGenericMercadoLibreTitle(enriched.title)) {
          console.log(`[worker] skipped=${card.href} reason=title_generico title="${enriched.title}"`);
          continue;
        }
        if (!enriched.title) {
          console.log(`[worker] skipped=${card.href} reason=sin_title`);
          continue;
        }
        if (!enriched.discountPrice) {
          console.log(`[worker] skipped=${card.href} reason=sin_discount_price`);
          continue;
        }
        if (!enriched.originalPrice) {
          const badgePercent = Number.parseInt(String(card.discountBadge || '').replace(/[^\d]/g, ''), 10) || 0;
          const isDealCandidate = /[?&]pdp_filters=deal%3A/i.test(card.href) || /[?&]pdp_filters=deal:/i.test(card.href);
          if (isDealCandidate && badgePercent >= minDiscountPercent) {
            out.push({
              url: enriched.url,
              canonicalUrl: enriched.canonicalUrl,
              title: enriched.title,
              store: 'Mercado Libre',
              imageUrl: enriched.imageUrl,
              discountPrice: enriched.discountPrice,
              originalPrice: null,
              discountPercent: badgePercent,
              sourceDetail: 'worker:playwright:promo-unverified',
              signals: {
                soldQuantity: (() => {
                  const match = enriched.soldText.match(/(\d+)\s+vendid/i);
                  return match ? Number(match[1]) : null;
                })(),
                condition: 'new',
                listingTypeId: 'worker_seed_promo_unverified',
                categoryId: null
              }
            });
            console.log(
              `[worker] accepted=${enriched.canonicalUrl} discount=${badgePercent}% mode=promo_unverified`
            );
            continue;
          }
          console.log(`[worker] skipped=${card.href} reason=sin_original_price`);
          continue;
        }
        if (enriched.originalPrice <= enriched.discountPrice) {
          console.log(
            `[worker] skipped=${card.href} reason=original_menor_igual discount=${enriched.discountPrice} original=${enriched.originalPrice}`
          );
          continue;
        }
        const discountPercent = Math.round((1 - enriched.discountPrice / enriched.originalPrice) * 100);
        if (discountPercent < minDiscountPercent) {
          console.log(
            `[worker] skipped=${card.href} reason=discount_bajo discount=${discountPercent}%`
          );
          continue;
        }
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
