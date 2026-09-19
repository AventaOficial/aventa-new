/**
 * CazaOfertasss — FASE 0. Contratos de normalización de precio y descuento.
 */

import { describe, expect, it } from 'vitest';

import {
  computeDiscountPercent,
  currenciesMatch,
  normalizeCurrency,
  normalizePrice,
  roundPrice,
} from '@/lib/cazaOfertas';

describe('normalizePrice', () => {
  it('acepta números finitos y los redondea a 2 decimales', () => {
    const r = normalizePrice(1999.456);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(1999.46);
  });

  it('parsea formato mexicano con separador de miles y decimales', () => {
    for (const [raw, expected] of [
      ['$1,299.00', 1299],
      ['1,299', 1299],
      ['1 299,00', 1299],
      ['12.345,67', 12345.67],
      ['12,345.67', 12345.67],
      ['1299 MXN', 1299],
      ['1,29', 1.29],
    ] as const) {
      const r = normalizePrice(raw);
      expect(r.ok, `esperaba parsear ${raw}`).toBe(true);
      if (!r.ok) continue;
      expect(r.value, `valor de ${raw}`).toBe(expected);
    }
  });

  it('rechaza precios negativos', () => {
    const r = normalizePrice(-10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('price.negative');
  });

  it('rechaza precio cero', () => {
    const r = normalizePrice(0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('price.zero');
  });

  it('rechaza cero expresado como texto', () => {
    const r = normalizePrice('$0.00');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('price.zero');
  });

  it('rechaza input malformado sin lanzar', () => {
    for (const raw of [null, undefined, {}, [], NaN, Infinity, '', '   ', 'gratis', '12.3.4']) {
      const r = normalizePrice(raw);
      expect(r.ok, `esperaba rechazar ${String(raw)}`).toBe(false);
    }
  });

  it('rechaza valores por encima del techo defensivo', () => {
    const r = normalizePrice(99_999_999);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('price.above_maximum');
  });

  it('roundPrice es half-up estable en el caso clásico 1.005', () => {
    expect(roundPrice(1.005)).toBe(1.01);
    expect(roundPrice(2.675)).toBe(2.68);
  });
});

describe('normalizeCurrency', () => {
  it('acepta MXN en cualquier caja', () => {
    expect(normalizeCurrency('mxn')).toEqual({ ok: true, value: 'MXN' });
    expect(normalizeCurrency(' MXN ')).toEqual({ ok: true, value: 'MXN' });
  });

  it('rechaza monedas fuera del alcance de FASE 0', () => {
    const r = normalizeCurrency('USD');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('currency.unsupported:USD');
  });

  it('detecta mismatch de moneda', () => {
    expect(currenciesMatch('MXN', 'mxn')).toBe(true);
    expect(currenciesMatch('MXN', 'USD')).toBe(false);
    expect(currenciesMatch('MXN', null)).toBe(false);
  });
});

describe('computeDiscountPercent', () => {
  it('trunca hacia abajo: nunca exagera la ganga', () => {
    const r = computeDiscountPercent(1999, 3499);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 1500 / 3499 = 42.869...  ⇒ 42, no 43
    expect(r.value.discountPercent).toBe(42);
    expect(r.value.savings).toBe(1500);
  });

  it('sin referencia no infiere descuento', () => {
    const r = computeDiscountPercent(1999, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.discountPercent).toBe(0);
    expect(r.value.reasons).toContain('discount.no_reference');
  });

  it('referencia menor o igual al precio actual no produce descuento negativo', () => {
    for (const reference of [1999, 1500]) {
      const r = computeDiscountPercent(1999, reference);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.value.discountPercent).toBe(0);
      expect(r.value.reasons).toContain('discount.reference_not_above_current');
    }
  });

  it('propaga el rechazo de precios inválidos con prefijo de origen', () => {
    const negativeCurrent = computeDiscountPercent(-1, 100);
    expect(negativeCurrent.ok).toBe(false);
    if (!negativeCurrent.ok) {
      expect(negativeCurrent.reasons).toContain('current_price.negative');
    }

    const zeroReference = computeDiscountPercent(100, 0);
    expect(zeroReference.ok).toBe(false);
    if (!zeroReference.ok) {
      expect(zeroReference.reasons).toContain('reference_price.zero');
    }
  });
});
