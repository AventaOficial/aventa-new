import {
  mergeMlImageCandidates,
  type MlImageCandidate,
  type MlImageProvenanceSource,
} from '@/lib/offers/mlImageProvenance';
import { mercadoLibreImageResourceId } from '@/lib/offers/selectOfferImages';

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
 * - API === 1: API + variantes HTML del MISMO recurso (mejor resolución); nunca relacionados.
 * - API === 0: solo HTML de confianza (og/twitter/meta), nunca scrape CDN global.
 */
export function mergeMercadoLibreImageCandidates(params: {
  apiPictures: string[];
  /** Scrape amplio (puede incluir similares). Solo se usa filtrado por mismo recurso. */
  htmlImages?: string[];
  /** Meta de alta confianza (og/twitter). Usado cuando API = 0. */
  trustedHtmlImages?: string[];
  /** Preferir 'ml_api' cuando vino de /items|/products autenticado. */
  mlSource?: string | null;
  /** Mínimo de fotos API para descartar HTML por completo. Default 2. */
  minApiPicturesToSkipHtml?: number;
  sourceItemId?: string | null;
}): string[] {
  const api = normalizeList(params.apiPictures ?? []);
  const html = normalizeList(params.htmlImages ?? []);
  const trusted = normalizeList(params.trustedHtmlImages ?? []);
  const minApi = params.minApiPicturesToSkipHtml ?? 2;
  const itemId = params.sourceItemId ?? null;

  if (api.length >= minApi) {
    return mergeMlImageCandidates(
      [toCandidates(api, params.mlSource === 'ml_api' ? 'ml_api' : 'ml_api', itemId)],
      { minApiToSkipFallback: minApi, sourceItemId: itemId },
    ).map((c) => c.url);
  }

  if (api.length === 1) {
    const cover = api[0];
    const sameResourceVariants = html.filter((h) => sameMlProductResource(cover, h));
    return mergeMlImageCandidates(
      [
        toCandidates(api, 'ml_api', itemId),
        toCandidates(sameResourceVariants, 'same_resource', itemId),
      ],
      { minApiToSkipFallback: minApi, sourceItemId: itemId },
    ).map((c) => c.url);
  }

  if (trusted.length > 0) {
    return mergeMlImageCandidates([toCandidates(trusted, 'og', itemId)], {
      minApiToSkipFallback: minApi,
      sourceItemId: itemId,
    }).map((c) => c.url);
  }
  return [];
}

export function mergeMercadoLibreImageCandidatesDetailed(params: {
  apiPictures: string[];
  htmlImages?: string[];
  trustedHtmlImages?: string[];
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
