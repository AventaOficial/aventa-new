import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import { sanitizeOfferTitle } from '@/lib/sanitizeOfferTitle';
import {
  assertSafeOfferFetchUrl,
  fetchFollowingRedirectsSafely,
} from '@/lib/server/fetchUrlSafety';
import { inferOfferCategory } from '@/lib/offers/inferOfferCategory';
import {
  fetchMercadoLibrePublicOffer,
  mergeMercadoLibrePublicOffers,
} from '@/lib/offers/mlPublicOffer';
import { normalizePastedOfferUrl } from '@/lib/offerUrl';
import { resolveOfferUrl } from '@/lib/offers/urlResolution';
import type { OfferUrlProvider } from '@/lib/offers/urlResolution';
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
  type OfferExtractionErrorCode,
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
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate/resolveAffiliateOfferUrl';
import { computeDiscountPercent } from '@/lib/offers/batch/contract';
import { enrichRetailOfferFromHtml } from '@/lib/offers/enrichRetailOfferFromHtml';
import {
  amazonHtmlScrapeUrl,
  isAmazonBotWallHtml,
} from '@/lib/offers/amazonProductScrapeUrl';
import {
  isWalmartBotWallHtml,
  walmartHtmlScrapeUrl,
  WALMART_MOBILE_UA,
} from '@/lib/offers/walmartProductScrapeUrl';
import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { extractLiverpoolProductId } from '@/lib/offers/urlResolution/liverpoolResolver';

/**
 * Extracción de producto desde una URL de tienda.
 *
 * Esta función es la ÚNICA implementación de extracción. La usan:
 *   - `POST /api/parse-offer-url` (formulario público; el route sólo añade auth + rate limit)
 *   - Batch ingestion (servidor, sin pasar por HTTP ni por el rate limit público)
 *
 * El `body` que devuelve es byte-a-byte el contrato histórico del endpoint público.
 * `adapter` expone datos adicionales (retailer, URL canónica, identidad, evidencia)
 * que el formulario público no consume y que el lote sí necesita.
 */

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export type ParseOfferReason = 'invalid_url' | 'extract_failed' | null;

export type ParseOfferDiagnostics = {
  htmlFetched: boolean;
  mlApiHit: boolean;
  mlSource: string | null;
  mlItemId: string | null;
  imageCandidateCount: number;
  selectedImageCount: number;
  productScopedImageCount: number;
  offerResolvedConfidence: string;
  offerResolvedProvenance: string[];
  extractionStatus: OfferExtractionStatus;
  extractionErrorCode: OfferExtractionErrorCode | null;
  /** Causa de acceso, distinta de un campo de producto ausente. */
  accessFailure?: 'ACCESS_BLOCKED' | 'TIMEOUT' | 'EXTRACTION_EMPTY' | null;
  resolutionMethod?: string | null;
  durationMs?: number | null;
  imageAcceptedCount?: number;
  imageRejectedCount?: number;
  imageRejectReason?: string | null;
};

/** Contrato público de `/api/parse-offer-url`. No cambiar sin migrar el formulario. */
export type ParseOfferPayload = {
  title: string | null;
  image: string | null;
  images: string[];
  store: string | null;
  suggested_discount_price: number | null;
  suggested_original_price: number | null;
  suggested_category: string | null;
  reason: ParseOfferReason;
  extraction_status: OfferExtractionStatus;
  missing: string[];
  error?: string;
  diagnostics?: ParseOfferDiagnostics;
};

