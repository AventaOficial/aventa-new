import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ECONOMIC_PERIOD_TZ, currentEconomicPeriod } from '@/lib/economy/readModel/economicPeriod';
import { classifyLedgerEconomicKind } from '@/lib/economy/readModel/classifyLedgerRow';
import { foldNetworkEconomy } from '@/lib/economy/readModel/aggregateEconomicSnapshot';
import { SETTLEMENT_EXTERNAL_REF_PREFIX, SETTLEMENT_REVERSAL_PREFIX } from '@/lib/economy/ledger/canonicalLedgerAuthority';
import { presentEconomicMoney } from '@/lib/economy/readModel/presentEconomicMoney';

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      out.push(...filesUnder(full));
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('economic authority contracts', () => {
  it('AVAILABLE to PAID lives only in the payout intent engine', () => {
    const root = process.cwd();
    const hits: string[] = [];
    for (const file of [...filesUnder(join(root, 'app')), ...filesUnder(join(root, 'lib'))]) {
      const text = readFileSync(file, 'utf8');
      if (text.includes("status: 'PAID'") || text.includes('status: "PAID"')) {
        hits.push(relative(root, file).replaceAll('\\', '/'));
      }
    }
    expect(hits).toEqual(['lib/rewards/payoutIntent/engine.ts']);
  });

  it('allocation paid cannot reach creator_rewards', () => {
    for (const file of [
      'app/api/staff/finance/allocations/route.ts',
      'app/api/admin/commissions/allocations/route.ts',
    ]) {
      const text = readFileSync(join(process.cwd(), file), 'utf8');
      expect(text).toContain('legacy_commission_not_payable');
      expect(text).not.toContain("from('creator_rewards')");
      expect(text).not.toContain('status: \'PAID\'');
    }
  });

  it('source=api is not settlement unless the ref prefix says so', () => {
    expect(classifyLedgerEconomicKind({ externalRef: 'order-9', source: 'api' })).toBe('unscoped_api');
    expect(
      classifyLedgerEconomicKind({ externalRef: `${SETTLEMENT_EXTERNAL_REF_PREFIX}c1`, source: 'api' }),
    ).toBe('settlement');
    expect(
      classifyLedgerEconomicKind({ externalRef: `${SETTLEMENT_REVERSAL_PREFIX}c1`, source: 'api' }),
    ).toBe('reversal');
    const folded = foldNetworkEconomy(
      [
        {
          id: 'bare',
          network: 'amazon',
          amountCents: 500,
          externalRef: 'order-9',
          source: 'api',
          createdAt: '2026-09-15T18:00:00.000Z',
          periodStart: '2026-09-01',
        },
        {
          id: 'set',
          network: 'amazon',
          amountCents: 700,
          externalRef: `${SETTLEMENT_EXTERNAL_REF_PREFIX}c1`,
          source: 'api',
          createdAt: '2026-09-15T18:00:00.000Z',
          periodStart: '2026-09-01',
        },
        {
          id: 'rev',
          network: 'amazon',
          amountCents: -200,
          externalRef: `${SETTLEMENT_REVERSAL_PREFIX}c1`,
          source: 'api',
          createdAt: '2026-09-15T18:00:00.000Z',
          periodStart: '2026-09-01',
        },
      ],
      '2026-09',
    );
    expect(folded.grossRecognizedCents).toBe(700);
    expect(folded.netRecognizedCents).toBe(500);
  });

  it('period follows Mexico City, not the UTC calendar month of the same instant', () => {
    expect(ECONOMIC_PERIOD_TZ).toBe('America/Mexico_City');
    const instant = new Date('2026-10-01T05:30:00.000Z');
    expect(instant.getUTCMonth()).toBe(9);
    expect(currentEconomicPeriod(instant)).toBe('2026-09');
  });

  it('missing, unimplemented and empty are not written as zero dollars', () => {
    expect(presentEconomicMoney({ state: 'no_data', reason: 'x' })).not.toMatch(/0\.00/);
    expect(presentEconomicMoney({ state: 'not_implemented', reason: 'x' })).toBe('No implementado');
    expect(presentEconomicMoney({ state: 'none', reason: 'x' })).toBe('Sin registro');
  });

  it('documented ledger status check excludes reversed, and the reversal writer inserts accrued', () => {
    const sql = readFileSync(join(process.cwd(), 'docs/supabase-migrations/affiliate_platform_ledger.sql'), 'utf8');
    const writer = readFileSync(join(process.cwd(), 'lib/economy/settlement/reversalContract.ts'), 'utf8');
    expect(sql).toMatch(/CHECK \(status IN \('pending', 'accrued', 'paid', 'void'\)\)/);
    expect(sql).not.toContain("'reversed'");
    expect(writer).toContain("status: 'accrued'");
    expect(writer).not.toContain("status: 'reversed'");
    expect(writer).not.toContain("status: 'void'");
  });
});
