import { describe, expect, it } from 'vitest';
import { majorToMinor, normalizePrice } from '@/lib/money/normalize';
import { presentOfferPrice } from '@/lib/formatPrice';
import { UNNORMALIZED_PRICE_LABEL } from '@/lib/money/types';
import type { FxQuote } from '@/lib/money/types';

const NOW = new Date('2026-10-06T18:00:00.000Z');

function usdRate(overrides: Partial<FxQuote> = {}): FxQuote {
  return {
    baseCurrency: 'USD',
    quoteCurrency: 'MXN',
    numerator: 1800n,
    denominator: 100n,
    timestamp: '2026-10-06T17:00:00.000Z',
    source: 'test-quote',
    ...overrides,
  };
}

describe('normalizePrice', () => {
  it('MXN se conserva sin tipo de cambio', () => {
    const money = normalizePrice({ amount: 19.99, currency: 'MXN' }, null, NOW);
    expect(money.status).toBe('canonical');
    if (money.status !== 'canonical') return;
    expect(money.canonicalAmountMinor).toBe(1999n);
    expect(money.sourceAmountMinor).toBe(1999n);
    expect(money.canonicalCurrency).toBe('MXN');
    expect(money.fx).toBeNull();
    expect(presentOfferPrice(19.99, 'MXN', null, NOW)).toContain('MXN');
    expect(presentOfferPrice(19.99, 'MXN', null, NOW)).not.toBe(UNNORMALIZED_PRICE_LABEL);
  });

  it('USD usa la cotización y conserva el origen', () => {
    const money = normalizePrice({ amount: '19.99', currency: 'usd' }, usdRate(), NOW);
    expect(money.status).toBe('canonical');
    if (money.status !== 'canonical') return;
    expect(money.sourceCurrency).toBe('USD');
    expect(money.sourceAmountMinor).toBe(1999n);
    expect(money.canonicalAmountMinor).toBe(35982n);
    expect(money.fx?.source).toBe('test-quote');
  });

  it('EUR sigue el mismo contrato', () => {
    const money = normalizePrice(
      { amount: 10, currency: 'EUR' },
      {
        baseCurrency: 'EUR',
        quoteCurrency: 'MXN',
        numerator: 2000n,
        denominator: 100n,
        timestamp: '2026-10-06T17:00:00.000Z',
        source: 'test-quote',
      },
      NOW,
    );
    expect(money.status).toBe('canonical');
    if (money.status !== 'canonical') return;
    expect(money.canonicalAmountMinor).toBe(20000n);
    expect(money.sourceAmountMinor).toBe(1000n);
  });

  it('moneda desconocida no se presenta como MXN', () => {
    const money = normalizePrice({ amount: 10, currency: '$' }, usdRate(), NOW);
    expect(money).toMatchObject({ status: 'unnormalized', reason: 'unknown_currency' });
    expect(presentOfferPrice(10, '$', usdRate(), NOW)).toBe(UNNORMALIZED_PRICE_LABEL);
  });

  it('moneda ausente no se presenta como MXN', () => {
    const money = normalizePrice({ amount: 10, currency: null }, usdRate(), NOW);
    expect(money).toMatchObject({ status: 'unnormalized', reason: 'missing_currency' });
    expect(presentOfferPrice(10, null, usdRate(), NOW)).toBe(UNNORMALIZED_PRICE_LABEL);
  });

  it('sin cotización no convierte', () => {
    const money = normalizePrice({ amount: 10, currency: 'USD' }, null, NOW);
    expect(money).toMatchObject({ status: 'unnormalized', reason: 'missing_rate' });
  });

  it('cotización vieja no convierte', () => {
    const money = normalizePrice(
      { amount: 10, currency: 'USD' },
      usdRate({ timestamp: '2026-10-04T17:00:00.000Z' }),
      NOW,
    );
    expect(money).toMatchObject({ status: 'unnormalized', reason: 'stale_rate' });
  });

  it('redondea half-up el tercer decimal', () => {
    expect(majorToMinor('10.005')).toBe(1001n);
    expect(majorToMinor('10.004')).toBe(1000n);
  });

  it('rechaza negativo, inválido y cero se conserva', () => {
    expect(normalizePrice({ amount: -1, currency: 'MXN' }, null, NOW).status).toBe('unnormalized');
    expect(normalizePrice({ amount: Number.NaN, currency: 'MXN' }, null, NOW)).toMatchObject({
      reason: 'invalid_amount',
    });
    const zero = normalizePrice({ amount: 0, currency: 'MXN' }, null, NOW);
    expect(zero).toMatchObject({ status: 'canonical', canonicalAmountMinor: 0n, sourceAmountMinor: 0n });
  });

  it('un importe grande que no cabe en entero seguro no se normaliza', () => {
    const money = normalizePrice({ amount: '90071992547410.00', currency: 'MXN' }, null, NOW);
    expect(money).toMatchObject({ status: 'unnormalized', reason: 'invalid_amount' });
  });
});