/** Datos de adaptador de retailer (consumidos por el lote, no por el formulario público). */
export type RetailerAdapterResult = {
  /** Retailer detectado por el resolver de URLs. */
  provider: OfferUrlProvider;
  /** URL tras quitar tracking y expandir acortadores (lo que realmente se navegó). */
  normalizedUrl: string | null;
  /** URL canónica semántica (ASIN, item ML, PDP) o null si no se pudo probar identidad. */
  canonicalUrl: string | null;
  productIdentity: string | null;
  productFingerprint: string | null;
  /** Por qué la galería quedó vacía o corta (operador). */
  imageNote: string | null;
  /** De dónde salieron los precios. */
  priceSource: 'ml_api' | 'ml_html' | 'amazon_html' | 'retail_html' | 'none';
  originalPriceSource: 'ml_api' | 'ml_html' | 'amazon_html' | 'retail_html' | 'none';
  blockedByHostPolicy: boolean;
};

/**
 * Contrato interno compartido. Campos sin evidencia quedan null.
 * El formulario sigue leyendo solo `ParseOfferPayload`.
 */
export type OfferExtractionCore = {
  provider: OfferUrlProvider;
  sourceUrl: string;
  normalizedUrl: string | null;
  canonicalUrl: string | null;
  outboundUrl: string | null;
  identity: {
    productId: string | null;
    productIdentity: string | null;
    variantId: string | null;
    productFingerprint: string | null;
  };
  product: {
    title: string | null;
    brand: string | null;
    category: string | null;
    subcategory: string | null;
  };
  pricing: {
    currentPrice: number | null;
    originalPrice: number | null;
    discount: number | null;
    currency: string | null;
    priceSource: string | null;
    originalPriceSource: string | null;
  };
  media: {
    primaryImage: string | null;
    images: string[];
  };
  merchant: {
    seller: string | null;
    sellerType: string | null;
  };
  availability: {
    status: string | null;
  };
  fulfillment: {
    shipping: string | null;
    installments: number | null;
  };
  extraction: {
    status: OfferExtractionStatus;
    missing: string[];
    warnings: string[];
  };
  diagnostics: {
    provider: OfferUrlProvider;
    resolutionMethod: string | null;
    extractionMethod: string | null;
    durationMs: number | null;
    imageCandidateCount: number;
    imageAcceptedCount: number;
    imageRejectedCount: number;
    imageRejectReason: string | null;
    accessFailure: 'ACCESS_BLOCKED' | 'TIMEOUT' | 'EXTRACTION_EMPTY' | null;
    sources: string[];
  };
};

export type OfferExtractionOutcome = {
  httpStatus: 200 | 400;
  body: ParseOfferPayload;
  adapter: RetailerAdapterResult;
  core: OfferExtractionCore;
};

export function emptyOfferExtractionCore(sourceUrl = ''): OfferExtractionCore {
  return {
    provider: 'unknown',
    sourceUrl,
    normalizedUrl: null,
    canonicalUrl: null,
    outboundUrl: null,
    identity: { productId: null, productIdentity: null, variantId: null, productFingerprint: null },
    product: { title: null, brand: null, category: null, subcategory: null },
    pricing: {
      currentPrice: null,
      originalPrice: null,
      discount: null,
      currency: null,
      priceSource: null,
      originalPriceSource: null,
    },
    media: { primaryImage: null, images: [] },
    merchant: { seller: null, sellerType: null },
    availability: { status: null },
    fulfillment: { shipping: null, installments: null },
    extraction: { status: 'failed', missing: [], warnings: [] },
    diagnostics: {
      provider: 'unknown',
      resolutionMethod: null,
      extractionMethod: null,
      durationMs: null,
      imageCandidateCount: 0,
      imageAcceptedCount: 0,
      imageRejectedCount: 0,
      imageRejectReason: null,
      accessFailure: null,
      sources: [],
    },
  };
}

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

export function emptyParseOfferPayload(reason: ParseOfferReason = null): ParseOfferPayload {
  return {
    title: null,
    image: null,
    images: [],
    store: null,
    suggested_discount_price: null,
    suggested_original_price: null,
    suggested_category: null,
    reason,
    extraction_status: 'failed',
    missing: [],
  };
}

