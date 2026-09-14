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
    const candidates = [
      parsed.searchParams.get('wid'),
      parsed.searchParams.get('item_id'),
      parsed.searchParams.get('itemId'),
    ];
    const filters = parsed.searchParams.get('pdp_filters');
    const fromFilters = filters?.match(/item_id:([A-Z]{2,6}\d+)/i)?.[1];
    if (fromFilters) candidates.push(fromFilters);
    const fromPath = parsed.pathname.match(/\/((?:ML|M[A-Z]{1,5})\d+)(?:[/?#-]|$)/i)?.[1];
    if (fromPath) candidates.push(fromPath);

    for (const raw of candidates) {
      if (!raw) continue;
      const id = raw.replace(/-/g, '').trim().toUpperCase();
      if (isMercadoLibreApiItemId(id)) return id;
    }
    return null;
  } catch {
    return null;
  }
}

/** True si el id puede ir a /items/{id}. Rechaza /up/MLMU… (user product). */
export function isMercadoLibreApiItemId(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const id = raw.replace(/-/g, '').trim().toUpperCase();
  if (!/^ML[A-Z]{0,3}\d+$/i.test(id)) return false;
  // MLMU123… / MLAU123… ≠ items Uruguay MLU123…
  if (/^ML[A-Z]U\d+$/i.test(id)) return false;
  return true;
}

export function firstUrlFromSrcset(srcset) {
  if (typeof srcset !== 'string' || !srcset.trim()) return null;
  const parts = srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .filter((u) => !u.startsWith('data:'));
  if (parts.length === 0) return null;
  // Último entry suele ser la resolución más alta (2x / Nw).
  return parts[parts.length - 1] || parts[0];
}

function scoreCardImageCandidate(url) {
  if (!url || typeof url !== 'string') return -1;
  const u = url.trim();
  if (!u || u.startsWith('data:')) return -1;
  if (/placeholder|pixel|spacer|blank\.|data:image\/svg|\.svg(\?|$)/i.test(u)) return 0;
  if (/mlstatic|meli/i.test(u)) return 10;
  if (/^https?:\/\//i.test(u)) return 5;
  return 1;
}

/**
 * Elige la mejor URL de imagen de card entre candidatas (src, data-src, srcset…).
 * Exportada para tests; la misma lógica se usa dentro de page.evaluate.
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
    if (/\/p\//i.test(url.pathname)) return true;
    // /up/MLMU… es producto de listado; no es item API pero sí card válida.
    if (/\/up\/ML[A-Z]/i.test(url.pathname)) return true;
    return false;
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
    const path = url.pathname.toLowerCase();
    return (
      /\/glossary\//i.test(path) ||
      /\/ofertas(?:\/|$)/i.test(path) ||
      /\/categorias?/i.test(path) ||
      /\/gz\//i.test(path) ||
      /account-verification/i.test(path) ||
      /\/login/i.test(path) ||
      /\/registration/i.test(path) ||
      /\/jms\//i.test(path) ||
      /\/navigation\//i.test(path) ||
      /\/ayuda\//i.test(path) ||
      /\/help\//i.test(path)
    );
  } catch {
    return true;
  }
}

function clampDiscountPercent(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(90, Math.round(n)));
}

function parseDiscountBadgePercent(raw) {
  const text = normalizeText(raw);
  if (!text) return 0;
  const match = text.match(/(\d{1,2})\s*%/);
  if (!match) return 0;
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n) || n < 1 || n > 90) return 0;
  return n;
}

function normalizeAbsoluteImageUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  if (value.startsWith('//')) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `https://http2.mlstatic.com${value}`;
  return null;
}

/**
 * Shortlist desde card. El badge es DISCOVERY SIGNAL, no DEAL PROOF.
 * Si el original se reconstruye solo desde badge %, se marca `badge_reconstructed`
 * y NO debe bastar para pending sin PDP / Quality Engine.
 */
function candidateFromCard(card, minDiscountPercent) {
  if (isBlockedNonProductPath(card.href)) {
    return { ok: false, reason: 'url_no_producto' };
  }
  const itemId = inferItemId(card.href);
  if (!itemId && !/\/p\//i.test(card.href) && !/\/up\//i.test(card.href)) {
    return { ok: false, reason: 'sin_item_id' };
  }
  if (!isProductLikeUrl(card.href)) {
    return { ok: false, reason: 'url_no_producto' };
  }

  const title = normalizeText(card.title);
  if (!title || looksGenericMercadoLibreTitle(title)) {
    return { ok: false, reason: 'title_generico' };
  }

  const discountPrice = parseLocalizedNumber(card.priceText);
  if (discountPrice == null || discountPrice <= 0) {
    return { ok: false, reason: 'sin_discount_price' };
  }

  const strikethroughOriginal = parseLocalizedNumber(card.originalText);
  const badgePercent = parseDiscountBadgePercent(card.discountBadge);

  let originalPrice = null;
  let cardDiscountSource = 'unknown';
  let originalFromBadgeOnly = false;

  if (strikethroughOriginal != null && strikethroughOriginal > discountPrice) {
    originalPrice = strikethroughOriginal;
    cardDiscountSource = 'card_strikethrough';
  } else if (badgePercent >= minDiscountPercent) {
    // Reconstrucción solo para PRIORIZAR shortlist — no es evidencia fuerte.
    originalPrice = Number((discountPrice / (1 - badgePercent / 100)).toFixed(2));
    cardDiscountSource = 'badge_reconstructed';
    originalFromBadgeOnly = true;
  }

  const nominalDiscountPercent =
    originalPrice != null && originalPrice > discountPrice
      ? clampDiscountPercent((1 - discountPrice / originalPrice) * 100)
      : badgePercent > 0
        ? badgePercent
        : 0;

  // Shortlist: hace falta alguna señal de descuento (badge o tachado), no prueba.
  if (nominalDiscountPercent < minDiscountPercent && badgePercent < minDiscountPercent) {
    return { ok: false, reason: `discount_bajo_${nominalDiscountPercent}` };
  }

  const canonicalUrl = canonicalizeUrl(card.href);
  return {
    ok: true,
    candidate: {
      url: canonicalUrl,
      canonicalUrl,
      href: card.href,
      title,
      store: 'Mercado Libre',
      imageUrl: normalizeAbsoluteImageUrl(card.image),
      discountPrice,
      originalPrice,
      discountPercent: nominalDiscountPercent,
      nominalDiscountPercent,
      cardDiscountSource,
      originalFromBadgeOnly,
      cardBadgePercent: badgePercent > 0 ? badgePercent : null,
      sourceDetail: 'worker:playwright:card',
      signals: {
        soldQuantity: null,
        condition: 'new',
        listingTypeId: 'worker_card',
        categoryId: null,
        cardDiscountSource,
        cardBadgePercent: badgePercent > 0 ? badgePercent : null,
        currentPriceProvenance: 'source_explicit',
        // Tachado de card = listing_card (WEAK). Nunca source_explicit (STRONG).
        originalPriceProvenance:
          cardDiscountSource === 'card_strikethrough' ? 'listing_card' : 'unknown',
        discountPercentProvenance:
          cardDiscountSource === 'card_strikethrough' ? 'derived' : 'unknown',
      },
    },
  };
}

/** Score de shortlist: nominal alto primero; tachado real gana a badge. */
export function scoreShortlistCandidate(candidate) {
  const nominal = Number(candidate.nominalDiscountPercent ?? candidate.discountPercent ?? 0) || 0;
  const evidenceBonus =
    candidate.cardDiscountSource === 'card_strikethrough'
      ? 20
      : candidate.cardDiscountSource === 'badge_reconstructed'
        ? 0
        : 5;
  const price = Number(candidate.discountPrice) || 0;
  const midPriceBonus = price >= 100 && price <= 15000 ? 5 : 0;
  return nominal + evidenceBonus + midPriceBonus;
}

export function selectShortlist(candidates, limit) {
  const cap = Math.max(1, Math.trunc(limit) || 1);
  return [...candidates]
    .sort((a, b) => scoreShortlistCandidate(b) - scoreShortlistCandidate(a))
    .slice(0, cap);
}

/**
 * ¿El original del candidato es solo reconstrucción de badge?
 * Exportada para tests del gate V2.
 */
function isBadgeReconstructedOriginal(candidate) {
  return (
    candidate?.originalFromBadgeOnly === true ||
    candidate?.cardDiscountSource === 'badge_reconstructed' ||
    candidate?.signals?.cardDiscountSource === 'badge_reconstructed'
  );
}

/**
 * Gate local: badge solo no es elegible para ingest sin evidencia PDP (u otra).
 */
function workerCandidateEligibleForIngest(candidate) {
  if (!candidate || !(Number(candidate.discountPrice) > 0)) {
    return { ok: false, reason: 'sin_discount_price' };
  }
  const evidence = candidate.evidenceSource ?? null;
  if (evidence === 'pdp') {
    if (
      candidate.originalPrice != null &&
      Number(candidate.originalPrice) > Number(candidate.discountPrice)
    ) {
      return { ok: true, reason: 'pdp_original' };
    }
    // PDP confirmó current; original puede venir después vía Price Memory en server.
    // No fabricamos original. Enviamos solo si hay original PDP o tachado de card.
    if (candidate.cardDiscountSource === 'card_strikethrough' && candidate.originalPrice != null) {
      return { ok: true, reason: 'pdp_current_card_strikethrough' };
    }
    return { ok: false, reason: 'pdp_insufficient_original' };
  }
  if (evidence === 'card_strikethrough' || candidate.cardDiscountSource === 'card_strikethrough') {
    if (
      candidate.originalPrice != null &&
      Number(candidate.originalPrice) > Number(candidate.discountPrice) &&
      !isBadgeReconstructedOriginal(candidate)
    ) {
      return { ok: true, reason: 'card_strikethrough' };
    }
  }
  if (isBadgeReconstructedOriginal(candidate)) {
    return { ok: false, reason: 'badge_nominal_insufficient' };
  }
  return { ok: false, reason: 'insufficient_evidence' };
}

function isPdpBlockedPath(pathnameOrUrl) {
  const raw = typeof pathnameOrUrl === 'string' ? pathnameOrUrl : '';
  try {
    const path = raw.includes('://') ? new URL(raw).pathname : raw;
    return (
      /account-verification/i.test(path) ||
      /\/login/i.test(path) ||
      /\/registration/i.test(path) ||
      /\/gz\//i.test(path)
    );
  } catch {
    return true;
  }
}

async function hydrateCardImages(page) {
  // Scroll suave para disparar lazy-load; sin scrapear PDP ni abrir productos.
  await page
    .evaluate(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const imgs = Array.from(document.querySelectorAll('img')).slice(0, 100);
      for (const img of imgs) {
        try {
          img.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch {
          /* ignore */
        }
      }
      window.scrollBy(0, Math.min(1200, document.body.scrollHeight || 1200));
      await sleep(350);
      window.scrollBy(0, Math.min(1200, document.body.scrollHeight || 1200));
      await sleep(350);
    })
    .catch(() => {});
  await page.waitForTimeout(500).catch(() => {});
}

async function extractCards(page) {
  return page.evaluate(() => {
    const firstUrlFromSrcset = (srcset) => {
      if (typeof srcset !== 'string' || !srcset.trim()) return null;
      const parts = srcset
        .split(',')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean)
        .filter((u) => !u.startsWith('data:'));
      if (parts.length === 0) return null;
      return parts[parts.length - 1] || parts[0];
    };

    const scoreCardImageCandidate = (url) => {
      if (!url || typeof url !== 'string') return -1;
      const u = url.trim();
      if (!u || u.startsWith('data:')) return -1;
      if (/placeholder|pixel|spacer|blank\.|data:image\/svg|\.svg(\?|$)/i.test(u)) return 0;
      if (/mlstatic|meli/i.test(u)) return 10;
      if (/^https?:\/\//i.test(u)) return 5;
      return 1;
    };

    const pickBest = (rawCandidates) => {
      let best = null;
      let bestScore = -1;
      for (const raw of rawCandidates) {
        if (typeof raw !== 'string' || !raw.trim()) continue;
        let value = raw.trim();
        if (value.startsWith('//')) value = `https:${value}`;
        else if (value.startsWith('/')) {
          try {
            value = new URL(value, location.origin).href;
          } catch {
            continue;
          }
        } else if (!/^https?:\/\//i.test(value)) {
          continue;
        }
        const score = scoreCardImageCandidate(value);
        if (score > bestScore) {
          bestScore = score;
          best = value;
        }
      }
      return bestScore > 0 ? best : null;
    };

    const collectImgCandidates = (root) => {
      const out = [];
      const imgs = Array.from(root.querySelectorAll('img'));
      for (const img of imgs) {
        out.push(img.getAttribute('src'));
        out.push(img.getAttribute('data-src'));
        out.push(firstUrlFromSrcset(img.getAttribute('data-srcset') || ''));
        out.push(firstUrlFromSrcset(img.getAttribute('srcset') || ''));
        out.push(img.currentSrc || null);
      }
      return out;
    };

    const cards = Array.from(document.querySelectorAll('a[href]'));
    return cards.map((anchor) => {
      const card = anchor.closest('article, li, div') ?? anchor.parentElement ?? anchor;
      const rawHref = anchor.getAttribute('href') || '';
      const href = rawHref.startsWith('http') ? rawHref : new URL(rawHref, location.origin).href;
      const image = pickBest(collectImgCandidates(card));
      const amounts = Array.from(card.querySelectorAll('.andes-money-amount'));
      const previous =
        card.querySelector('s .andes-money-amount__fraction')?.textContent ||
        card.querySelector('.andes-money-amount--previous .andes-money-amount__fraction')?.textContent ||
        card.querySelector('.ui-search-price__original-value .andes-money-amount__fraction')?.textContent ||
        '';
      const currentFraction =
        card.querySelector('[data-testid="price-part"]')?.textContent ||
        amounts.find((node) => !node.classList.contains('andes-money-amount--previous'))?.querySelector(
          '.andes-money-amount__fraction'
        )?.textContent ||
        card.querySelector('.andes-money-amount__fraction')?.textContent ||
        '';
      const currentCents =
        amounts
          .find((node) => !node.classList.contains('andes-money-amount--previous'))
          ?.querySelector('.andes-money-amount__cents')?.textContent ||
        card.querySelector('.andes-money-amount__cents')?.textContent ||
        '';
      const discountBadge =
        card.querySelector('.andes-money-amount__discount')?.textContent ||
        Array.from(card.querySelectorAll('span'))
          .map((node) => node.textContent || '')
          .find((text) => /\d{1,2}\s*%/.test(text) && /(off|dto|descuento|% )/i.test(text)) ||
        Array.from(card.querySelectorAll('span'))
          .map((node) => node.textContent || '')
          .find((text) => /^\s*\d{1,2}\s*%\s*$/.test(text)) ||
        '';
      const title =
        anchor.getAttribute('title') ||
        card.querySelector('h2, h3, .poly-component__title, .ui-search-item__title')?.textContent ||
        '';
      return {
        href,
        title,
        image,
        priceText: `${currentFraction}${currentCents ? `.${currentCents}` : ''}`,
        originalText: previous,
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
    imageUrl: normalizeAbsoluteImageUrl(extracted.image || candidate.image),
    discountPrice,
    originalPrice,
    soldText: extracted.soldText || '',
    pathname: extracted.pathname || '',
  };
}

/**
 * Cupo por seed. Preferimos amplitud sobre profundidad: con un cupo bajo el
 * ciclo alcanza a visitar muchas más superficies antes de llenar `maxItems`,
 * que es de donde sale la supply nueva. Un cupo alto agota la cuota en las dos
 * primeras seeds y el resto del registro no se visita nunca.
 */
export function perSeedCap({ maxItems, seedCount, explicitCap = null }) {
  if (Number.isFinite(explicitCap) && explicitCap > 0) return Math.trunc(explicitCap);
  const seeds = Math.max(1, seedCount);
  return Math.max(2, Math.ceil(maxItems / seeds));
}

/**
 * Resultado de UNA seed. `zero_results` no es un fallo: una superficie puede
 * existir y no tener ofertas con descuento suficiente en este momento.
 */
function emptySeedStat(seed) {
  return {
    id: seed.id,
    group: seed.group ?? null,
    category: seed.category ?? null,
    status: 'ok',
    rawLinks: 0,
    accepted: 0,
    shortlisted: 0,
    errorKind: null,
  };
}

function emptyQualityGateTelemetry() {
  return {
    cardsDiscovered: 0,
    shortlistSize: 0,
    pdpAttempts: 0,
    pdpSuccess: 0,
    pdpBlocked: 0,
    pdpFailed: 0,
    rejectedBadgeOnly: 0,
    rejectedInsufficientEvidence: 0,
    acceptedForIngest: 0,
  };
}

/**
 * Discovery V2:
 * cards → shortlist (badge = señal) → PDP limitado → gate evidencia → candidatos ingest.
 * El badge nominal YA NO basta para pending.
 */
export async function discoverMercadoLibreCandidates(page, options) {
  const {
    seeds,
    maxItems,
    minDiscountPercent,
    perSeedMax = null,
    pdpMax = null,
    shortlistMax = null,
  } = options;
  const seen = new Set();
  const seedStats = [];
  const softCap = perSeedCap({ maxItems, seedCount: seeds.length, explicitCap: perSeedMax });
  const qualityGate = emptyQualityGateTelemetry();
  const cardPool = [];

  // Fase 1: card discovery (barato). Badge solo shortlist.
  for (const seed of seeds) {
    if (cardPool.length >= Math.max(maxItems * 4, 40)) break;
    const stat = emptySeedStat(seed);
    seedStats.push(stat);
    let shortlistedFromSeed = 0;

    try {
      await page.goto(seed.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500).catch(() => {});
      await page.mouse.wheel(0, 2500).catch(() => {});
      await page.waitForTimeout(1200).catch(() => {});
      await page.mouse.wheel(0, 2500).catch(() => {});
      await page.waitForTimeout(800).catch(() => {});
      await hydrateCardImages(page);

      const cards = (await extractCards(page)).filter((card) => isProductLikeUrl(card.href));
      stat.rawLinks = cards.length;
      qualityGate.cardsDiscovered += cards.length;
      console.log(`[worker] seed=${seed.id} raw_links=${cards.length} mode=card_shortlist`);

      for (const card of cards) {
        if (shortlistedFromSeed >= softCap) break;
        const dedupeKey = canonicalizeUrl(card.href);
        if (!card.href || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const parsed = candidateFromCard(card, minDiscountPercent);
        if (!parsed.ok) {
          console.log(`[worker] shortlist_skip=${card.href} reason=${parsed.reason}`);
          continue;
        }
        cardPool.push({ ...parsed.candidate, seedId: seed.id });
        shortlistedFromSeed += 1;
        console.log(
          `[worker] shortlisted=${parsed.candidate.canonicalUrl} nominal=${parsed.candidate.nominalDiscountPercent}% source=${parsed.candidate.cardDiscountSource} seed=${seed.id}`
        );
      }

      stat.shortlisted = shortlistedFromSeed;
      if (cards.length === 0) stat.status = 'zero_results';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stat.status = 'failed';
      stat.errorKind = /timeout/i.test(message) ? 'timeout' : 'navigation';
      console.log(`[worker] seed=${seed.id} status=failed kind=${stat.errorKind}`);
    }
  }

  const shortlistCap =
    Number.isFinite(shortlistMax) && shortlistMax > 0
      ? Math.trunc(shortlistMax)
      : Math.max(maxItems * 2, maxItems);
  const shortlist = selectShortlist(cardPool, shortlistCap);
  qualityGate.shortlistSize = shortlist.length;

  const pdpBudget =
    Number.isFinite(pdpMax) && pdpMax > 0
      ? Math.trunc(pdpMax)
      : Math.min(Math.max(maxItems, 1), Math.max(shortlist.length, 1));

  const out = [];

  // Fase 2–3: PDP enrichment limitado + gate de evidencia.
  for (const cardCandidate of shortlist) {
    if (out.length >= maxItems) break;

    let working = { ...cardCandidate };
    let pdpOk = false;

    if (qualityGate.pdpAttempts < pdpBudget) {
      qualityGate.pdpAttempts += 1;
      try {
        const enriched = await enrichCandidate(page, {
          href: cardCandidate.href || cardCandidate.canonicalUrl || cardCandidate.url,
          title: cardCandidate.title,
          image: cardCandidate.imageUrl,
          priceText: String(cardCandidate.discountPrice ?? ''),
          originalText:
            cardCandidate.cardDiscountSource === 'card_strikethrough'
              ? String(cardCandidate.originalPrice ?? '')
              : '',
        });

        if (isPdpBlockedPath(enriched.pathname) || isPdpBlockedPath(enriched.url)) {
          qualityGate.pdpBlocked += 1;
          console.log(`[worker] pdp_blocked=${cardCandidate.canonicalUrl}`);
        } else if (!(enriched.discountPrice > 0)) {
          qualityGate.pdpFailed += 1;
          console.log(`[worker] pdp_no_price=${cardCandidate.canonicalUrl}`);
        } else {
          pdpOk = true;
          qualityGate.pdpSuccess += 1;
          const pdpOriginal =
            enriched.originalPrice != null &&
            enriched.originalPrice > enriched.discountPrice
              ? enriched.originalPrice
              : null;

          working = {
            ...working,
            url: enriched.canonicalUrl || working.canonicalUrl,
            canonicalUrl: enriched.canonicalUrl || working.canonicalUrl,
            title: enriched.title || working.title,
            imageUrl: enriched.imageUrl || working.imageUrl,
            discountPrice: enriched.discountPrice,
            evidenceSource: 'pdp',
            sourceDetail: 'worker:playwright:pdp',
          };

          if (pdpOriginal != null) {
            working.originalPrice = pdpOriginal;
            working.discountPercent = clampDiscountPercent(
              (1 - enriched.discountPrice / pdpOriginal) * 100
            );
            working.cardDiscountSource = 'pdp';
            working.originalFromBadgeOnly = false;
            working.signals = {
              ...working.signals,
              cardDiscountSource: 'pdp',
              currentPriceProvenance: 'source_explicit',
              originalPriceProvenance: 'source_explicit',
              discountPercentProvenance: 'derived',
            };
          } else if (working.cardDiscountSource === 'card_strikethrough') {
            // Conserva tachado de card; no inventa original desde badge.
            working.evidenceSource = 'pdp';
            working.signals = {
              ...working.signals,
              currentPriceProvenance: 'source_explicit',
            };
          } else {
            // PDP sin original y card era badge → no fabricar original.
            working.originalPrice = null;
            working.discountPercent = 0;
            working.originalFromBadgeOnly = true;
            working.cardDiscountSource = 'badge_reconstructed';
            working.signals = {
              ...working.signals,
              cardDiscountSource: 'badge_reconstructed',
              originalPriceProvenance: 'unknown',
              discountPercentProvenance: 'unknown',
            };
          }
        }
      } catch (error) {
        qualityGate.pdpFailed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[worker] pdp_error=${cardCandidate.canonicalUrl} msg=${message.slice(0, 120)}`);
      }
    }

    // Sin PDP: tachado de card puede seguir; badge solo no.
    if (!pdpOk) {
      if (working.cardDiscountSource === 'card_strikethrough') {
        working.evidenceSource = 'card_strikethrough';
      } else if (isBadgeReconstructedOriginal(working)) {
        qualityGate.rejectedBadgeOnly += 1;
        console.log(`[worker] reject_badge_only=${working.canonicalUrl}`);
        continue;
      } else {
        qualityGate.rejectedInsufficientEvidence += 1;
        continue;
      }
    }

    const gate = workerCandidateEligibleForIngest(working);
    if (!gate.ok) {
      if (gate.reason === 'badge_nominal_insufficient') qualityGate.rejectedBadgeOnly += 1;
      else qualityGate.rejectedInsufficientEvidence += 1;
      console.log(`[worker] reject_evidence=${working.canonicalUrl} reason=${gate.reason}`);
      continue;
    }

    // Payload limpio hacia Aventa (sin campos internos de shortlist).
    const rest = { ...working };
    delete rest.href;
    delete rest.originalFromBadgeOnly;
    delete rest.nominalDiscountPercent;
    delete rest.evidenceSource;

    out.push({
      ...rest,
      seedId: working.seedId,
      sourceDetail: working.sourceDetail || 'worker:playwright:card',
      signals: {
        ...(working.signals || {}),
        listingTypeId: 'worker_card',
        cardDiscountSource: working.cardDiscountSource,
        cardBadgePercent: working.cardBadgePercent ?? null,
      },
    });
    qualityGate.acceptedForIngest += 1;

    const seedStat = seedStats.find((s) => s.id === working.seedId);
    if (seedStat) seedStat.accepted += 1;

    console.log(
      `[worker] accepted_ingest=${working.canonicalUrl} evidence=${gate.reason} discount=${working.discountPercent}% source=${working.cardDiscountSource}`
    );
  }

  const discovery = {
    seedsAttempted: seedStats.length,
    seedsSuccessful: seedStats.filter((s) => s.status === 'ok').length,
    seedsZeroResults: seedStats.filter((s) => s.status === 'zero_results').length,
    seedsFailed: seedStats.filter((s) => s.status === 'failed').length,
    seedsAvailable: seeds.length,
    uniqueCandidates: out.length,
    perSeedCap: softCap,
    bySeed: seedStats,
    qualityGate,
    pdpBudget,
    shortlistCap,
  };

  console.log(`[worker] usable_candidates=${out.length}`);
  console.log(`[worker] discovery=${JSON.stringify(discovery)}`);
  return { candidates: out, discovery };
}

export {
  inferItemId,
  canonicalizeUrl,
  normalizeAbsoluteImageUrl,
  candidateFromCard,
  isProductLikeUrl,
  enrichCandidate,
  workerCandidateEligibleForIngest,
  isBadgeReconstructedOriginal,
};
