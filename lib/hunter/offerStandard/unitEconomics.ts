/**
 * Economía unitaria desde el título. No inventa precio ni pack size.
 */

export type UnitEconomicsHint = {
  packCount: number | null;
  unitLabel: string | null;
  unitPrice: number | null;
  raw: string | null;
};

const PACK_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /(\d+)\s*(?:rollos?|piezas?|pzas?|pza|unidades?|pz)\b/i, label: 'count' },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:l|lt|lts|litros?)\b/i, label: 'liter' },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilos?)\b/i, label: 'kg' },
  { re: /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:ml|g|gr|pza|pz)\b/i, label: 'pack' },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:ml)\b/i, label: 'ml' },
];

export function parseUnitEconomics(title: string, currentPrice: number | null): UnitEconomicsHint {
  const t = title.trim();
  if (!t) {
    return { packCount: null, unitLabel: null, unitPrice: null, raw: null };
  }
  for (const { re, label } of PACK_PATTERNS) {
    const m = t.match(re);
    if (!m) continue;
    const n = Number(String(m[1]).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) continue;
    const packCount = label === 'pack' && m[2] ? n : n;
    const unitPrice =
      currentPrice != null && currentPrice > 0 && packCount > 1
        ? Math.round((currentPrice / packCount) * 100) / 100
        : null;
    return {
      packCount,
      unitLabel: label,
      unitPrice,
      raw: m[0],
    };
  }
  return { packCount: null, unitLabel: null, unitPrice: null, raw: null };
}
