import type { PromotionKind } from './types';

export type ScannedPromotion = {
  kind: PromotionKind | null;
  explicitDiscountPercent: number | null;
  explicitSavings: number | null;
  genericOfferWording: boolean;
};

const KIND_PATTERNS: Array<{ kind: PromotionKind; re: RegExp }> = [
  { kind: '2x1', re: /(?:^|[^\w])2\s*[x×]\s*1(?![\w])/i },
  { kind: '3x2', re: /(?:^|[^\w])3\s*[x×]\s*2(?![\w])/i },
  { kind: 'quantity_discount', re: /\blleva\s+\d+\s+paga\s+\d+\b/i },
  { kind: 'coupon', re: /\bcup[oó]nes?\b/i },
  { kind: 'liquidation', re: /\bliquidaci[oó]n\b/i },
  { kind: 'special_price', re: /\bprecio\s+especial\b/i },
  { kind: 'combo', re: /\bcombo\s*[-–:]\s*\d|2x\$\s*\d/i },
];

function finitePositive(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Extrae promociones de texto ligado al producto (JSON-LD name/description/offers).
 * No usar contra HTML global de navegación.
 */
export function scanProductBoundPromotionText(text: string | null | undefined): ScannedPromotion {
  const raw = (text ?? '').trim();
  if (!raw) {
    return {
      kind: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      genericOfferWording: false,
    };
  }

  let kind: PromotionKind | null = null;
  for (const row of KIND_PATTERNS) {
    if (row.re.test(raw)) {
      kind = row.kind;
      break;
    }
  }

  let explicitDiscountPercent: number | null = null;
  const pct = raw.match(/(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:de\s+)?(?:desc\.|descuento)/i);
  if (pct?.[1]) {
    explicitDiscountPercent = finitePositive(Number(pct[1].replace(',', '.')));
  }

  let explicitSavings: number | null = null;
  const sav = raw.match(/ahorro(?:\s+de)?\s*\$?\s*(\d+(?:[.,]\d+)?)/i);
  if (sav?.[1]) {
    explicitSavings = finitePositive(Number(sav[1].replace(',', '.')));
  }

  const genericOfferWording =
    kind == null &&
    explicitDiscountPercent == null &&
    explicitSavings == null &&
    /\b(?:oferta|descuento|promoci[oó]n)\b/i.test(raw);

  return { kind, explicitDiscountPercent, explicitSavings, genericOfferWording };
}

export function joinProductBoundTexts(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(' · ');
}
