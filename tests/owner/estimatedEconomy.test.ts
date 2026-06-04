import { describe, expect, it } from 'vitest';
import { computeEpcCents, sumLedgerCentsInRange } from '@/lib/owner/estimatedEconomy';

describe('estimatedEconomy', () => {
  it('computeEpcCents divides ledger by outbound', () => {
    expect(computeEpcCents(10_000, 100)).toBe(100);
    expect(computeEpcCents(0, 100)).toBeNull();
    expect(computeEpcCents(500, 0)).toBeNull();
  });

  it('sumLedgerCentsInRange respects period overlap', () => {
    const rows = [
      {
        amount_cents: 5000,
        period_start: '2026-03-01',
        period_end: '2026-03-31',
        created_at: '2026-03-10T00:00:00Z',
      },
      {
        amount_cents: 3000,
        period_start: null,
        period_end: null,
        created_at: '2026-02-15T00:00:00Z',
      },
    ];
    const sum = sumLedgerCentsInRange(rows, '2026-03-01', '2026-03-31', '2026-03-01T06:00:00Z', '2026-04-01T06:00:00Z');
    expect(sum).toBe(5000);
  });
});
