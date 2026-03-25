import { NextResponse } from 'next/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isBlockedOfferParseUrl } from '@/lib/server/fetchUrlSafety';

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; AVENTA-Bot/1.0; +https://aventaofertas.com)';

function getDomain(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

function getMetaContent(html: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyMatch = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      'i'
    )
  );
  if (propertyMatch) return propertyMatch[1].trim() || null;
  const contentFirstMatch = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      'i'
    )
  );
  return contentFirstMatch ? contentFirstMatch[1].trim() || null : null;
}

function getById(html: string, id: string, attr: 'content' | 'src' | 'text'): string | null {
  const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (attr === 'text') {
    const m = html.match(new RegExp(`<[^>]+id=["']${idEsc}["'][^>]*>([\\s\\S]*?)<\\/`, 'i'));
    return m ? m[1].replace(/<[^>]+>/g, '').trim() || null : null;
  }
  const m = html.match(
    new RegExp(`<[^>]+id=["']${idEsc}["'][^>]+${attr}=["']([^"']*)["']`, 'i')
  );
  if (m) return m[1].trim() || null;
  const m2 = html.match(
    new RegExp(`<[^>]+${attr}=["']([^"']*)["'][^>]+id=["']${idEsc}["']`, 'i')
  );
  return m2 ? m2[1].trim() || null : null;
}

function absoluteUrl(base: string, path: string | null): string | null {
  if (!path || !path.trim()) return null;
  const trimmed = path.trim();
  let href: string;
  if (/^https?:\/\//i.test(trimmed)) href = trimmed;
  else {
    try {
      href = new URL(trimmed, base).href;
    } catch {
      return null;
    }
  }
  try {
    const u = new URL(href);
    if (isBlockedOfferParseUrl(u).blocked) return null;
    return u.href;
  } catch {
    return null;
  }
}

function parseAmazon(html: string, base: string): { title: string | null; image: string | null; store: string } {
  const title =
    getMetaContent(html, 'og:title') ||
    getById(html, 'productTitle', 'text') ||
    null;
  const rawImage =
    getMetaContent(html, 'og:image') ||
    getById(html, 'landingImage', 'src') ||
    null;
  const image = absoluteUrl(base, rawImage);
  return {
    title: title && title.length > 0 ? title : null,
    image,
    store: 'Amazon',
  };
}

function parseMercadoLibre(html: string, base: string): { title: string | null; image: string | null; store: string } {
  const title = getMetaContent(html, 'og:title') || null;
  const rawImage = getMetaContent(html, 'og:image') || null;
  const image = absoluteUrl(base, rawImage);
  return {
    title: title && title.length > 0 ? title : null,
    image,
    store: 'Mercado Libre',
  };
}

function parsePositiveNumber(raw: string | null | undefined): number | null {
  if (!raw || !String(raw).trim()) return null;
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type ExtractedPrices = { discount: number | null; original: number | null };

/** Heurística: meta og:price, JSON-LD Offer / AggregateOffer (ML, muchas tiendas). */
function extractSuggestedPrices(html: string): ExtractedPrices {
  let discount: number | null = parsePositiveNumber(getMetaContent(html, 'og:price:amount'));
  let original: number | null = parsePositiveNumber(getMetaContent(html, 'product:original_price:amount'));

  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.length > 500_000) continue;
    try {
      const parsed = JSON.parse(raw);
      scanLdJson(parsed);
    } catch {
      // JSON inválido o fragmentado
    }
  }

  function considerOffer(off: Record<string, unknown>) {
    const low = off.lowPrice;
    const high = off.highPrice;
    if (typeof low === 'number' && low > 0) discount = discount ?? low;
    else if (typeof low === 'string') {
      const n = parsePositiveNumber(low);
      if (n) discount = discount ?? n;
    }
    const p = off.price;
    if (typeof p === 'number' && p > 0) discount = discount ?? p;
    else if (typeof p === 'string') {
      const n = parsePositiveNumber(p);
      if (n) discount = discount ?? n;
    }
    if (typeof high === 'number' && high > 0) original = original ?? high;
    else if (typeof high === 'string') {
      const n = parsePositiveNumber(high);
      if (n) original = original ?? n;
    }
  }

  function scanLdJson(node: unknown) {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach(scanLdJson);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (o['@graph']) scanLdJson(o['@graph']);

    const types = o['@type'];
    const typeStr = Array.isArray(types) ? types.map(String).join(',') : String(types ?? '');

    if (typeStr.includes('AggregateOffer')) {
      considerOffer(o);
    }
    if (typeStr.includes('Offer')) {
      considerOffer(o);
    }
    if (typeStr.includes('Product') && o.offers) {
      scanLdJson(o.offers);
    }
  }

  return { discount, original };
}

function pricePayload(p: ExtractedPrices) {
  return {
    suggested_discount_price: p.discount,
    suggested_original_price: p.original,
  };
}

function parseGeneric(html: string, base: string): { title: string | null; image: string | null; store: string | null } {
  const title =
    getMetaContent(html, 'og:title') ||
    getMetaContent(html, 'twitter:title') ||
    null;
  const rawImage =
    getMetaContent(html, 'og:image') ||
    getMetaContent(html, 'twitter:image') ||
    null;
  const image = absoluteUrl(base, rawImage);
  const store =
    getMetaContent(html, 'og:site_name') ||
    getMetaContent(html, 'application-name') ||
    null;
  return {
    title: title && title.length > 0 ? title : null,
    image,
    store: store && store.length > 0 ? store : null,
  };
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = await enforceRateLimitCustom(ip, 'parseOffer');
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un momento.' }, { status: 429 });
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: 'Inicia sesión para analizar enlaces' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'Configuración inválida' }, { status: 500 });
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!rawUrl) {
      return NextResponse.json({
        title: null,
        image: null,
        store: null,
      });
    }

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return NextResponse.json({
        title: null,
        image: null,
        store: null,
      });
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      return NextResponse.json({
        title: null,
        image: null,
        store: null,
      });
    }

    const block = isBlockedOfferParseUrl(url);
    if (block.blocked) {
      return NextResponse.json(
        { error: block.reason ?? 'URL no permitida' },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({
        title: null,
        image: null,
        store: null,
      });
    }

    const html = await res.text();
    const base = url.origin + url.pathname;
    const domain = getDomain(url.hostname);
    const prices = extractSuggestedPrices(html);

    const isAmazon =
      domain === 'amazon.com' ||
      domain === 'amazon.com.mx' ||
      domain.endsWith('.amazon.com') ||
      domain.endsWith('.amazon.com.mx');
    if (isAmazon) {
      const data = parseAmazon(html, base);
      return NextResponse.json({ ...data, ...pricePayload(prices) });
    }

    const isMercadoLibre =
      domain === 'mercadolibre.com' ||
      domain === 'mercadolibre.com.mx' ||
      domain.endsWith('.mercadolibre.com') ||
      domain.endsWith('.mercadolibre.com.mx');
    if (isMercadoLibre) {
      const data = parseMercadoLibre(html, base);
      return NextResponse.json({ ...data, ...pricePayload(prices) });
    }

    const data = parseGeneric(html, base);
    return NextResponse.json({ ...data, ...pricePayload(prices) });
  } catch {
    return NextResponse.json({
      title: null,
      image: null,
      store: null,
    });
  }
}
