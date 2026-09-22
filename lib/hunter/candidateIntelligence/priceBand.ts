/**
 * Price-band analytical dimension (not a gate).
 */

export type PriceBand = '0-500' | '500-1500' | '1500-5000' | '5000+' | null;

export function priceBandForSale(sale: number | null | undefined): PriceBand {
  if (sale == null || !Number.isFinite(sale) || sale < 0) return null;
  if (sale < 500) return '0-500';
  if (sale < 1500) return '500-1500';
  if (sale < 5000) return '1500-5000';
  return '5000+';
}
