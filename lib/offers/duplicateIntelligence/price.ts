import { majorToMinor } from '@/lib/money/normalize';
import type { PriceComparison } from './types';

const ISO = /^[A-Z]{3}$/;
const SIMILAR_PERCENT = 1;
const ZERO = BigInt(0);

function unknown(reason: Extract<PriceComparison, { status: 'unknown' }>['reason']): PriceComparison {
  return { status: 'unknown', reason };
}

/**
 * Compara importes solo cuando ambas monedas están declaradas y son la misma.
 * No convierte y no asume MXN.
 */
export function compareOfferPrices(input: {
  newAmount: number | string | null | undefined;
  newCurrency: string | null | undefined;
  existingAmount: number | string | null | undefined;
  existingCurrency: string | null | undefined;
}): PriceComparison {
  if (input.newAmount == null || input.existingAmount == null || input.newAmount === '' || input.existingAmount === '') {
    return unknown('missing_price');
  }
  const next = majorToMinor(input.newAmount);
  const current = majorToMinor(input.existingAmount);
  if (next === null || current === null || next < ZERO || current < ZERO) return unknown('invalid_price');
  if (current === ZERO) return unknown('invalid_price');

  const nextCurrency = input.newCurrency?.trim().toUpperCase() ?? '';
  const currentCurrency = input.existingCurrency?.trim().toUpperCase() ?? '';
  if (!nextCurrency || !currentCurrency) return unknown('missing_currency');
  if (!ISO.test(nextCurrency) || !ISO.test(currentCurrency)) return unknown('missing_currency');
  if (nextCurrency !== currentCurrency) return unknown('currency_mismatch');

  const difference = next - current;
  const percentage = (Number(difference) / Number(current)) * 100;
  const absolute = difference < ZERO ? -difference : difference;
  const percentAbs = Math.abs(percentage);
  const direction = percentAbs <= SIMILAR_PERCENT ? 'similar' : difference < ZERO ? 'better' : 'worse';
  return {
    status: 'compared',
    direction,
    absoluteDifferenceMinor: absolute,
    percentage: Math.round(percentAbs * 100) / 100,
  };
}
