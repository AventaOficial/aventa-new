import { describe, it, expect } from 'vitest';
import { BANK_COUPON_OPTIONS, getBankCouponLabel, normalizeBankCoupon } from '../../lib/bankCoupons';

describe('Contrato de cupón bancario', () => {
  it('catálogo no contiene duplicados', () => {
    const values = BANK_COUPON_OPTIONS.map((b) => b.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('normaliza valores válidos e ignora inválidos', () => {
    expect(normalizeBankCoupon('BBVA')).toBe('bbva');
    expect(normalizeBankCoupon('  banorte  ')).toBe('banorte');
    expect(normalizeBankCoupon('desconocido')).toBeNull();
    expect(normalizeBankCoupon('')).toBeNull();
  });

  it('resuelve etiqueta para UI', () => {
    expect(getBankCouponLabel('bbva')).toBe('BBVA');
    expect(getBankCouponLabel('rappi-card')).toBe('RappiCard');
    expect(getBankCouponLabel('invalido')).toBeNull();
  });
});
