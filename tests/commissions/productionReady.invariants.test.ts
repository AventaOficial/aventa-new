import { describe, it, expect } from 'vitest';
import { payoutHoldReleaseIso, parsePeriodKey } from '../../lib/commissions/monthlyPayout';
import { COMMISSION_DEFAULT_CREATOR_SHARE_BPS } from '../../lib/commissions/constants';

describe('comisiones production-ready invariants', () => {
  it('mantiene split oficial 40% creador (4000 bps)', () => {
    expect(COMMISSION_DEFAULT_CREATOR_SHARE_BPS).toBe(4000);
  });

  it('hold 14 días cae después del fin de periodo', () => {
    const range = parsePeriodKey('2026-08');
    expect(range).not.toBeNull();
    const release = payoutHoldReleaseIso(range!, 14);
    // Agosto termina 31 → hold hasta 14 sep
    expect(release.startsWith('2026-09-14')).toBe(true);
  });

  it('programa público permanece apagado por default', async () => {
    const prev = process.env.COMMISSION_PROGRAM_ACTIVE;
    delete process.env.COMMISSION_PROGRAM_ACTIVE;
    const { isCommissionProgramPubliclyActive } = await import(
      '../../lib/commissions/programStatus'
    );
    expect(isCommissionProgramPubliclyActive()).toBe(false);
    if (prev !== undefined) process.env.COMMISSION_PROGRAM_ACTIVE = prev;
  });
});
