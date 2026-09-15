/**
 * Extractor canónico de evidencia PDP Mercado Libre (HTML string → campos tipados).
 * Sin red. Sin inventar precios. Prioridad: structured → DOM semántico → fallbacks.
 */

/**
 * @typedef {{ value: number, currency: string, source: string }} PricedField
 * @typedef {{
 *   ok: boolean,
 *   incomplete: boolean,
 *   blocked: boolean,
 *   reason: string | null,
 *   title: string | null,
 *   price: PricedField | null,
 *   originalPrice: PricedField | null,
 *   imageUrl: string | null,
 *   canonicalUrl: string | null,
 *   merchant: string,
 *   productId: string | null,
 *   currency: string | null,
 *   availability: string | null,
 *   evidence: string[],
 *   source: string,
 * }} MercadoLibrePdpEvidence
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** Locale-aware: MX miles con punto (1.299 → 1299). */
export function parsePositiveLocalizedNumber(raw) {
  if (!raw || !String(raw).trim()) return null;
  const clean = String(raw).replace(/[^\d,.-]/g, '').trim();
  if (!clean || clean === '.' || clean === ',') return null;
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
  } else if (hasDot && !hasComma) {
    const parts = clean.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = clean;
    } else if (parts.length >= 2 && parts.slice(1).every((p) => p.length === 3)) {
      normalized = clean.replace(/\./g, '');
    } else {
      normalized = clean;
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

function parseMoneyParts(fraction, cents) {
  const f = normalizeText(fraction || '');
  const c = normalizeText(cents || '');
  if (!f) return null;
  if (!c) return parsePositiveLocalizedNumber(f);
  // Fracción MX ya puede traer miles; si hay cents, no reinterpretar puntos de miles.
  const fracNum = parsePositiveLocalizedNumber(f);
  const centsNum = Number.parseInt(c.replace(/\D/g, ''), 10);
  if (fracNum == null) return null;
  if (!Number.isFinite(centsNum) || centsNum < 0) return fracNum;
  // Si frac ya tiene decimales, ignorar cents DOM.
  if (!Number.isInteger(fracNum)) return fracNum;
  return Number((fracNum + centsNum / 100).toFixed(2));
}

function getMetaContent(html, property) {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    html.match(
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`,
        'i',
      ),
    )?.[1] ??
    html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`,
        'i',
      ),
    )?.[1] ??
    null
  );
}

function collectLdJson(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] || '').trim();
    if (!raw || raw.length > 500000) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
  return out;
}

function walkLd(node, visit) {
  const stack = Array.isArray(node) ? [...node] : [node];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      stack.push(...cur);
      continue;
    }
    const typeRaw = cur['@type'];
    const typeStr = Array.isArray(typeRaw)
      ? typeRaw.map(String).join(',')
      : String(typeRaw || '');
    visit(cur, typeStr);
    if (cur['@graph']) stack.push(cur['@graph']);
    if (cur.offers) stack.push(cur.offers);
  }
}