function emptyAdapter(overrides: Partial<RetailerAdapterResult> = {}): RetailerAdapterResult {
  return {
    provider: 'unknown',
    normalizedUrl: null,
    canonicalUrl: null,
    productIdentity: null,
    productFingerprint: null,
    imageNote: null,
    priceSource: 'none',
    originalPriceSource: 'none',
    blockedByHostPolicy: false,
    ...overrides,
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

type HtmlFetch =
  | { ok: true; html: string; pageUrl: URL }
  | { ok: false; failure: 'TIMEOUT' | 'ACCESS_BLOCKED' };

function keepAccessFailure(
  current: 'TIMEOUT' | 'ACCESS_BLOCKED' | null,
  next: 'TIMEOUT' | 'ACCESS_BLOCKED' | null,
): 'TIMEOUT' | 'ACCESS_BLOCKED' | null {
  if (current === 'TIMEOUT' || next == null) return current;
  return next;
}

async function fetchHtml(
  target: string,
  opts?: { userAgent?: string },
): Promise<HtmlFetch> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const result = await fetchFollowingRedirectsSafely(target, {
      timeoutMs: FETCH_TIMEOUT_MS,
      requireHttps: true,
      requireAllowlist: true,
      signal: controller.signal,
      headers: {
        'User-Agent': opts?.userAgent || USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      },
    });
    if (!result.ok || !result.response.ok) return { ok: false, failure: 'ACCESS_BLOCKED' };
    const html = await result.response.text();
    return { html, pageUrl: new URL(result.finalUrl), ok: true };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    return { ok: false, failure: name === 'AbortError' || name === 'TimeoutError' ? 'TIMEOUT' : 'ACCESS_BLOCKED' };
  } finally {
    clearTimeout(timeoutId);
  }
}

function imageNoteFor(params: {
  isMercadoLibre: boolean;
  mlApiHit: boolean;
  htmlFetched: boolean;
  selected: number;
  candidates: number;
}): string | null {
  const { isMercadoLibre, mlApiHit, htmlFetched, selected, candidates } = params;
  if (selected > 0 && candidates <= selected) return null;
  if (selected > 0) return null;
  if (isMercadoLibre && !mlApiHit && !htmlFetched) {
    return 'Mercado Libre no respondió (ni API ni página). Reintenta o pega la URL completa del producto.';
  }
  if (isMercadoLibre && !mlApiHit) {
    return 'La API de Mercado Libre no devolvió el producto; sólo se aceptan fotos confiables de la página y no había.';
  }
  if (!htmlFetched) {
    return 'La tienda bloqueó la lectura de la página desde el servidor. Reintenta más tarde.';
  }
  return 'La página no expuso fotos de producto confiables.';
}

/**
 * Marca y disponibilidad solo del Product JSON-LD cuyo sku es el id ya resuelto.
 * No usa el primer Product de la página: ese puede ser otro SKU.
 */
function jsonLdFactsForProductId(
  html: string,
  productId: string,
): { brand: string | null; availability: string | null } {
  const wanted = productId.trim().toUpperCase();
  if (!wanted) return { brand: null, availability: null };
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1] ?? '');
    } catch {
      continue;
    }
    const stack: unknown[] = [parsed];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      const record = node as Record<string, unknown>;
      if (record['@graph']) stack.push(record['@graph']);
      const typeValue = record['@type'];
      const typeName = Array.isArray(typeValue) ? typeValue.map(String).join(',') : String(typeValue ?? '');
      const sku = typeof record.sku === 'string' ? record.sku.trim().toUpperCase() : '';
      if (!typeName.includes('Product') || sku !== wanted) continue;
      const brandValue = record.brand;
      const brand =
        typeof brandValue === 'string'
          ? brandValue.trim()
          : brandValue &&
              typeof brandValue === 'object' &&
              typeof (brandValue as { name?: unknown }).name === 'string'
            ? String((brandValue as { name: string }).name).trim()
            : '';
      const offers = Array.isArray(record.offers) ? record.offers[0] : record.offers;
      const rawAvailability =
        offers && typeof offers === 'object' && typeof (offers as { availability?: unknown }).availability === 'string'
          ? (offers as { availability: string }).availability
          : '';
      return {
        brand: brand || null,
        availability: rawAvailability ? rawAvailability.split('/').pop()?.trim() || null : null,
      };
    }
  }
  return { brand: null, availability: null };
}

