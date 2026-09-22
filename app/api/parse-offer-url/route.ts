import { NextResponse } from 'next/server';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import { sanitizeOfferTitle } from '@/lib/sanitizeOfferTitle';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import {
  assertSafeOfferFetchUrl,
  fetchFollowingRedirectsSafely,
} from '@/lib/server/fetchUrlSafety';
import { inferOfferCategory } from '@/lib/offers/inferOfferCategory';
import {
  fetchMercadoLibrePublicOffer,
  mergeMercadoLibrePublicOffers,
} from '@/lib/offers/mlPublicOffer';
import {
  normalizePastedOfferUrl,
} from '@/lib/offerUrl';
import { resolveOfferUrl } from '@/lib/offers/urlResolution';
import {
  isAmazonExpandableHost,
  isOfferMeliLaHost,
  isOfferMercadoLibreHost,
  offerStoreLabelFromFlags,
  resolveOfferStoreFlags,
} from '@/lib/offers/detectOfferStore';
import {
  absoluteUrl,
  extractBreadcrumbs,
  extractMercadoLibreProductScopedImages,
  extractMercadoLibreDomPrices,
  extractMercadoLibreStructuredPrices,
  extractOfferImages,
  extractOfferMetaImages,
  extractSuggestedPrices,
  getById,
  getMetaContent,
  stripOfferTrackingParams,
} from '@/lib/offers/parseOfferPageHtml';
import { extractWalmartProduct } from '@/lib/offers/productExtraction/walmartExtract';
import { extractLiverpoolProduct } from '@/lib/offers/productExtraction/liverpoolExtract';
import { extractCoppelProduct } from '@/lib/offers/productExtraction/coppelExtract';
import { extractElektraProduct } from '@/lib/offers/productExtraction/elektraExtract';
import {
  classifyOfferExtraction,
  type OfferExtractionStatus,
} from '@/lib/offers/productExtraction/classifyExtraction';
import {
  extractMercadoLibreItemId,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';
import {
  isPlatformAffiliateTagged,
  storeHasAffiliateProgram,
} from '@/lib/affiliate/assessOfferAffiliateLink';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';
import { recordMlQuality } from '@/lib/hunter/mlQuality/metrics';
import { selectOfferImages, OFFER_IMAGE_CANDIDATE_CAP } from '@/lib/offers/selectOfferImages';
import { mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';
import { enrichRetailOfferFromHtml } from '@/lib/offers/enrichRetailOfferFromHtml';
import {
  amazonHtmlScrapeUrl,
  isAmazonBotWallHtml,
} from '@/lib/offers/amazonProductScrapeUrl';
import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** ML anti-bot interstitial — not a product page; never parse as listing HTML. */
function isMercadoLibreVerificationPage(finalUrl: string, html: string): boolean {
  if (/account-verification|\/gz\/account/i.test(finalUrl)) return true;
  if (/suspicious-traffic-frontend|account-verification-main/i.test(html)) return true;
  return false;
}

/**
 * Prefer the hop that still carries social `ref` / shortlink expansion over an
 * over-stripped canonical when identity was not proven.
 */
function pickFetchHref(params: {
  canonicalUrl: string | null;
  resolvedUrl: string | null;
  fallbackHref: string;
  hasProductIdentity: boolean;
}): string {
  const { canonicalUrl, resolvedUrl, fallbackHref, hasProductIdentity } = params;
  if (hasProductIdentity && canonicalUrl) return canonicalUrl;
  if (resolvedUrl) return resolvedUrl;
  if (canonicalUrl) return canonicalUrl;
  return fallbackHref;
}

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
    extraction_status: (reason === 'invalid_url' ? 'failed' : reason === 'extract_failed' ? 'failed' : 'failed') as OfferExtractionStatus,
    missing: [] as string[],
  };
}

