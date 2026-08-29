import { OFFER_MAX_IMAGES } from '@/lib/contracts/offers';

/** Candidatas internas antes de ranking; la publicación siempre corta a OFFER_MAX_IMAGES. */
export const OFFER_IMAGE_CANDIDATE_CAP = 24;

export type SelectOfferImagesOptions = {
  preferredCover?: string | null;
  limit?: number;
};

function tryUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function pathnameKey(raw: string): string {
  const u = tryUrl(raw);
  if (!u) return raw.trim().split('?')[0] ?? raw.trim();
  return `${u.hostname.toLowerCase()}${u.pathname}`;
}

/** Id de recurso Amazon (`…/images/I/71ABC.…`) para unificar resoluciones. */
export function amazonImageResourceId(raw: string): string | null {
  const path = tryUrl(raw)?.pathname ?? raw;
  const m = path.match(/\/images\/I\/([A-Za-z0-9]+)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Id de foto Mercado Libre para unificar variantes (-I / -O / -OO / -F / -G) del mismo recurso. */
export function mercadoLibreImageResourceId(raw: string): string | null {
  if (!/mlstatic\.com/i.test(raw)) return null;
  const path = tryUrl(raw)?.pathname ?? raw;
  const file = path.split('/').pop();
  if (!file) return null;
  const stem = file.replace(/\.(jpg|jpeg|webp|png)$/i, '');
  const m = stem.match(/^D_(?:NQ_NP_2X_|NQ_NP_|NQ_|Q_NP_)?(.+)$/i);
  if (!m) return null;
  const token = m[1]
    .replace(/^2X_/i, '')
    .replace(/-(?:I|O|OO|F|G|V|T)$/i, '');
  return token ? token.toUpperCase() : null;
}

function resourceKey(raw: string): string {
  const amz = amazonImageResourceId(raw);
  if (amz) return `amz:${amz}`;
  const ml = mercadoLibreImageResourceId(raw);
  if (ml) return `ml:${ml}`;
  return `path:${pathnameKey(raw)}`;
}

/**
 * Basura de alta confianza. No usa palabras ambiguas (`logo`) porque
 * pueden ser fotos reales del producto.
 */
export function isHighConfidenceJunkImage(raw: string): boolean {
  const lower = raw.toLowerCase();
  const path = (tryUrl(raw)?.pathname ?? raw).toLowerCase();
  if (/favicon/i.test(path)) return true;
  if (/(^|\/)sprite([._/-]|$)/i.test(path)) return true;
  if (/grey-pixel|gray-pixel|transparent-pixel|spacer\.gif/i.test(lower)) return true;
  if (/\/placeholder(\.|_)/i.test(path) || /placehold\.co|placeholder\.png/i.test(lower)) return true;
  if (/1x1|pixel\.gif|tracking[_-]?pixel/i.test(lower)) return true;
  if (/\/adsystem\/|doubleclick\.net|pixel\?|beacon/i.test(lower)) return true;
  return false;
}

function isTinyAmazonThumb(raw: string): boolean {
  return /_AC_US\d{1,2}_|_SS\d{1,2}_|_SR\d{1,3},\d{1,3}_|_US\d{1,2}_/i.test(raw);
}

function qualityScore(raw: string, preferredCover: string | null, index: number): number {
  let score = 0;
  if (preferredCover && resourceKey(raw) === resourceKey(preferredCover)) score += 800;
  if (preferredCover && raw === preferredCover) score += 400;
  if (/hiRes|mainUrl|_AC_SL\d{3,4}_|_SL1[2-9]00_|_SL2\d{3}_/i.test(raw)) score += 80;
  if (/-O\.(jpg|jpeg|webp|png)/i.test(raw) || /D_NQ_NP_2X_/i.test(raw)) score += 70;
  if (isTinyAmazonThumb(raw) || /-I\.(jpg|jpeg|webp|png)/i.test(raw) || /D_Q_NP_/i.test(raw)) {
    score -= 40;
  }
  score -= index * 0.01;
  return score;
}

/**
 * Candidatas → dedupe → quitar basura de alta confianza → ranking → top N.
 * Portada preferida queda primero cuando coincide un recurso.
 */
export function selectOfferImages(
  urls: string[],
  opts: SelectOfferImagesOptions = {},
): string[] {
  const limit = opts.limit ?? OFFER_MAX_IMAGES;
  const preferredCover = opts.preferredCover?.trim() || null;
  const bestByResource = new Map<string, { url: string; score: number; index: number }>();

  urls.forEach((raw, index) => {
    if (typeof raw !== 'string') return;
    const url = raw.trim();
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (isHighConfidenceJunkImage(url)) return;

    const key = resourceKey(url);
    const score = qualityScore(url, preferredCover, index);
    const prev = bestByResource.get(key);
    if (!prev || score > prev.score) {
      bestByResource.set(key, { url, score, index });
    }
  });

  const ranked = [...bestByResource.values()].sort((a, b) => b.score - a.score || a.index - b.index);
  const picked = ranked.slice(0, Math.max(0, limit)).map((x) => x.url);

  if (preferredCover && picked.length > 0) {
    const prefKey = resourceKey(preferredCover);
    const idx = picked.findIndex((u) => resourceKey(u) === prefKey);
    if (idx > 0) {
      const [cover] = picked.splice(idx, 1);
      picked.unshift(cover);
    }
  }

  return picked;
}

/** Contrato de persistencia: portada + extras, máximo OFFER_MAX_IMAGES en total. */
export function splitCoverAndExtras(gallery: string[]): { cover: string | null; extras: string[] } {
  const unique = selectOfferImages(gallery, { preferredCover: gallery[0] ?? null });
  return {
    cover: unique[0] ?? null,
    extras: unique.slice(1),
  };
}
