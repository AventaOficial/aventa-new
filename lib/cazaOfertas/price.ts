/**
 * CazaOfertasss — FASE 0. Normalización de precio y cálculo de descuento.
 *
 * Autoridad: esta capa es la ÚNICA que convierte un precio no confiable en un
 * número canónico, y la única que calcula descuento. No puntúa ni valida
 * evidencia.
 */

import {
  PRICE_DECIMALS,
  PRICE_MAX_VALUE,
  PRICE_MIN_VALUE,
  CAZAOFERTAS_CURRENCIES,
} from './constants';
import type { CazaCurrency, CazaResult } from './types';
import { failResult, okResult } from './types';

const CURRENCY_SET: ReadonlySet<string> = new Set<string>(CAZAOFERTAS_CURRENCIES);

/** Redondeo half-up estable a los decimales canónicos (evita el sesgo de toFixed). */
export function roundPrice(value: number, decimals: number = PRICE_DECIMALS): number {
  const factor = 10 ** decimals;
  // Epsilon relativo: corrige 1.005 * 100 = 100.49999999999999 sin inflar valores grandes.
  const scaled = value * factor;
  const corrected = scaled + Math.sign(scaled) * Math.abs(scaled) * Number.EPSILON;
  return Math.round(corrected) / factor;
}

/**
 * Convierte un precio de origen no confiable en un número canónico.
 * Acepta string con separadores mexicanos ("1,299.00", "$1,299", "1 299,00").
 */
export function normalizePrice(raw: unknown): CazaResult<number> {
  if (typeof raw === 'number') {
    return validateNumericPrice(raw);
  }
  if (typeof raw !== 'string') {
    return failResult([`price.type_invalid:${typeof raw}`]);
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) return failResult(['price.empty']);

  // Quita símbolos de moneda, espacios duros y sufijos de moneda.
  let cleaned = trimmed
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/(mxn|mx\$|usd|\$)/gi, '');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // El separador decimal es el último que aparece; el otro es de miles.
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    cleaned = cleaned.split(thousandSep).join('');
    if (decimalSep === ',') cleaned = cleaned.replace(',', '.');
  } else if (lastComma >= 0) {
    // "1,299" = miles; "1,29" = decimal. Tres dígitos tras la coma ⇒ miles.
    const afterComma = cleaned.length - lastComma - 1;
    cleaned = afterComma === 3 ? cleaned.split(',').join('') : cleaned.replace(',', '.');
  }

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return failResult(['price.unparseable']);
  }

  return validateNumericPrice(Number(cleaned));
}

function validateNumericPrice(value: number): CazaResult<number> {
  if (!Number.isFinite(value)) return failResult(['price.not_finite']);
  if (value < 0) return failResult(['price.negative']);
  if (value === 0) return failResult(['price.zero']);
  const rounded = roundPrice(value);
  if (rounded < PRICE_MIN_VALUE) return failResult(['price.below_minimum']);
  if (rounded > PRICE_MAX_VALUE) return failResult(['price.above_maximum']);
  return okResult(rounded);
}

export function normalizeCurrency(raw: unknown): CazaResult<CazaCurrency> {
  if (typeof raw !== 'string') return failResult([`currency.type_invalid:${typeof raw}`]);
  const upper = raw.trim().toUpperCase();
  if (!CURRENCY_SET.has(upper)) return failResult([`currency.unsupported:${upper || 'empty'}`]);
  return okResult(upper as CazaCurrency);
}

export function currenciesMatch(a: unknown, b: unknown): boolean {
  const left = normalizeCurrency(a);
  const right = normalizeCurrency(b);
  return left.ok && right.ok && left.value === right.value;
}

export interface DiscountComputation {
  readonly discountPercent: number;
  readonly savings: number;
  readonly reasons: readonly string[];
}

/**
 * Descuento entero 0–99 desde precios ya normalizados.
 *
 * Invariantes:
 *  - sin referencia ⇒ 0 (no se infiere descuento)
 *  - referencia <= actual ⇒ 0 (no hay descuento negativo)
 *  - truncado (floor), nunca redondeado hacia arriba: no exageramos la ganga
 */
export function computeDiscountPercent(
  currentPrice: number,
  referencePrice: number | null
): CazaResult<DiscountComputation> {
  const current = validateNumericPrice(currentPrice);
  if (!current.ok) return failResult(current.reasons.map((r) => `current_${r}`));

  if (referencePrice === null) {
    return okResult({ discountPercent: 0, savings: 0, reasons: ['discount.no_reference'] });
  }

  const reference = validateNumericPrice(referencePrice);
  if (!reference.ok) return failResult(reference.reasons.map((r) => `reference_${r}`));

  if (reference.value <= current.value) {
    return okResult({
      discountPercent: 0,
      savings: 0,
      reasons: ['discount.reference_not_above_current'],
    });
  }

  const savings = roundPrice(reference.value - current.value);
  const discountPercent = Math.floor((savings / reference.value) * 100);

  return okResult({
    discountPercent,
    savings,
    reasons: ['discount.computed_from_reference'],
  });
}