/**
 * Ejecuta la extracción completa. Nunca lanza: los errores se reflejan en `body.reason`.
 */
export async function extractOfferFromUrl(input: string): Promise<OfferExtractionOutcome> {
  try {
    const rawUrl = normalizePastedOfferUrl(typeof input === 'string' ? input : '');
    if (!rawUrl) {
      return { httpStatus: 200, body: emptyParseOfferPayload('invalid_url'), adapter: emptyAdapter(), core: emptyOfferExtractionCore() };
    }

    recordMlQuality({ urlReceived: true });
    const startedAt = Date.now();

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return { httpStatus: 200, body: emptyParseOfferPayload('invalid_url'), adapter: emptyAdapter(), core: emptyOfferExtractionCore() };
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { httpStatus: 200, body: emptyParseOfferPayload('invalid_url'), adapter: emptyAdapter(), core: emptyOfferExtractionCore() };
    }

    const httpsUrl = url.protocol === 'http:' ? new URL(url.toString().replace(/^http:/i, 'https:')) : url;
    const block = assertSafeOfferFetchUrl(httpsUrl, { requireHttps: true, requireAllowlist: true });
    if (block.blocked) {
      return {
        httpStatus: 400,
        body: {
          ...emptyParseOfferPayload('invalid_url'),
          error: 'Este enlace no se puede usar. Revisa que sea una URL de tienda válida.',
        },
        adapter: emptyAdapter({ blockedByHostPolicy: true }),
        core: emptyOfferExtractionCore(rawUrl),
      };
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
    // Walmart: mobile Safari UA — desktop Chrome often hits PerimeterX `/blocked`.
    const amazonAsinHint =
      extractAmazonAsin(workingHref) ||
      extractAmazonAsin(offerResolved.canonicalUrl || '') ||
      extractAmazonAsin(rawUrl);
    const isWalmartProvider =
      offerResolved.provider === 'walmart' ||
      workingUrl.hostname.toLowerCase().includes('walmart.');
    const htmlFetchHref =
      offerResolved.provider === 'amazon' || isAmazonExpandableHost(workingUrl.hostname)
        ? amazonHtmlScrapeUrl(
            offerResolved.canonicalUrl && amazonAsinHint
              ? offerResolved.canonicalUrl
              : workingHref,
          )
        : isWalmartProvider
          ? walmartHtmlScrapeUrl(rawUrl, offerResolved.canonicalUrl || workingHref)
          : workingHref;
    const htmlFetchUa = isWalmartProvider ? WALMART_MOBILE_UA : USER_AGENT;

    const htmlPromise = fetchHtml(htmlFetchHref, { userAgent: htmlFetchUa });
    const mlPromise =
      inputIsMl && mlIdOnMlHost
        ? fetchMercadoLibrePublicOffer(workingHref).catch(() => null)
        : Promise.resolve(null);

    const [htmlResult, mlFirst] = await Promise.all([htmlPromise, mlPromise]);

    let html = htmlResult.ok ? htmlResult.html : '';
    let pageUrl = htmlResult.ok ? htmlResult.pageUrl : workingUrl;
    let pageAccess: 'TIMEOUT' | 'ACCESS_BLOCKED' | null = htmlResult.ok ? null : htmlResult.failure;

    // If we still landed on a bot wall, retry once via /gp/aw/d/{ASIN}.
    if (html && amazonAsinHint && isAmazonBotWallHtml(html)) {
      const scrapeRetry = amazonHtmlScrapeUrl(
        `https://www.amazon.com.mx/dp/${amazonAsinHint}`,
      );
      if (scrapeRetry !== htmlFetchHref) {
        const retry = await fetchHtml(scrapeRetry);
        if (retry.ok && retry.html && !isAmazonBotWallHtml(retry.html)) {
          html = retry.html;
          pageUrl = retry.pageUrl;
          pageAccess = null;
        } else {
          html = '';
          pageAccess = keepAccessFailure(pageAccess, retry.ok ? 'ACCESS_BLOCKED' : retry.failure);
        }
      } else {
        html = '';
        pageAccess = keepAccessFailure(pageAccess, 'ACCESS_BLOCKED');
      }
    }

    // Walmart: if mobile UA still hit captcha (or first hop redirected to /blocked), clear HTML.
    if (isWalmartProvider && html && isWalmartBotWallHtml(html, pageUrl.href)) {
      const retryHref = walmartHtmlScrapeUrl(
        offerResolved.canonicalUrl || workingHref,
        offerResolved.canonicalUrl,
      );
      const retry = await fetchHtml(retryHref, { userAgent: WALMART_MOBILE_UA });
      if (retry.ok && retry.html && !isWalmartBotWallHtml(retry.html, retry.pageUrl.href)) {
        html = retry.html;
        pageUrl = retry.pageUrl;
        pageAccess = null;
      } else {
        html = '';
        pageAccess = keepAccessFailure(pageAccess, retry.ok ? 'ACCESS_BLOCKED' : retry.failure);
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
      pageAccess = keepAccessFailure(pageAccess, 'ACCESS_BLOCKED');
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

    const adapterBase = emptyAdapter({
      provider: offerResolved.provider,
      normalizedUrl: workingHref,
      canonicalUrl:
        offerResolved.productIdentity || offerResolved.productFingerprint
          ? offerResolved.canonicalUrl || null
          : null,
      productIdentity: offerResolved.productIdentity,
      productFingerprint: offerResolved.productFingerprint,
    });

    if (wasMeliLa && isOfferMeliLaHost(pageUrl.hostname) && !extractMercadoLibreItemId(pageUrl.href) && !html) {
      return {
        httpStatus: 200,
        body: {
          ...emptyParseOfferPayload('extract_failed'),
          store: 'Mercado Libre',
          error:
            'No pudimos abrir este enlace corto de Mercado Libre. Pega la URL completa del producto (mercadolibre.com.mx/…) y vuelve a intentar.',
        },
        adapter: adapterBase,
        core: emptyOfferExtractionCore(rawUrl),
      };
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
    let priceSource: RetailerAdapterResult['priceSource'] = 'none';
    let originalPriceSource: RetailerAdapterResult['originalPriceSource'] = 'none';
    let verifiedBrand: string | null = null;
    let verifiedAvailability: string | null = null;

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
      if (retailExtractHandled) {
        if (suggestedDiscount != null) priceSource = 'retail_html';
        if (suggestedOriginal != null) originalPriceSource = 'retail_html';
      }
    }

    if (!retailExtractHandled) {
      candidates = collectCandidates(data.image, htmlImages);
    }

    if (html && isAmazon) {
      const amazonPrices = extractSuggestedPrices(html);
      suggestedDiscount = amazonPrices.discount;
      suggestedOriginal = amazonPrices.original;
      priceSource = suggestedDiscount != null ? 'amazon_html' : 'none';
      originalPriceSource = suggestedOriginal != null ? 'amazon_html' : 'none';
    }

    const identityForFacts = isAmazon
      ? amazonAsinHint
      : isLiverpool
        ? extractLiverpoolProductId(pageUrl.href)
        : null;
    if (html && identityForFacts && !isMercadoLibre) {
      const facts = jsonLdFactsForProductId(html, identityForFacts);
      verifiedBrand = facts.brand;
      verifiedAvailability = facts.availability;
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
        if (typeof ml.price === 'number' && ml.price > 0) {
          suggestedDiscount = ml.price;
          priceSource = 'ml_api';
        }
        if (typeof ml.originalPrice === 'number' && ml.originalPrice > 0) {
          suggestedOriginal = ml.originalPrice;
          originalPriceSource = 'ml_api';
        } else if (suggestedDiscount != null) {
          suggestedOriginal = null;
          originalPriceSource = 'none';
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
        if (suggestedDiscount != null) priceSource = 'ml_html';
      }
      if (suggestedOriginal == null) {
        suggestedOriginal =
          structured.original ??
          domPrices.original ??
          (typeof ml?.originalPrice === 'number' && ml.originalPrice > 0 ? ml.originalPrice : null);
        if (suggestedOriginal != null) originalPriceSource = 'ml_html';
      }
    }

    if (html && !isAmazon && !isMercadoLibre && !retailExtractHandled) {
      const retail = enrichRetailOfferFromHtml(html, pageUrl.href);
      suggestedDiscount = retail.suggestedDiscount;
      suggestedOriginal = retail.suggestedOriginal;
      priceSource = suggestedDiscount != null ? 'retail_html' : 'none';
      originalPriceSource = suggestedOriginal != null ? 'retail_html' : 'none';
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
      originalPriceSource = 'none';
    }
    if (suggestedOriginal == null) originalPriceSource = 'none';
    if (suggestedDiscount == null) priceSource = 'none';

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
    const extractDiagnostics: ParseOfferDiagnostics = {
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
      accessFailure: null,
      resolutionMethod: mlResolution?.resolutionMethod ?? offerResolved.provenance[0] ?? null,
      durationMs: Date.now() - startedAt,
      imageAcceptedCount: images.length,
      imageRejectedCount: 0,
      imageRejectReason: null,
    };
    if (isMercadoLibre) {
      const pool = (ml?.pictures.length ?? 0) + htmlImages.length + productScopedHtmlImages.length;
      extractDiagnostics.imageRejectedCount = Math.max(0, pool - images.length);
      extractDiagnostics.imageRejectReason =
        extractDiagnostics.imageRejectedCount > 0 ? 'unverified_other_listing' : null;
    }

    const adapter: RetailerAdapterResult = {
      ...adapterBase,
      // ML: canonical semántica del resolver S6.8 cuando existe (nunca bare-ID inventado).
      canonicalUrl:
        (isMercadoLibre && mlResolution?.canonicalUrl
          ? stripOfferTrackingParams(mlResolution.canonicalUrl)
          : null) ||
        (isMercadoLibre && ml?.canonicalUrl ? ml.canonicalUrl : null) ||
        adapterBase.canonicalUrl,
      productIdentity: adapterBase.productIdentity ?? (mlIdOnMlHost ? `ml:${mlIdOnMlHost}` : null),
      productFingerprint: adapterBase.productFingerprint ?? (mlIdOnMlHost ? `ml:${mlIdOnMlHost}` : null),
      imageNote: imageNoteFor({
        isMercadoLibre,
        mlApiHit: Boolean(ml),
        htmlFetched: Boolean(html),
        selected: images.length,
        candidates: candidates.length,
      }),
      priceSource,
      originalPriceSource,
    };

    const publishInput = (adapter.canonicalUrl || adapter.normalizedUrl || rawUrl).trim();
    let outboundUrl: string | null = null;
    try {
      outboundUrl = publishInput ? await resolveAndNormalizeAffiliateOfferUrl(publishInput) : null;
    } catch {
      outboundUrl = null;
    }
    const fieldWarnings = classification.missing.flatMap((field) => {
      if (field === 'título') return ['NO_TITLE'];
      if (field === 'imágenes') return ['NO_IMAGES'];
      if (field === 'precio') return ['NO_PRICE'];
      return [];
    });
    const emptyProduct = !title && suggestedDiscount == null && images.length === 0;
    let accessFailure: 'ACCESS_BLOCKED' | 'TIMEOUT' | 'EXTRACTION_EMPTY' | null = null;
    if (emptyProduct && pageAccess) accessFailure = pageAccess;
    else if (emptyProduct && html.length > 0) accessFailure = 'EXTRACTION_EMPTY';
    else if (emptyProduct) accessFailure = 'ACCESS_BLOCKED';
    if (accessFailure) fieldWarnings.unshift(accessFailure);
    extractDiagnostics.accessFailure = accessFailure;
    const fingerprint = adapter.productFingerprint;
    const productId =
      mlIdOnMlHost ||
      (fingerprint?.startsWith('amz:') ? fingerprint.slice(4) : null) ||
      (fingerprint?.startsWith('lvp:') ? fingerprint.slice(4) : null) ||
      (fingerprint?.startsWith('ml:') ? fingerprint.slice(3) : null);
    const core: OfferExtractionCore = {
      provider: offerResolved.provider,
      sourceUrl: rawUrl,
      normalizedUrl: adapter.normalizedUrl,
      canonicalUrl: adapter.canonicalUrl,
      outboundUrl,
      identity: {
        productId,
        productIdentity: adapter.productIdentity,
        variantId: offerResolved.variantIdentity,
        productFingerprint: fingerprint,
      },
      product: {
        title,
        brand: isMercadoLibre ? null : verifiedBrand,
        category: suggestedCategory,
        subcategory: null,
      },
      pricing: {
        currentPrice: suggestedDiscount,
        originalPrice: suggestedOriginal,
        discount: computeDiscountPercent(suggestedDiscount, suggestedOriginal),
        currency: ml?.currency ?? null,
        priceSource: priceSource === 'none' ? null : priceSource,
        originalPriceSource: originalPriceSource === 'none' ? null : originalPriceSource,
      },
      media: { primaryImage: images[0] ?? null, images },
      merchant: { seller: null, sellerType: null },
      availability: {
        status: isMercadoLibre ? null : verifiedAvailability,
      },
      fulfillment: { shipping: null, installments: null },
      extraction: {
        status: classification.status,
        missing: classification.missing,
        warnings: fieldWarnings,
      },
      diagnostics: {
        provider: offerResolved.provider,
        resolutionMethod: extractDiagnostics.resolutionMethod ?? null,
        extractionMethod: priceSource === 'none' ? null : priceSource,
        durationMs: extractDiagnostics.durationMs ?? null,
        imageCandidateCount: candidates.length,
        imageAcceptedCount: images.length,
        imageRejectedCount: extractDiagnostics.imageRejectedCount ?? 0,
        imageRejectReason: extractDiagnostics.imageRejectReason ?? null,
        accessFailure,
        sources: [priceSource, originalPriceSource].filter((s) => s !== 'none'),
      },
    };

    if (wasMeliLa && !extracted && isMercadoLibre) {
      return {
        httpStatus: 200,
        body: {
          ...emptyParseOfferPayload('extract_failed'),
          store: 'Mercado Libre',
          extraction_status: 'failed',
          missing: classification.missing,
          error:
            'No pudimos obtener el producto desde este enlace corto. Pega la URL completa de Mercado Libre y puedes completar los datos a mano.',
          diagnostics: extractDiagnostics,
        },
        adapter,
        core,
      };
    }

    return {
      httpStatus: 200,
      body: {
        title: core.product.title,
        image: core.media.primaryImage,
        images: core.media.images,
        store,
        suggested_discount_price: core.pricing.currentPrice,
        suggested_original_price: core.pricing.originalPrice,
        suggested_category: core.product.category,
        reason: classification.status === 'failed' ? 'extract_failed' : null,
        extraction_status: classification.status,
        missing: classification.missing,
        diagnostics: extractDiagnostics,
      },
      adapter,
      core,
    };
  } catch {
    return { httpStatus: 200, body: emptyParseOfferPayload('extract_failed'), adapter: emptyAdapter(), core: emptyOfferExtractionCore() };
  }
}