function inferProductId(url, html) {
  const fromHtml =
    html.match(/["'](?:item_id|itemId)["']\s*:\s*["'](ML[A-Z]{0,3}-?\d+)["']/i)?.[1] ??
    html.match(/\/((?:ML[A-Z]{1,3})-?\d{6,})/i)?.[1] ??
    null;
  if (fromHtml) return fromHtml.replace(/-/g, '').toUpperCase();
  try {
    const u = new URL(url);
    const wid = u.searchParams.get('wid') || u.searchParams.get('item_id');
    if (wid) return wid.replace(/-/g, '').toUpperCase();
    const path = u.pathname.match(/\/((?:ML|M[A-Z]{1,5})\d+)(?:[/?#-]|$)/i)?.[1];
    if (path) return path.replace(/-/g, '').toUpperCase();
    const articulo = u.pathname.match(/\/(ML[A-Z]{0,3})-(\d+)/i);
    if (articulo) return `${articulo[1]}${articulo[2]}`.toUpperCase();
  } catch {
    /* ignore */
  }
  return null;
}

function isBlockedHtml(html, url) {
  const href = String(url || '');
  if (/account-verification/i.test(href)) return true;
  if (/\/gz\//i.test(href) && /account-verification|webdevice|security/i.test(href)) return true;
  if (/account-verification-main/i.test(html)) return true;
  if (/suspicious-traffic-frontend/i.test(html)) return true;
  if (/"isBot"\s*:\s*true/i.test(html) && /account-verification/i.test(html)) return true;
  return false;
}

function priced(value, currency, source) {
  if (value == null || !(value > 0)) return null;
  return { value, currency: currency || 'MXN', source };
}

/**
 * @param {string} html
 * @param {{ url?: string | null }} [opts]
 * @returns {MercadoLibrePdpEvidence}
 */
export function extractMercadoLibrePdpEvidence(html, opts = {}) {
  const pageUrl = opts.url || '';
  const evidence = [];
  const blocked = isBlockedHtml(html || '', pageUrl);

  const empty = (reason) => ({
    ok: false,
    incomplete: true,
    blocked,
    reason,
    title: null,
    price: null,
    originalPrice: null,
    imageUrl: null,
    canonicalUrl: pageUrl || null,
    merchant: 'Mercado Libre',
    productId: inferProductId(pageUrl, html || ''),
    currency: null,
    availability: null,
    evidence: [...evidence],
    source: 'ml_pdp_html',
  });

  if (!html || typeof html !== 'string' || html.length < 40) {
    return empty('empty_html');
  }

  if (blocked) {
    evidence.push('blocked:account_verification');
    return empty('pdp_blocked');
  }

  let discount = null;
  let discountSource = null;
  let original = null;
  let originalSource = null;
  let currency = getMetaContent(html, 'product:price:currency') || 'MXN';

  // 1) Structured: meta
  const metaPrice = parsePositiveLocalizedNumber(getMetaContent(html, 'product:price:amount'));
  const metaOgPrice = parsePositiveLocalizedNumber(getMetaContent(html, 'og:price:amount'));
  const metaOriginal = parsePositiveLocalizedNumber(
    getMetaContent(html, 'product:original_price:amount'),
  );
  if (metaPrice != null) {
    discount = metaPrice;
    discountSource = 'meta:product:price:amount';
    evidence.push('meta_price');
  } else if (metaOgPrice != null) {
    discount = metaOgPrice;
    discountSource = 'meta:og:price:amount';
    evidence.push('og_price');
  }
  if (metaOriginal != null) {
    original = metaOriginal;
    originalSource = 'meta:product:original_price:amount';
    evidence.push('meta_original');
  }

  // 2) JSON-LD Offer / AggregateOffer
  for (const parsed of collectLdJson(html)) {
    walkLd(parsed, (o, typeStr) => {
      if (!typeStr.includes('Offer') && !typeStr.includes('AggregateOffer') && !typeStr.includes('Product')) {
        return;
      }
      if (o.priceCurrency && typeof o.priceCurrency === 'string') {
        currency = o.priceCurrency;
      }
      const low =
        typeof o.lowPrice === 'number'
          ? o.lowPrice
          : parsePositiveLocalizedNumber(String(o.lowPrice ?? ''));
      const high =
        typeof o.highPrice === 'number'
          ? o.highPrice
          : parsePositiveLocalizedNumber(String(o.highPrice ?? ''));
      const p =
        typeof o.price === 'number'
          ? o.price
          : parsePositiveLocalizedNumber(String(o.price ?? ''));
      if (discount == null && low != null && low > 0) {
        discount = low;
        discountSource = 'json_ld:lowPrice';
        evidence.push('ld_lowPrice');
      }
      if (discount == null && p != null && p > 0) {
        discount = p;
        discountSource = 'json_ld:price';
        evidence.push('ld_price');
      }
      if (original == null && high != null && high > 0) {
        original = high;
        originalSource = 'json_ld:highPrice';
        evidence.push('ld_highPrice');
      }
    });
  }

  // 3) Embedded MXN JSON (preloaded state / item payload)
  if (discount == null) {
    const mxn = html.match(/"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*"currency_id"\s*:\s*"MXN"/i)?.[1];
    const v = parsePositiveLocalizedNumber(mxn);
    if (v != null) {
      discount = v;
      discountSource = 'embedded:price_currency_id_MXN';
      evidence.push('embedded_mxn_price');
    }
  }
  if (original == null) {
    const mxnOrig = html.match(/"original_price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1];
    const v = parsePositiveLocalizedNumber(mxnOrig);
    if (v != null) {
      original = v;
      originalSource = 'embedded:original_price';
      evidence.push('embedded_original');
    }
  }

  // 4) DOM andes-money-amount (previous vs current)
  const previousFraction = html.match(
    /andes-money-amount--previous[\s\S]{0,500}?andes-money-amount__fraction[^>]*>([0-9.]+)/i,
  )?.[1];
  const previousCents = html.match(
    /andes-money-amount--previous[\s\S]{0,500}?andes-money-amount__cents[^>]*>([0-9]+)/i,
  )?.[1];
  // Prefer second-line / main container current (not previous)
  const currentBlock =
    html.match(
      /ui-pdp-price__second-line[\s\S]{0,400}?andes-money-amount__fraction[^>]*>([0-9.]+)[\s\S]{0,120}?andes-money-amount__cents[^>]*>([0-9]+)/i,
    ) ||
    html.match(
      /ui-pdp-price__main-container[\s\S]{0,400}?andes-money-amount__fraction[^>]*>([0-9.]+)[\s\S]{0,120}?andes-money-amount__cents[^>]*>([0-9]+)/i,
    );
  const currentFraction =
    currentBlock?.[1] ||
    html.match(
      /ui-pdp-price__second-line[\s\S]{0,300}?andes-money-amount__fraction[^>]*>([0-9.]+)/i,
    )?.[1] ||
    html.match(/data-testid=["']price-part["'][^>]*>([0-9.]+)/i)?.[1] ||
    html.match(/andes-money-amount__fraction[^>]*>([0-9.]+)/i)?.[1];
  const currentCents =
    currentBlock?.[2] ||
    html.match(
      /ui-pdp-price__second-line[\s\S]{0,300}?andes-money-amount__cents[^>]*>([0-9]+)/i,
    )?.[1];

  const domCurrent = parseMoneyParts(currentFraction, currentCents);
  const domOriginal =
    parseMoneyParts(previousFraction, previousCents) ||
    parsePositiveLocalizedNumber(
      html.match(
        /ui-pdp-price__original-value[\s\S]{0,200}?andes-money-amount__fraction[^>]*>([0-9.]+)/i,
      )?.[1],
    );

  if (discount == null && domCurrent != null) {
    discount = domCurrent;
    discountSource = 'dom:andes-money-amount';
    evidence.push('dom_current');
  }
  if (original == null && domOriginal != null) {
    original = domOriginal;
    originalSource = 'dom:andes-money-amount--previous';
    evidence.push('dom_original');
  }

  // itemprop fallback
  if (discount == null) {
    const itemprop = parsePositiveLocalizedNumber(
      html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1],
    );
    if (itemprop != null) {
      discount = itemprop;
      discountSource = 'itemprop:price';
      evidence.push('itemprop_price');
    }
  }

  // Sanity: swap / drop equal
  if (original != null && discount != null && original < discount) {
    const tmp = original;
    original = discount;
    discount = tmp;
    const tmpSrc = originalSource;
    originalSource = discountSource;
    discountSource = tmpSrc;
  }
  if (original != null && discount != null && original === discount) {
    original = null;
    originalSource = null;
  }

  // Unexpected currency → incomplete (do not invent MXN conversion)
  if (currency && !/^MXN$/i.test(currency) && discount != null) {
    evidence.push(`unexpected_currency:${currency}`);
    return {
      ...empty('unexpected_currency'),
      currency,
      evidence: [...evidence],
      price: priced(discount, currency, discountSource || 'unknown'),
      originalPrice: priced(original, currency, originalSource || 'unknown'),
    };
  }

  const title =
    normalizeText(getMetaContent(html, 'og:title')) ||
    normalizeText(html.match(/<h1[^>]*class=["'][^"']*ui-pdp-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]) ||
    normalizeText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) ||
    null;

  const imageUrl =
    getMetaContent(html, 'og:image') ||
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    null;

  const availability =
    html.match(/"availability"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/itemprop=["']availability["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    null;

  if (discount == null) {
    return empty('sin_discount_price');
  }

  const incomplete = original == null || !(original > discount) || !title;

  return {
    ok: true,
    incomplete,
    blocked: false,
    reason: incomplete ? 'incomplete_evidence' : null,
    title,
    price: priced(discount, currency, discountSource || 'unknown'),
    originalPrice: priced(original, currency, originalSource || 'unknown'),
    imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : null,
    canonicalUrl: pageUrl || null,
    merchant: 'Mercado Libre',
    productId: inferProductId(pageUrl, html),
    currency,
    availability,
    evidence,
    source: 'ml_pdp_html',
  };
}

export function pdpEvidenceToEnrichmentFields(ev) {
  if (!ev || !ev.price?.value) {
    return {
      discountPrice: null,
      originalPrice: null,
      title: '',
      imageUrl: '',
      blocked: Boolean(ev?.blocked),
      reason: ev?.reason || 'sin_discount_price',
      evidenceSources: ev?.evidence || [],
    };
  }
  const original =
    ev.originalPrice?.value != null && ev.originalPrice.value > ev.price.value
      ? ev.originalPrice.value
      : null;
  return {
    discountPrice: ev.price.value,
    originalPrice: original,
    title: ev.title || '',
    imageUrl: ev.imageUrl || '',
    blocked: false,
    reason: ev.incomplete ? 'incomplete_evidence' : null,
    evidenceSources: ev.evidence || [],
    priceSource: ev.price.source,
    originalPriceSource: ev.originalPrice?.source || null,
    currency: ev.currency,
    productId: ev.productId,
  };
}
