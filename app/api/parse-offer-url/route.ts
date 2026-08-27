import { NextResponse } from 'next/server';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import { sanitizeOfferTitle } from '@/lib/sanitizeOfferTitle';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isBlockedOfferParseUrl } from '@/lib/server/fetchUrlSafety';
import { inferOfferCategory } from '@/lib/offers/inferOfferCategory';
import { fetchMercadoLibrePublicOffer } from '@/lib/offers/mlPublicOffer';
import {
  normalizePastedOfferUrl,
  resolveMercadoLibreShortlinks,
  resolveAmazonShortlinks,
} from '@/lib/offerUrl';
import {
  isOfferAmazonHost,
  isOfferMeliLaHost,
  isOfferMercadoLibreHost,
  offerStoreLabelFromFlags,
  resolveOfferStoreFlags,
} from '@/lib/offers/detectOfferStore';
import {
  absoluteUrl,
  extractBreadcrumbs,
  extractMercadoLibreItemId,
  extractMercadoLibreStructuredPrices,
  extractOfferImages,
  extractSuggestedPrices,
  getById,
  getMetaContent,
  stripOfferTrackingParams,
} from '@/lib/offers/parseOfferPageHtml';
import { selectOfferImages, OFFER_IMAGE_CANDIDATE_CAP } from '@/lib/offers/selectOfferImages';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function emptyPayload(reason: 'invalid_url' | 'extract_failed' | null = null) {
  return {
    title: null as string | null,
    image: null as string | null,
    images: [] as string[],
    store: null as string | null,
    suggested_discount_price: null as number | null,
    suggested_original_price: null as number | null,
    suggested_category: null as string | null,
    reason,
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

function collectCandidates(primary: string | null, extras: string[]): string[] {
  const out: string[] = [];
  for (const u of [primary, ...extras]) {
    if (!u) continue;
    out.push(u);
    if (out.length >= OFFER_IMAGE_CANDIDATE_CAP) break;
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
    const rawUrl = normalizePastedOfferUrl(typeof body?.url === 'string' ? body.url : '');
    if (!rawUrl) return NextResponse.json(emptyPayload('invalid_url'));

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return NextResponse.json(emptyPayload('invalid_url'));
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      return NextResponse.json(emptyPayload('invalid_url'));
    }

    const block = isBlockedOfferParseUrl(url);
    if (block.blocked) {
      return NextResponse.json(
        { ...emptyPayload('invalid_url'), error: 'Este enlace no se puede usar. Revisa que sea una URL de tienda válida.' },
        { status: 400 },
      );
    }

    // Tracking fuera; params funcionales (wid, item_id, pdp_filters) se conservan.
    let workingHref = stripOfferTrackingParams(url.href);
    const wasMeliLa = isOfferMeliLaHost(url.hostname);
    const wasAmazonShort =
      isOfferAmazonHost(url.hostname) && !url.hostname.toLowerCase().includes('amazon.');

    if (wasMeliLa) {
      workingHref = await resolveMercadoLibreShortlinks(workingHref);
    }
    if (wasAmazonShort) {
      workingHref = await resolveAmazonShortlinks(workingHref);
    }

    let workingUrl: URL;
    try {
      workingUrl = new URL(workingHref);
    } catch {
      workingUrl = url;
      workingHref = url.href;
    }

    // Hostname-first: NO usar extractMercadoLibreItemId en hosts no-ML.
    const inputIsMl = isOfferMercadoLibreHost(url.hostname) || isOfferMercadoLibreHost(workingUrl.hostname);
    const mlIdOnMlHost = inputIsMl ? extractMercadoLibreItemId(workingHref) : null;

    const htmlPromise = fetchHtml(workingHref);
    const mlPromise =
      inputIsMl && mlIdOnMlHost
        ? fetchMercadoLibrePublicOffer(workingHref).catch(() => null)
        : Promise.resolve(null);

    const [htmlResult, mlFirst] = await Promise.all([htmlPromise, mlPromise]);

    const html = htmlResult?.html ?? '';
    const pageUrl = htmlResult?.pageUrl ?? workingUrl;
    const base = pageUrl.origin + pageUrl.pathname;
    const flags = resolveOfferStoreFlags(url.hostname, pageUrl.hostname);
    const { isAmazon, isMercadoLibre } = flags;
    const storeFromHost = offerStoreLabelFromFlags(flags);

    if (wasMeliLa && isOfferMeliLaHost(pageUrl.hostname) && !extractMercadoLibreItemId(pageUrl.href) && !html) {
      return NextResponse.json({
        ...emptyPayload('extract_failed'),
        store: 'Mercado Libre',
        error:
          'No pudimos abrir este enlace corto de Mercado Libre. Pega la URL completa del producto (mercadolibre.com.mx/…) y vuelve a intentar.',
      });
    }

    let data: { title: string | null; image: string | null; store: string | null } = {
      title: null,
      image: null,
      store: storeFromHost,
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

    let candidates = collectCandidates(data.image, htmlImages);
    let mlCategoryId: string | null = null;
    let mlPathNames: string[] = [];
    let suggestedDiscount: number | null = null;
    let suggestedOriginal: number | null = null;

    if (html && isAmazon) {
      const amazonPrices = extractSuggestedPrices(html);
      suggestedDiscount = amazonPrices.discount;
      suggestedOriginal = amazonPrices.original;
    }

    let ml = mlFirst;
    if (isMercadoLibre && (!ml || ml.pictures.length < 2)) {
      const mlFromPage = await fetchMercadoLibrePublicOffer(pageUrl.href, html || null).catch(() => null);
      if (mlFromPage) ml = mlFromPage;
    }

    // API ML autenticada = fuente de verdad para precio/título/imágenes/categoría.
    if (ml && isMercadoLibre) {
      data = {
        title: ml.title || data.title,
        image: ml.pictures[0] || data.image,
        store: 'Mercado Libre',
      };
      candidates = collectCandidates(ml.pictures[0] ?? data.image, [...ml.pictures, ...htmlImages]);
      mlCategoryId = ml.categoryId;
      mlPathNames = ml.pathNames;
      if (ml.source === 'ml_api') {
        if (typeof ml.price === 'number' && ml.price > 0) suggestedDiscount = ml.price;
        if (typeof ml.originalPrice === 'number' && ml.originalPrice > 0) {
          suggestedOriginal = ml.originalPrice;
        } else {
          suggestedOriginal = null;
        }
      }
    }

    if (isMercadoLibre && html && (suggestedDiscount == null || suggestedOriginal == null)) {
      const structured = extractMercadoLibreStructuredPrices(html);
      if (suggestedDiscount == null) {
        suggestedDiscount =
          structured.discount ??
          (typeof ml?.price === 'number' && ml.price > 0 ? ml.price : null);
      }
      if (suggestedOriginal == null) {
        suggestedOriginal =
          structured.original ??
          (typeof ml?.originalPrice === 'number' && ml.originalPrice > 0 ? ml.originalPrice : null);
      }
    }

    if (html && !isAmazon && !isMercadoLibre) {
      const genericPrices = extractSuggestedPrices(html);
      suggestedDiscount = genericPrices.discount;
      suggestedOriginal = genericPrices.original;
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
    if (suggestedOriginal != null && suggestedDiscount != null && suggestedOriginal === suggestedDiscount) {
      suggestedOriginal = null;
    }

    const suggestedCategory = inferOfferCategory({
      title: data.title,
      breadcrumbs,
      mlCategoryId,
      mlPathNames,
    });

    const preferredCover = (isMercadoLibre ? ml?.pictures[0] : null) || data.image;
    const images = selectOfferImages(candidates, { preferredCover });
    const title = sanitizeOfferTitle(data.title);
    const store =
      data.store ??
      storeFromHost ??
      inferStoreFromHostname(pageUrl.hostname);
    const extracted = Boolean(title) || images.length > 0 || suggestedDiscount != null;

    if (wasMeliLa && !extracted && isMercadoLibre) {
      return NextResponse.json({
        ...emptyPayload('extract_failed'),
        store: 'Mercado Libre',
        error:
          'No pudimos obtener el producto desde este enlace corto. Pega la URL completa de Mercado Libre y puedes completar los datos a mano.',
      });
    }

    return NextResponse.json({
      title,
      image: images[0] ?? null,
      images,
      store,
      suggested_discount_price: suggestedDiscount,
      suggested_original_price: suggestedOriginal,
      suggested_category: suggestedCategory,
      reason: extracted ? null : 'extract_failed',
    });
  } catch {
    return NextResponse.json(emptyPayload('extract_failed'));
  }
}
