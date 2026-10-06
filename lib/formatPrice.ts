import { normalizePrice } from '@/lib/money/normalize';
import type { FxQuote } from '@/lib/money/types';
import { UNNORMALIZED_PRICE_LABEL } from '@/lib/money/types';

/**
 * Presentación de un importe que ya está en pesos MXN.
 * No convierte moneda. Quien no conoce la moneda usa presentOfferPrice.
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

function formatMinorMxn(minor: bigint): string {
  const hundred = BigInt(100);
  const pesos = minor / hundred;
  const cents = minor % hundred;
  const text = `${pesos.toString()}.${cents.toString().padStart(2, '0')}`;
  return formatPriceMXN(text);
}

/**
 * Única presentación de precio de oferta.
 * MXN solo si la moneda de origen es MXN, o si hay un tipo de cambio trazable.
 */
export function presentOfferPrice(
  amount: number | string | null | undefined,
  currency?: string | null,
  rate?: FxQuote | null,
  now?: Date,
): string {
  const money = normalizePrice({ amount, currency }, rate ?? null, now);
  if (money.status !== 'canonical') return UNNORMALIZED_PRICE_LABEL;
  return formatMinorMxn(money.canonicalAmountMinor);
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
