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
  extractMercadoLibreItemId,
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

function isMercadoLibreHost(hostname: string): boolean {
  const d = getDomain(hostname);
  return (
    d.includes('mercadolibre') ||
    d.includes('mercadolivre') ||
    d === 'meli.la' ||
    d.endsWith('.meli.la')
  );
}

function isAmazonHost(hostname: string): boolean {
  const d = getDomain(hostname);
  return d === 'amazon.com' || d === 'amazon.com.mx' || d.endsWith('.amazon.com') || d.endsWith('.amazon.com.mx');
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

async function fetchHtml(target: string): Promise<{ html: string; pageUrl: URL } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const pageUrl = res.url ? new URL(res.url) : new URL(target);
    return { html, pageUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
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

    const looksMl = isMercadoLibreHost(url.hostname) || Boolean(extractMercadoLibreItemId(rawUrl));

    const htmlPromise = fetchHtml(url.href);
    const mlPromise = looksMl ? fetchMercadoLibrePublicOffer(rawUrl).catch(() => null) : Promise.resolve(null);

    const [htmlResult, mlFirst] = await Promise.all([htmlPromise, mlPromise]);

    const html = htmlResult?.html ?? '';
    const pageUrl = htmlResult?.pageUrl ?? url;
    const base = pageUrl.origin + pageUrl.pathname;
    const isAmazon = isAmazonHost(pageUrl.hostname) || isAmazonHost(url.hostname);
    const isMercadoLibre = looksMl || isMercadoLibreHost(pageUrl.hostname);

    let data: { title: string | null; image: string | null; store: string | null } = {
      title: null,
      image: null,
      store: isMercadoLibre ? 'Mercado Libre' : isAmazon ? 'Amazon' : null,
    };
    let htmlImages: string[] = [];
    let breadcrumbs: string[] = [];

    if (html) {
      htmlImages = extractOfferImages(html, base);
      breadcrumbs = extractBreadcrumbs(html);
      if (isAmazon) data = parseAmazon(html, base);
      else if (isMercadoLibre) data = parseMercadoLibre(html, base);
      else data = parseGeneric(html, base);
    }

    let images = mergeImages(data.image, htmlImages);
    let mlCategoryId: string | null = null;
    let mlPathNames: string[] = [];
    const htmlPrices = html ? extractSuggestedPrices(html) : { discount: null, original: null };
    let suggestedDiscount: number | null = htmlPrices.discount;
    let suggestedOriginal: number | null = htmlPrices.original;

    let ml = mlFirst;
    if (isMercadoLibre && (!ml || ml.pictures.length < 2)) {
      const mlFromPage = await fetchMercadoLibrePublicOffer(pageUrl.href, html || null).catch(() => null);
      if (mlFromPage) ml = mlFromPage;
    }

    if (ml) {
      data = {
        title: ml.title || data.title,
        image: ml.pictures[0] || data.image,
        store: data.store || 'Mercado Libre',
      };
      images = mergeImages(ml.pictures[0] ?? data.image, [...ml.pictures, ...htmlImages]);
      mlCategoryId = ml.categoryId;
      mlPathNames = ml.pathNames;
      if (typeof ml.price === 'number' && ml.price > 0) suggestedDiscount = ml.price;
      if (typeof ml.originalPrice === 'number' && ml.originalPrice > 0) {
        suggestedOriginal = ml.originalPrice;
      }
    }

    if (
      suggestedOriginal != null &&
      suggestedDiscount != null &&
      suggestedOriginal < suggestedDiscount
    ) {
      const tmp = suggestedOriginal;
      suggestedOriginal = suggestedDiscount;
      suggestedDiscount = tmp;
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
      suggested_discount_price: suggestedDiscount,
      suggested_original_price: suggestedOriginal,
      suggested_category: suggestedCategory,
    });
  } catch {
    return NextResponse.json(emptyPayload());
  }
}
