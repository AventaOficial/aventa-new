import { describe, it, expect } from 'vitest';
import {
  allocateByAttributedRevenue,
  allocateByPoints,
  parsePeriodKey,
  payoutHoldReleaseIso,
} from '../../lib/commissions/monthlyPayout';
import { COMMISSION_DEFAULT_CREATOR_SHARE_BPS } from '../../lib/commissions/constants';

describe('allocateByAttributedRevenue', () => {
  it('paga proporcional al aporte: Ana con más ventas cobra más que Beto', () => {
    const rows = allocateByAttributedRevenue(
      [
        { userId: 'ana', attributedCents: 800_000 },
        { userId: 'beto', attributedCents: 150_000 },
      ],
      COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
      { minPayoutCents: 20_000 },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].userId).toBe('ana');
    expect(rows[0].amountCents).toBe(320_000); // 40% de 8000 MXN
    expect(rows[1].userId).toBe('beto');
    expect(rows[1].amountCents).toBe(60_000); // 40% de 1500 MXN
    expect(rows[0].belowMinimum).toBe(false);
    expect(rows[1].belowMinimum).toBe(false);
  });

  it('marca belowMinimum si el payout es menor al umbral', () => {
    const rows = allocateByAttributedRevenue(
      [{ userId: 'carla', attributedCents: 10_000 }],
      4000,
      { minPayoutCents: 20_000 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(4_000); // 40% de 100 MXN
    expect(rows[0].belowMinimum).toBe(true);
  });

  it('filtra por elegibles', () => {
    const rows = allocateByAttributedRevenue(
      [
        { userId: 'ana', attributedCents: 100_000 },
        { userId: 'outsider', attributedCents: 100_000 },
      ],
      4000,
      { eligibleUserIds: new Set(['ana']) },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe('ana');
  });
});

describe('allocateByPoints legacy', () => {
  it('reparte pool por puntos', () => {
    const rows = allocateByPoints(300_000, [
      { userId: 'ana', points: 10 },
      { userId: 'beto', points: 5 },
    ]);
    expect(rows.find((r) => r.userId === 'ana')?.amountCents).toBe(200_000);
    expect(rows.find((r) => r.userId === 'beto')?.amountCents).toBe(100_000);
  });
});

describe('period helpers', () => {
  it('parsePeriodKey y hold', () => {
    const range = parsePeriodKey('2026-03');
    expect(range?.startDate).toBe('2026-03-01');
    expect(range?.endDate).toBe('2026-03-31');
    const release = payoutHoldReleaseIso(range!, 14);
    expect(release.startsWith('2026-04-14')).toBe(true);
  });
});