function amazonTitleFromHtml(html: string): string | null {
  const og = getMetaContent(html, 'og:title');
  if (og && og.trim()) return og.trim();
  const productTitle = getById(html, 'productTitle', 'text');
  if (productTitle && productTitle.trim()) return productTitle.trim();
  // Mobile `/gp/aw/d/` often has no og:title — use <title> without marketplace suffix.
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  if (!titleTag) return null;
  const cleaned = titleTag
    .replace(/\s*[:|\-–—]\s*Amazon\.[^<]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseAmazon(html: string, base: string): { title: string | null; image: string | null; store: string } {
  const title = amazonTitleFromHtml(html);
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
  // Prefer Product JSON-LD (Liverpool / Coppel / Home Depot / …) over bare og tags.
  const enriched = enrichRetailOfferFromHtml(html, base);
  if (enriched.title || enriched.image || enriched.store) {
    return {
      title: enriched.title,
      image: enriched.image,
      store: enriched.store,
    };
  }
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
    const result = await fetchFollowingRedirectsSafely(target, {
      timeoutMs: FETCH_TIMEOUT_MS,
      requireHttps: true,
      requireAllowlist: true,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      },
    });
    if (!result.ok || !result.response.ok) return null;
    const html = await result.response.text();
    return { html, pageUrl: new URL(result.finalUrl) };
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

    recordMlQuality({ urlReceived: true });

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return NextResponse.json(emptyPayload('invalid_url'));
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      return NextResponse.json(emptyPayload('invalid_url'));
    }

    const httpsUrl = url.protocol === 'http:' ? new URL(url.toString().replace(/^http:/i, 'https:')) : url;
    const block = assertSafeOfferFetchUrl(httpsUrl, { requireHttps: true, requireAllowlist: true });
    if (block.blocked) {
      return NextResponse.json(
        { ...emptyPayload('invalid_url'), error: 'Este enlace no se puede usar. Revisa que sea una URL de tienda válida.' },
        { status: 400 },
      );
    }

    // Tracking fuera; params funcionales (wid, item_id, attributes, pdp_filters) se conservan.
    // OfferUrlResolver: shortlinks + identity + canonicalize (no inventa identidad).
    // Social ML: keep resolved hop (ref=) for HTML fetch when identity is missing.
    const offerResolved = await resolveOfferUrl(rawUrl);
    const wasMeliLa = isOfferMeliLaHost(url.hostname);
    const wasAmazonShort = isAmazonExpandableHost(url.hostname);
    let workingHref = pickFetchHref({
      canonicalUrl: offerResolved.canonicalUrl,
      resolvedUrl: offerResolved.resolvedUrl,
      fallbackHref: stripOfferTrackingParams(httpsUrl.href),
      hasProductIdentity: Boolean(offerResolved.productIdentity || offerResolved.productFingerprint),
    });

    // Fail-soft Amazon short: if resolver couldn't prove ASIN, keep trying fetch on resolved hop
    if (wasAmazonShort && offerResolved.resolvedUrl) {
      workingHref = offerResolved.resolvedUrl;
    }

    let workingUrl: URL;
    try {
      workingUrl = new URL(workingHref);
    } catch {
      workingUrl = url;
      workingHref = url.href;
    }

    const inputIsMl =
      offerResolved.provider === 'mercado_libre' ||
      isOfferMercadoLibreHost(url.hostname) ||
      isOfferMercadoLibreHost(workingUrl.hostname);
    // Prefer raw paste for identity (hash wid / pdp_filters) — S6.8 authority.
    const mlResolution = inputIsMl
      ? resolveMercadoLibreItem(rawUrl) ?? resolveMercadoLibreItem(workingHref)
      : null;
    const mlIdOnMlHost =
      mlResolution?.itemId ??
      (offerResolved.productFingerprint?.startsWith('ml:')
        ? offerResolved.productFingerprint.slice(3)
        : null) ??
      (inputIsMl ? extractMercadoLibreItemId(workingHref) : null);
    if (mlResolution?.itemId || mlIdOnMlHost) {
      recordMlQuality({ resolved: true });
    }

    // After identity: fetch the cleaned canonical (drop ua/share noise), not the bloated share URL.
    if (mlResolution?.canonicalUrl) {
      workingHref = stripOfferTrackingParams(mlResolution.canonicalUrl);
      try {
        workingUrl = new URL(workingHref);
      } catch {
        /* keep previous workingUrl */
      }
    }

    // Amazon / retail full: fetch canónica cuando identidad probada
    if (
      (offerResolved.provider === 'amazon' ||
        offerResolved.provider === 'walmart' ||
        offerResolved.provider === 'liverpool' ||
        offerResolved.provider === 'coppel' ||
        offerResolved.provider === 'elektra') &&
      offerResolved.canonicalUrl &&
      (offerResolved.productIdentity || offerResolved.productFingerprint)
    ) {
      workingHref = offerResolved.canonicalUrl;
      try {
        workingUrl = new URL(workingHref);
      } catch {
        /* keep */
      }
    }

    // Amazon: scrape mobile product HTML (`/gp/aw/d/`) — `/dp/` is often a bot wall from server IPs.
    const amazonAsinHint =
      extractAmazonAsin(workingHref) ||
      extractAmazonAsin(offerResolved.canonicalUrl || '') ||
      extractAmazonAsin(rawUrl);
    const htmlFetchHref =
      offerResolved.provider === 'amazon' || isAmazonExpandableHost(workingUrl.hostname)
        ? amazonHtmlScrapeUrl(
            offerResolved.canonicalUrl && amazonAsinHint
              ? offerResolved.canonicalUrl
              : workingHref,
          )
        : workingHref;

    const htmlPromise = fetchHtml(htmlFetchHref);
    const mlPromise =
      inputIsMl && mlIdOnMlHost
        ? fetchMercadoLibrePublicOffer(workingHref).catch(() => null)
        : Promise.resolve(null);

    const [htmlResult, mlFirst] = await Promise.all([htmlPromise, mlPromise]);

    let html = htmlResult?.html ?? '';
    let pageUrl = htmlResult?.pageUrl ?? workingUrl;

    // If we still landed on a bot wall, retry once via /gp/aw/d/{ASIN}.
    if (html && amazonAsinHint && isAmazonBotWallHtml(html)) {
      const scrapeRetry = amazonHtmlScrapeUrl(
        `https://www.amazon.com.mx/dp/${amazonAsinHint}`,
      );
      if (scrapeRetry !== htmlFetchHref) {
        const retry = await fetchHtml(scrapeRetry);
        if (retry?.html && !isAmazonBotWallHtml(retry.html)) {
          html = retry.html;
          pageUrl = retry.pageUrl;
        } else {
          html = '';
        }
      } else {
        html = '';
      }
    }

    if (html && isMercadoLibreVerificationPage(pageUrl.href, html)) {
      // Anti-bot interstitial: discard so we do not treat captcha HTML as a listing.
      // Prefer identity recovered from ?go= when present (keeps API / diagnostics honest).
      try {
        const go = pageUrl.searchParams.get('go');
        if (go) {
          const goUrl = new URL(go);
          if (isOfferMercadoLibreHost(goUrl.hostname)) {
            pageUrl = goUrl;
            workingHref = goUrl.href;
            workingUrl = goUrl;
          }
        }
      } catch {
        /* keep */
      }
      html = '';
    }
    const base = pageUrl.origin + pageUrl.pathname;
    const flags = resolveOfferStoreFlags(url.hostname, pageUrl.hostname);
    const { isAmazon, isMercadoLibre } = flags;
    const isWalmart =
      offerResolved.provider === 'walmart' ||
      pageUrl.hostname.toLowerCase().includes('walmart.');
    const isLiverpool =
      offerResolved.provider === 'liverpool' ||
      pageUrl.hostname.toLowerCase().includes('liverpool.');
    const isCoppel =
      offerResolved.provider === 'coppel' ||
      pageUrl.hostname.toLowerCase().includes('coppel.');
    const isElektra =
      offerResolved.provider === 'elektra' ||
      pageUrl.hostname.toLowerCase().includes('elektra.');
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
    let trustedHtmlImages: string[] = [];
    let productScopedHtmlImages: string[] = [];
    let breadcrumbs: string[] = [];
    let candidates: string[] = [];
    let mlCategoryId: string | null = null;
    let mlPathNames: string[] = [];
    let suggestedDiscount: number | null = null;
    let suggestedOriginal: number | null = null;
    let retailExtractHandled = false;

    if (html) {
      htmlImages = extractOfferImages(html, base);
      trustedHtmlImages = extractOfferMetaImages(html, base);
      if (isMercadoLibre) {
        productScopedHtmlImages = extractMercadoLibreProductScopedImages(html, base);
      }
      breadcrumbs = extractBreadcrumbs(html);
      if (isAmazon) data = parseAmazon(html, base);
      else if (isMercadoLibre) data = parseMercadoLibre(html, base);
      else if (isWalmart) {
        const w = extractWalmartProduct(html, pageUrl.href);
        data = { title: w.title, image: w.image, store: w.store };
        candidates = collectCandidates(w.image, w.images);
        suggestedDiscount = w.suggestedDiscount;
        suggestedOriginal = w.suggestedOriginal;
        retailExtractHandled = true;
      } else if (isLiverpool) {
        const lv = extractLiverpoolProduct(html, pageUrl.href);
        data = { title: lv.title, image: lv.image, store: lv.store };
        candidates = collectCandidates(lv.image, lv.images);
        suggestedDiscount = lv.suggestedDiscount;
        suggestedOriginal = lv.suggestedOriginal;
        retailExtractHandled = true;
      } else if (isCoppel) {
        const cp = extractCoppelProduct(html, pageUrl.href);
        data = { title: cp.title, image: cp.image, store: cp.store };
        candidates = collectCandidates(cp.image, cp.images);
        suggestedDiscount = cp.suggestedDiscount;
        suggestedOriginal = cp.suggestedOriginal;
        retailExtractHandled = true;
      } else if (isElektra) {
        const el = extractElektraProduct(html, pageUrl.href);
        data = { title: el.title, image: el.image, store: el.store };
        candidates = collectCandidates(el.image, el.images);
        suggestedDiscount = el.suggestedDiscount;
        suggestedOriginal = el.suggestedOriginal;
        retailExtractHandled = true;
      } else data = parseGeneric(html, base);
    }

    if (!retailExtractHandled) {
      candidates = collectCandidates(data.image, htmlImages);
    }

    if (html && isAmazon) {
      const amazonPrices = extractSuggestedPrices(html);
      suggestedDiscount = amazonPrices.discount;
      suggestedOriginal = amazonPrices.original;
    }

    let ml = mlFirst;
    if (isMercadoLibre) {
      if (html) {
        const mlFromPage = await fetchMercadoLibrePublicOffer(pageUrl.href, html).catch(() => null);
        if (mlFromPage) ml = ml ? mergeMercadoLibrePublicOffers(ml, mlFromPage) : mlFromPage;
      } else if (!ml || selectOfferImages(ml.pictures).length < 2) {
        const mlRetry = await fetchMercadoLibrePublicOffer(pageUrl.href, null).catch(() => null);
        if (mlRetry) ml = ml ? mergeMercadoLibrePublicOffers(ml, mlRetry) : mlRetry;
      }
    }

    // API ML autenticada = fuente de verdad para precio/título/imágenes/categoría.
    // CDN HTML amplio solo en meli.la /social (docs/PARSE_OFFER_MELI_LA_GALERIA.md).
    const allowHtmlCdnFallback =
      wasMeliLa ||
      /\/social\//i.test(pageUrl.pathname) ||
      /\/social\//i.test(workingUrl.pathname);

    if (isMercadoLibre) {
      if (ml) {
        data = {
          title: ml.title || data.title,
          image: ml.pictures[0] || data.image,
          store: 'Mercado Libre',
        };
        // No mezclar scrape HTML (similares/otros modelos) cuando la API ya trae galería.
        const mergedPics = mergeMercadoLibreImageCandidates({
          apiPictures: ml.pictures,
          htmlImages,
          trustedHtmlImages,
          productScopedHtmlImages,
          allowHtmlCdnFallback,
          mlSource: ml.source,
          sourceItemId: ml.itemId ?? mlIdOnMlHost,
        });
        candidates = collectCandidates(ml.pictures[0] ?? data.image, mergedPics);
        // workingHref puede haber perdido matt_* por strip de tracking; medir readiness
        // sobre la URL canónica + tags de plataforma (lo que persistirá offer_url).
        const affiliateProbe = applyPlatformAffiliateTags(ml.canonicalUrl || workingHref || rawUrl);
        recordMlQuality({
          apiStatus: ml.source === 'ml_api' ? 'success' : 'other',
          imagesFromApi: ml.pictures.length,
          imagesFromFallback: mergedPics.length > ml.pictures.length ? mergedPics.length - ml.pictures.length : 0,
          affiliateReady: storeHasAffiliateProgram(affiliateProbe)
            ? isPlatformAffiliateTagged(affiliateProbe)
            : false,
        });
        mlCategoryId = ml.categoryId;
        mlPathNames = ml.pathNames;
        // Precio resuelto (auth o público) — no exigir ml_api solo; anonymous + price>0 también cuenta.
        if (typeof ml.price === 'number' && ml.price > 0) suggestedDiscount = ml.price;
        if (typeof ml.originalPrice === 'number' && ml.originalPrice > 0) {
          suggestedOriginal = ml.originalPrice;
        } else if (suggestedDiscount != null) {
          suggestedOriginal = null;
        }
      } else {
        // Fail closed: sin API del item, solo meta de confianza (og/twitter). Nunca scrape CDN.
        candidates = mergeMercadoLibreImageCandidates({
          apiPictures: [],
          htmlImages,
          trustedHtmlImages,
          productScopedHtmlImages,
          allowHtmlCdnFallback,
          sourceItemId: mlIdOnMlHost,
        });
        data = {
          title: data.title,
          image: candidates[0] ?? null,
          store: 'Mercado Libre',
        };
        recordMlQuality({
          usedHtmlFallback: trustedHtmlImages.length > 0,
          imagesFromFallback: candidates.length,
        });
      }
    }

    if (isMercadoLibre && html && (suggestedDiscount == null || suggestedOriginal == null)) {
      if (!ml) {
        recordMlQuality({ usedHtmlFallback: true, imagesFromFallback: trustedHtmlImages.length });
      }
      const structured = extractMercadoLibreStructuredPrices(html);
      // Social/meli.la often lacks JSON-LD price but exposes andes-money-amount in DOM.
      const domPrices = extractMercadoLibreDomPrices(html);
      if (suggestedDiscount == null) {
        suggestedDiscount =
          structured.discount ??
          domPrices.discount ??
          (typeof ml?.price === 'number' && ml.price > 0 ? ml.price : null);
      }
      if (suggestedOriginal == null) {
        suggestedOriginal =
          structured.original ??
          domPrices.original ??
          (typeof ml?.originalPrice === 'number' && ml.originalPrice > 0 ? ml.originalPrice : null);
      }
    }

    if (html && !isAmazon && !isMercadoLibre && !retailExtractHandled) {
      const retail = enrichRetailOfferFromHtml(html, pageUrl.href);
      suggestedDiscount = retail.suggestedDiscount;
      suggestedOriginal = retail.suggestedOriginal;
      // Prefer hostname label (Liverpool/Coppel/…) when JSON-LD/og site_name is noisy.
      if (retail.store) data = { ...data, store: data.store || retail.store };
      if (retail.title && !data.title) data = { ...data, title: retail.title };
      if (retail.image && !data.image) data = { ...data, image: retail.image };
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

    const classification = classifyOfferExtraction({
      title,
      imageCount: images.length,
      hasPrice: suggestedDiscount != null,
      hasCategory: Boolean(suggestedCategory),
      productIdentity: Boolean(
        offerResolved.productIdentity ||
          offerResolved.productFingerprint ||
          mlIdOnMlHost ||
          (isAmazon && offerResolved.productFingerprint),
      ),
    });

    const extracted = classification.status !== 'failed';

    // Observability for broken paste flow (no secrets). Helps Hunter Lab / support.
    const extractDiagnostics = {
      htmlFetched: Boolean(html),
      mlApiHit: Boolean(ml),
      mlSource: ml?.source ?? null,
      mlItemId: ml?.itemId ?? mlIdOnMlHost,
      imageCandidateCount: candidates.length,
      selectedImageCount: images.length,
      productScopedImageCount: productScopedHtmlImages.length,
      offerResolvedConfidence: offerResolved.confidence,
      offerResolvedProvenance: offerResolved.provenance?.slice(0, 12) ?? [],
      extractionStatus: classification.status,
      extractionErrorCode: classification.errorCode,
    };

    if (wasMeliLa && !extracted && isMercadoLibre) {
      return NextResponse.json({
        ...emptyPayload('extract_failed'),
        store: 'Mercado Libre',
        extraction_status: 'failed' as OfferExtractionStatus,
        missing: classification.missing,
        error:
          'No pudimos obtener el producto desde este enlace corto. Pega la URL completa de Mercado Libre y puedes completar los datos a mano.',
        diagnostics: extractDiagnostics,
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
      reason: classification.status === 'failed' ? 'extract_failed' : null,
      extraction_status: classification.status,
      missing: classification.missing,
      diagnostics: extractDiagnostics,
    });
  } catch {
    return NextResponse.json(emptyPayload('extract_failed'));
  }
}
