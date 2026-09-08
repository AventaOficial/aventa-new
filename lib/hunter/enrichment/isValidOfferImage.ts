import { normalizeOfferImageUrl } from '@/lib/offerPath';
import { isHighConfidenceJunkImage } from '@/lib/offers/selectOfferImages';

function tryUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

/**
 * Imagen de producto usable. Reutiliza junk-detector existente + normalización.
 * Determinista. Sin IA.
 */
export function isValidOfferImage(raw: string | null | undefined): boolean {
  const normalized = normalizeOfferImageUrl(raw);
  if (!normalized) return false;
  if (normalized.startsWith('data:')) return false;
  if (!/^https:\/\//i.test(normalized)) return false;
  if (isHighConfidenceJunkImage(normalized)) return false;

  const lower = normalized.toLowerCase();
  const path = (tryUrl(normalized)?.pathname ?? normalized).toLowerCase();

  if (/\/placeholder(\.|_)/i.test(path) || /placeholder\.png|placehold\.co/i.test(lower)) {
    return false;
  }
  if (/favicon|sprite|banner|\/ads\/|\/ad\/|pixel\.gif|1x1/i.test(path)) return false;
  if (/\/logo\.(?:png|webp|jpg|jpeg|svg)(?:$|[?#])/i.test(path)) return false;
  if (/_AC_US\d{1,2}_|_SS\d{1,2}_|_SR\d{1,3},\d{1,3}_/i.test(normalized)) return false;
  if (/\.(svg|gif|ico)(?:$|[?#])/i.test(path) && /logo|icon|sprite/i.test(path)) return false;

  return true;
}

export function firstValidOfferImage(urls: Array<string | null | undefined>): string | null {
  for (const u of urls) {
    const n = normalizeOfferImageUrl(u);
    if (n && isValidOfferImage(n)) return n;
  }
  return null;
}
