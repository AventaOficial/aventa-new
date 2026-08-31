import { parsePriceText } from './parsePrice';

/** Descuento solo para preview local — no es dato definitivo. */
export function computePreviewDiscountPercent(
  price: number | null,
  originalPrice: number | null,
): number | null {
  if (price == null || originalPrice == null) return null;
  if (originalPrice <= 0 || price >= originalPrice) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export function formatMxPrice(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

export function sanitizePreviewText(text: string | null | undefined, maxLen = 500): string {
  if (!text) return '';
  return text.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

export function isValidHttpsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function normalizeOfferUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.href;
  } catch {
    return url.trim();
  }
}

export { parsePriceText };
