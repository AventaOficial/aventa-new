/**
 * Dinero de catálogo.
 *
 * source = lo que dijo el origen.
 * canonical = MXN en centavos enteros, solo si la moneda y el tipo de cambio
 * están determinados.
 * Un importe sin moneda no es MXN.
 */

export const CANONICAL_CURRENCY = 'MXN' as const;

export const UNNORMALIZED_PRICE_LABEL = 'Precio sin moneda confirmada';

export type FxQuote = {
  baseCurrency: string;
  quoteCurrency: typeof CANONICAL_CURRENCY;
  /** Centavos MXN por cada centavo de la moneda origen. */
  numerator: bigint;
  denominator: bigint;
  timestamp: string;
  source: string;
};

export type UnnormalizedReason =
  | 'missing_amount'
  | 'missing_currency'
  | 'unknown_currency'
  | 'missing_rate'
  | 'stale_rate'
  | 'invalid_rate'
  | 'invalid_amount'
  | 'negative';

export type NormalizedMoney =
  | {
      status: 'canonical';
      sourceAmountMinor: bigint;
      sourceCurrency: string;
      canonicalAmountMinor: bigint;
      canonicalCurrency: typeof CANONICAL_CURRENCY;
      fx: FxQuote | null;
    }
  | {
      status: 'unnormalized';
      reason: UnnormalizedReason;
      sourceAmountMinor: bigint | null;
      sourceCurrency: string | null;
      canonicalAmountMinor: null;
      canonicalCurrency: null;
      fx: null;
    };
