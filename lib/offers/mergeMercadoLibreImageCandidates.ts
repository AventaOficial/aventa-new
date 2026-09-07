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
}): string[] {
  const api = normalizeList(params.apiPictures ?? []);
  const html = normalizeList(params.htmlImages ?? []);
  const trusted = normalizeList(params.trustedHtmlImages ?? []);
  const minApi = params.minApiPicturesToSkipHtml ?? 2;

  if (api.length >= minApi) {
    return api;
  }

  if (api.length === 1) {
    const cover = api[0];
    const sameResourceVariants = html.filter((h) => sameMlProductResource(cover, h));
    return normalizeList([cover, ...sameResourceVariants]);
  }

  // Sin galería API: solo meta confiable (nunca CDN global de similares).
  if (trusted.length > 0) return trusted;
  return [];
}
