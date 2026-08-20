import { describe, expect, it } from 'vitest';
import {
  computeMlPriceIntel,
  normalizeMlProductId,
  type MlDailySnapshot,
} from '@/lib/bots/ingest/mlPriceEngine';

function day(recordedOn: string, lastPrice: number, minPrice = lastPrice): MlDailySnapshot {
  return { recordedOn, lastPrice, minPrice, listPrice: null, regularPrice: null };
}

describe('normalizeMlProductId', () => {
  it('normaliza item id y URL de Mercado Libre', () => {
    expect(normalizeMlProductId('MLM-1234567890')).toBe('MLM1234567890');
    expect(normalizeMlProductId('https://articulo.mercadolibre.com.mx/MLM-1234567890-foo-_JM')).toBe(
      'MLM1234567890'
    );
  });
});

describe('computeMlPriceIntel', () => {
  it('sin historial suficiente no finge un mínimo de 90 días', () => {
    const intel = computeMlPriceIntel(
      { current: 999, listPrice: 1999, regularPrice: 999 },
      [day('2026-08-19', 999)],
      '2026-08-19'
    );
    expect(intel.historyReady).toBe(false);
    expect(intel.lowest90d).toBeNull();
    expect(intel.priceVsLowest90dPct).toBeNull();
    expect(intel.effectiveDiscountPercent).toBe(0);
  });

  it('etiqueta inflada vs precio estándar de ML es descuento falso', () => {
    const intel = computeMlPriceIntel(
      { current: 4699, listPrice: 8999, regularPrice: 4699 },
      [],
      '2026-08-19'
    );
    expect(intel.suspectedArtificialListPrice).toBe(true);
    expect(intel.effectiveDiscountPercent).toBe(0);
  });

  it('usa el precio habitual de 30 días, no la etiqueta', () => {
    const history: MlDailySnapshot[] = [
      day('2026-07-20', 5899),
      day('2026-07-27', 5899),
      day('2026-08-03', 5799),
      day('2026-08-10', 5899),
      day('2026-08-17', 5899),
    ];
    const intel = computeMlPriceIntel(
      { current: 4699, listPrice: 5899, regularPrice: 5899 },
      history,
      '2026-08-19'
    );
    expect(intel.historyReady).toBe(true);
    expect(intel.habitual30d).toBeGreaterThan(5000);
    expect(intel.savingsVsHabitualPct).toBeGreaterThan(15);
    expect(intel.effectiveDiscountPercent).toBeGreaterThanOrEqual(15);
    expect(intel.suspectedArtificialListPrice).toBe(false);
  });

  it('si el precio actual no bajó vs lo habitual, no es oferta real', () => {
    const history: MlDailySnapshot[] = [
      day('2026-07-20', 1999),
      day('2026-07-27', 1999),
      day('2026-08-03', 1899),
      day('2026-08-10', 1999),
    ];
    const intel = computeMlPriceIntel(
      { current: 1999, listPrice: 3999, regularPrice: 1999 },
      history,
      '2026-08-19'
    );
    expect(intel.historyReady).toBe(true);
    expect(intel.savingsVsHabitualPct).toBeLessThanOrEqual(5);
    expect(intel.suspectedArtificialListPrice).toBe(true);
  });
});
