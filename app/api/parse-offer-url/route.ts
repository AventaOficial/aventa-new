import { NextResponse } from 'next/server';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import { sanitizeOfferTitle } from '@/lib/sanitizeOfferTitle';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isBlockedOfferParseUrl } from '@/lib/server/fetchUrlSafety';
import { inferOfferCategory } from '@/lib/offers/inferOfferCategory';
import { fetchMercadoLibrePublicOffer } from '@/lib/offers/mlPublicOffer';
import {
  absoluteUrl,
  extractBreadcrumbs,
  extractOfferImages,
  extractSuggestedPrices,
  getById,
  getMetaContent,
} from '@/lib/offers/parseOfferPageHtml';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getDomain(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

function emptyPayload() {
  return {
    title: null as string | null,
    image: null as string | null,
    images: [] as string[],
    store: null as string | null,
    suggested_discount_price: null as number | null,
    suggested_original_price: null as number | null,
    suggested_category: null as string | null,
  };
}

function parseAmazon(html: string, base: string): { title: string | null; image: string | null; store: string } {
  const title = getMetaContent(html, 'og:title') || getById(html, 'productTitle', 'text') || null;
  const rawImage = getMetaContent(html, 'og:image') || getById(html, 'landingImage', 'src') || null;
  return {
    title: title && title.length > 0 ? title : null,
    image: absoluteUrl(base, rawImage),
    store: 'Amazon',
  };
}

function parseMercadoLibre(html: string, base: string): { title: string | null; image: string | null; store: string } {
  const title = getMetaContent(html, 'og:title') || null;
  const rawImage = getMetaContent(html, 'og:image') || null;
  return {
    title: title && title.length > 0 ? title : null,
    image: absoluteUrl(base, rawImage),
    store: 'Mercado Libre',
  };
}

function parseGeneric(html: string, base: string): { title: string | null; image: string | null; store: string | null } {
  const title = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title') || null;
  const rawImage = getMetaContent(html, 'og:image') || getMetaContent(html, 'twitter:image') || null;
  const store = getMetaContent(html, 'og:site_name') || getMetaContent(html, 'application-name') || null;
  return {
    title: title && title.length > 0 ? title : null,
    image: absoluteUrl(base, rawImage),
    store: store && store.length > 0 ? store : null,
  };
}

function mergeImages(primary: string | null, extras: string[]): string[] {
  const out: string[] = [];
  for (const u of [primary, ...extras]) {
    if (!u) continue;
    const key = u.split('?')[0];
    if (out.some((x) => x.split('?')[0] === key)) continue;
    out.push(u);
    if (out.length >= 8) break;
  }
  return out;
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
    if (!rawUrl) return NextResponse.json(emptyPayload());

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return NextResponse.json(emptyPayload());
    }
    if (!['http:', 'https:'].includes(url.protocol)) return NextResponse.json(emptyPayload());

    const block = isBlockedOfferParseUrl(url);
    if (block.blocked) {
      return NextResponse.json({ error: block.reason ?? 'URL no permitida' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    if (!res.ok) return NextResponse.json(emptyPayload());

    const html = await res.text();
    const pageUrl = res.url ? new URL(res.url) : url;
    const base = pageUrl.origin + pageUrl.pathname;
    const domain = getDomain(pageUrl.hostname);
    const prices = extractSuggestedPrices(html);
    const htmlImages = extractOfferImages(html, base);
    const breadcrumbs = extractBreadcrumbs(html);

    const isAmazon =
      domain === 'amazon.com' ||
      domain === 'amazon.com.mx' ||
      domain.endsWith('.amazon.com') ||
      domain.endsWith('.amazon.com.mx');
    const isMercadoLibre =
      domain === 'mercadolibre.com' ||
      domain === 'mercadolibre.com.mx' ||
      domain.endsWith('.mercadolibre.com') ||
      domain.endsWith('.mercadolibre.com.mx') ||
      domain === 'meli.la' ||
      domain.endsWith('.meli.la');

    let data: { title: string | null; image: string | null; store: string | null };
    if (isAmazon) data = parseAmazon(html, base);
    else if (isMercadoLibre) data = parseMercadoLibre(html, base);
    else data = parseGeneric(html, base);

    let discount = prices.discount;
    let original = prices.original;
    let images = mergeImages(data.image, htmlImages);
    let mlCategoryId: string | null = null;
    let mlPathNames: string[] = [];

    if (isMercadoLibre) {
      const ml = await fetchMercadoLibrePublicOffer(pageUrl.href).catch(() => null);
      const mlFromRaw = ml ?? (await fetchMercadoLibrePublicOffer(rawUrl).catch(() => null));
      if (mlFromRaw) {
        data = {
          title: data.title || mlFromRaw.title,
          image: data.image || mlFromRaw.pictures[0] || null,
          store: data.store || 'Mercado Libre',
        };
        discount = discount ?? mlFromRaw.price;
        original = original ?? mlFromRaw.originalPrice;
        images = mergeImages(data.image, [...mlFromRaw.pictures, ...htmlImages]);
        mlCategoryId = mlFromRaw.categoryId;
        mlPathNames = mlFromRaw.pathNames;
      }
    }

    const suggestedCategory = inferOfferCategory({
      title: data.title,
      breadcrumbs,
      mlCategoryId,
      mlPathNames,
    });

    return NextResponse.json({
      title: sanitizeOfferTitle(data.title),
      image: images[0] ?? data.image,
      images,
      store: data.store ?? inferStoreFromHostname(pageUrl.hostname),
      suggested_discount_price: discount,
      suggested_original_price: original,
      suggested_category: suggestedCategory,
    });
  } catch {
    return NextResponse.json(emptyPayload());
  }
}
