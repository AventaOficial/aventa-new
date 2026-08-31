/**
 * Parsea texto de precio (MX/US) a número.
 * Solo para preview en extensión — el servidor valida el valor final.
 */
export function parsePriceText(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.replace(/[^\d.,]/g, '').trim();
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot < 0) {
    const afterComma = s.slice(lastComma + 1);
    if (/^\d{3}$/.test(afterComma)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  } else if (lastDot >= 0 && lastComma < 0) {
    const afterDot = s.slice(lastDot + 1);
    if (/^\d{3}$/.test(afterDot)) {
      s = s.replace(/\./g, '');
    }
  } else if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
