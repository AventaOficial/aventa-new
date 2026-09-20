/**
 * Formatea un valor numérico como precio en MXN (solo presentación, sin conversión).
 * Acepta number o string (p. ej. numeric de Supabase) y convierte a number antes de formatear.
 */
const formatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

/** Presentación de input (miles + hasta 2 decimales). Nunca persistir este string. */
const moneyInputFormatter = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPriceMXN(value: number | string): string {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return formatter.format(0) + ' MXN';
  }
  return formatter.format(amount) + ' MXN';
}

/**
 * Display-only money for offer form inputs (e.g. 19999.99 → "19,999.99" under es-MX).
 * Canonical persistence must use a number via parseOfferEditMoney / Number.
 */
export function formatOfferMoneyInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n =
    typeof value === 'number'
      ? value
      : Number(String(value).trim().replace(/,/g, ''));
  if (!Number.isFinite(n)) return '';
  return moneyInputFormatter.format(n);
}

/**
 * Buffer de tecleo para inputs de precio: dígitos, comas de miles y un punto decimal.
 * No es el valor canónico; blur/submit usan formatOfferMoneyInput / parseOfferEditMoney.
 */
export function sanitizeOfferMoneyTyping(raw: string): string {
  let out = '';
  let sawDot = false;
  let decDigits = 0;
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      if (sawDot) {
        if (decDigits >= 2) continue;
        decDigits += 1;
      }
      out += ch;
    } else if (ch === ',' && !sawDot) {
      out += ',';
    } else if (ch === '.' && !sawDot) {
      sawDot = true;
      out += '.';
    }
  }
  return out;
}
