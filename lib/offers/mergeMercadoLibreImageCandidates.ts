import {
  mergeMlImageCandidates,
  type MlImageCandidate,
  type MlImageProvenanceSource,
} from '@/lib/offers/mlImageProvenance';
import {
  isHighConfidenceJunkImage,
  mercadoLibreImageResourceId,
} from '@/lib/offers/selectOfferImages';

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

function normalizeList(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const u = raw.trim();
    if (!isHttpUrl(u)) continue;
    if (isHighConfidenceJunkImage(u)) continue;
    const key = mercadoLibreImageResourceId(u) ?? u.split('?')[0] ?? u;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

function sameMlProductResource(a: string, b: string): boolean {
  const idA = mercadoLibreImageResourceId(a);
  const idB = mercadoLibreImageResourceId(b);
  if (idA && idB) return idA === idB;
  return false;
}

function toCandidates(
  urls: string[],
  source: MlImageProvenanceSource,
  sourceItemId: string | null,
): MlImageCandidate[] {
  return normalizeList(urls).map((url, index) => ({
    url,
    source,
    sourceItemId,
    pictureId: null,
    isPrimary: index === 0,
  }));
}

/**
 * Ensambla candidatas de imagen para Mercado Libre.
 *
 * - API >= 2: solo API (no HTML global / similares).
 * - API === 1: API + variantes mismo recurso + galería product-scoped (JSON-LD / pictures[]).
 * - API === 0: trusted/og (+ product-scoped). CDN amplio solo si `allowHtmlCdnFallback`
 *   (meli.la /social — docs/PARSE_OFFER_MELI_LA_GALERIA.md).
 */
export function mergeMercadoLibreImageCandidates(params: {
  apiPictures: string[];
  /** Scrape amplio (puede incluir similares). Solo same-resource salvo allowHtmlCdnFallback. */
  htmlImages?: string[];
  /** Meta de alta confianza (og/twitter). Usado cuando API = 0. */
  trustedHtmlImages?: string[];
  /**
   * Galería ligada al producto (JSON-LD Product + pictures[] embebidos).
   * Se fusiona cuando API tiene 0–1 fotos para completar la galería sin relacionados.
   */
  productScopedHtmlImages?: string[];
  /**
   * true en meli.la / páginas /social/: permite HTML CDN amplio (fix 19c0fb4).
   * false en fichas /p/ o articulo (evita similares).
   */
  allowHtmlCdnFallback?: boolean;
  /** Preferir 'ml_api' cuando vino de /items|/products autenticado. */
  mlSource?: string | null;
  /** Mínimo de fotos API para descartar HTML por completo. Default 2. */
  minApiPicturesToSkipHtml?: number;
  sourceItemId?: string | null;
}): string[] {
  const api = normalizeList(params.apiPictures ?? []);
  const html = normalizeList(params.htmlImages ?? []);
  const trusted = normalizeList(params.trustedHtmlImages ?? []);
  const scoped = normalizeList(params.productScopedHtmlImages ?? []);
  const minApi = params.minApiPicturesToSkipHtml ?? 2;
  const itemId = params.sourceItemId ?? null;
  const allowCdn = Boolean(params.allowHtmlCdnFallback);

  if (api.length >= minApi) {
    return mergeMlImageCandidates(
      [toCandidates(api, params.mlSource === 'ml_api' ? 'ml_api' : 'ml_api', itemId)],
      { minApiToSkipFallback: minApi, sourceItemId: itemId },
    ).map((c) => c.url);
  }

  if (api.length === 1) {
    const cover = api[0];
    const sameResourceVariants = html.filter((h) => sameMlProductResource(cover, h));
    const scopedExtra = scoped.filter((s) => !sameMlProductResource(cover, s) || s === cover);
    // En social/meli.la, si API solo trae 1, completar con CDN HTML (doc galería).
    const cdnExtra = allowCdn
      ? html.filter((h) => !sameMlProductResource(cover, h))
      : [];
    return mergeMlImageCandidates(
      [
        toCandidates(api, 'ml_api', itemId),
        toCandidates(sameResourceVariants, 'same_resource', itemId),
        toCandidates(scopedExtra, 'product_jsonld', itemId),
        toCandidates(cdnExtra, 'product_jsonld', itemId),
      ],
      { minApiToSkipFallback: minApi, sourceItemId: itemId },
    ).map((c) => c.url);
  }

  // API === 0
  const lists: MlImageCandidate[][] = [];
  if (scoped.length > 0) lists.push(toCandidates(scoped, 'product_jsonld', itemId));
  if (trusted.length > 0) lists.push(toCandidates(trusted, 'og', itemId));
  if (allowCdn && html.length > 0) {
    lists.push(toCandidates(html, 'product_jsonld', itemId));
  }
  if (lists.length === 0) return [];

  const merged = mergeMlImageCandidates(lists, {
    minApiToSkipFallback: minApi,
    sourceItemId: itemId,
  }).map((c) => c.url);
  if (merged.length > 0) return merged;
  return trusted.length > 0 ? trusted : scoped.slice(0, 4);
}

export function mergeMercadoLibreImageCandidatesDetailed(params: {
  apiPictures: string[];
  htmlImages?: string[];
  trustedHtmlImages?: string[];
  productScopedHtmlImages?: string[];
  allowHtmlCdnFallback?: boolean;
  mlSource?: string | null;
  minApiPicturesToSkipHtml?: number;
  sourceItemId?: string | null;
}): MlImageCandidate[] {
  const urls = mergeMercadoLibreImageCandidates(params);
  const source = params.mlSource === 'ml_api' ? 'ml_api' : 'og';
  return urls.map((url, index) => ({
    url,
    source: index === 0 && params.apiPictures.length > 0 ? 'ml_api' : source,
    sourceItemId: params.sourceItemId ?? null,
    pictureId: null,
    isPrimary: index === 0,
  }));
}
