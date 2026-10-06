import type { FxQuote, NormalizedMoney, UnnormalizedReason } from './types';
import { CANONICAL_CURRENCY } from './types';

/** Una cotización más vieja que esto no se usa. No se sustituye por otra. */
export const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ISO = /^[A-Z]{3}$/;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);
const SAFE_MINOR = BigInt('9007199254740991');

export type PriceInput = {
  amount: number | string | null | undefined;
  currency: string | null | undefined;
};

function unnormalized(
  reason: UnnormalizedReason,
  sourceAmountMinor: bigint | null,
  sourceCurrency: string | null,
): NormalizedMoney {
  return {
    status: 'unnormalized',
    reason,
    sourceAmountMinor,
    sourceCurrency,
    canonicalAmountMinor: null,
    canonicalCurrency: null,
    fx: null,
  };
}

function decimalText(amount: number | string): string | null {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) return null;
    if (Object.is(amount, -0)) return '0';
    if (Number.isInteger(amount)) {
      if (!Number.isSafeInteger(amount)) return null;
      return String(amount);
    }
    const text = amount.toString();
    if (/e/i.test(text)) return null;
    return text;
  }
  const text = amount.trim();
  return text ? text : null;
}

/** Convierte un importe mayor a centavos enteros. Redondeo half-up. */
export function majorToMinor(amount: number | string): bigint | null {
  const text = decimalText(amount);
  if (!text || !/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
  const negative = text.startsWith('-');
  const unsigned = text.replace(/^[+-]/, '');
  const [whole, frac = ''] = unsigned.split('.');
  const centsText = (frac + '00').slice(0, 2);
  const roundUp = (frac + '000').charAt(2) >= '5';
  let minor = BigInt(whole) * HUNDRED + BigInt(centsText);
  if (roundUp) minor += ONE;
  if (minor > SAFE_MINOR) return null;
  return negative ? -minor : minor;
}

function roundMulDiv(amount: bigint, numerator: bigint, denominator: bigint): bigint | null {
  if (denominator <= ZERO || numerator <= ZERO) return null;
  const negative = amount < ZERO;
  const abs = negative ? -amount : amount;
  const product = abs * numerator;
  const quotient = product / denominator;
  const remainder = product % denominator;
  const rounded = remainder * TWO >= denominator ? quotient + ONE : quotient;
  if (rounded > SAFE_MINOR) return null;
  return negative ? -rounded : rounded;
}

export function normalizePrice(
  input: PriceInput,
  rate: FxQuote | null,
  now: Date = new Date(),
): NormalizedMoney {
  if (input.amount === null || input.amount === undefined || input.amount === '') {
    return unnormalized('missing_amount', null, null);
  }
  const minor = majorToMinor(input.amount);
  if (minor === null) return unnormalized('invalid_amount', null, null);
  if (minor < ZERO) return unnormalized('negative', minor, null);

  const currency = input.currency?.trim().toUpperCase() ?? '';
  if (!currency) return unnormalized('missing_currency', minor, null);
  if (!ISO.test(currency)) return unnormalized('unknown_currency', minor, currency);

  if (currency === CANONICAL_CURRENCY) {
    return {
      status: 'canonical',
      sourceAmountMinor: minor,
      sourceCurrency: currency,
      canonicalAmountMinor: minor,
      canonicalCurrency: CANONICAL_CURRENCY,
      fx: null,
    };
  }

  if (!rate) return unnormalized('missing_rate', minor, currency);
  if (rate.baseCurrency !== currency || rate.quoteCurrency !== CANONICAL_CURRENCY) {
    return unnormalized('invalid_rate', minor, currency);
  }
  const stamped = Date.parse(rate.timestamp);
  if (!Number.isFinite(stamped)) return unnormalized('invalid_rate', minor, currency);
  if (now.getTime() - stamped > FX_MAX_AGE_MS || stamped > now.getTime() + 60_000) {
    return unnormalized('stale_rate', minor, currency);
  }
  const canonical = roundMulDiv(minor, rate.numerator, rate.denominator);
  if (canonical === null || canonical < ZERO) return unnormalized('invalid_rate', minor, currency);
  return {
    status: 'canonical',
    sourceAmountMinor: minor,
    sourceCurrency: currency,
    canonicalAmountMinor: canonical,
    canonicalCurrency: CANONICAL_CURRENCY,
    fx: rate,
  };
}
