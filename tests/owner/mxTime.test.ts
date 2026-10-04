import { describe, expect, it } from 'vitest';
import { startOfDayUtc, startOfYesterdayUtc, windowYesterday } from '@/lib/owner/mxTime';

describe('mxTime — ventana de ayer en hora de México', () => {
  it('ayer empieza 24 h antes del inicio de hoy', () => {
    const ref = new Date('2026-10-03T15:00:00Z');
    expect(startOfDayUtc(ref)).toBe('2026-10-03T06:00:00.000Z');
    expect(startOfYesterdayUtc(ref)).toBe('2026-10-02T06:00:00.000Z');
  });

  it('respeta el día local de México cuando en UTC ya es el día siguiente', () => {
    const ref = new Date('2026-10-01T03:00:00Z');
    expect(startOfYesterdayUtc(ref)).toBe('2026-09-29T06:00:00.000Z');
  });

  it('cruza fin de mes y de año', () => {
    expect(startOfYesterdayUtc(new Date('2026-03-01T12:00:00Z'))).toBe('2026-02-28T06:00:00.000Z');
    expect(startOfYesterdayUtc(new Date('2026-01-01T07:00:00Z'))).toBe('2025-12-31T06:00:00.000Z');
  });

  it('windowYesterday cubre exactamente 24 h y termina al inicio de hoy', () => {
    const ref = new Date('2026-10-03T15:00:00Z');
    const w = windowYesterday(ref);
    expect(w.end).toBe(startOfDayUtc(ref));
    expect(Date.parse(w.end) - Date.parse(w.start)).toBe(24 * 60 * 60 * 1000);
  });
});
