import { describe, expect, it } from 'vitest';
import {
  classifyFinancialRecord,
  isProductionFinancialRecord,
  isSyntheticFinancialRecord,
  moneyProvenanceLabel,
} from '@/lib/finance/financialRecordClass';
import {
  computeEpcCents,
  filterProductionLedgerRows,
  sumLedgerCentsInRange,
  type LedgerEconomyRow,
} from '@/lib/owner/estimatedEconomy';
import { isMoneyPathFrozen, isProductionRuntime } from '@/lib/server/moneyPathFreeze';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';

describe('financialRecordClass', () => {
  it('marca qa-* / staging-qa-* como SYNTHETIC_QA', () => {
    expect(classifyFinancialRecord({ externalRef: 'qa-ledger-qa-1' })).toBe('SYNTHETIC_QA');
    expect(classifyFinancialRecord({ externalRef: 'staging-qa-1788' })).toBe('SYNTHETIC_QA');
    expect(isSyntheticFinancialRecord({ externalRef: 'qa-wrong-qa-1' })).toBe(true);
    expect(isProductionFinancialRecord({ externalRef: 'qa-ledger-1' })).toBe(false);
  });

  it('meta.staging_qa marca SYNTHETIC_QA', () => {
    expect(classifyFinancialRecord({ meta: { staging_qa: true } })).toBe('SYNTHETIC_QA');
  });

  it('refs productivos reales son PRODUCTION', () => {
    expect(
      classifyFinancialRecord({
        externalRef: 'AMZ-ORDER-998877',
        source: 'csv_import',
      }),
    ).toBe('PRODUCTION');
  });

  it('sin señales fuertes → LEGACY_UNVERIFIED (no infla EPC)', () => {
    expect(classifyFinancialRecord({})).toBe('LEGACY_UNVERIFIED');
    expect(isProductionFinancialRecord({})).toBe(false);
  });
});

describe('estimatedEconomy — QA exclusion', () => {
  const qaRow = (cents: number, ref: string): LedgerEconomyRow => ({
    amount_cents: cents,
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    created_at: '2026-08-31T12:00:00Z',
    external_ref: ref,
  });

  it('QA ledger nunca cuenta como confirmed revenue / EPC base', () => {
    const rows = [
      qaRow(500_000, 'qa-ledger-qa-1'),
      qaRow(500_000, 'staging-qa-2'),
      qaRow(1_240_000, 'qa-wrong-qa-3'),
    ];
    // Total QA = $22,400 → exactamente el escenario contaminado
    expect(rows.reduce((s, r) => s + r.amount_cents, 0)).toBe(2_240_000);

    const { production, syntheticExcluded } = filterProductionLedgerRows(rows);
    expect(syntheticExcluded).toBe(3);
    expect(production).toHaveLength(0);

    const sum = sumLedgerCentsInRange(
      production,
      '2026-08-01',
      '2026-09-30',
      '2026-08-01T00:00:00Z',
      '2026-10-01T00:00:00Z',
    );
    expect(sum).toBe(0);
    expect(computeEpcCents(sum, 4)).toBeNull();
  });

  it('$11,200 no puede aparecer como confirmed: EPC QA → null', () => {
    // Escenario pre-fix: 2,240,000 / 4 outbound = 560,000 → ×2 = 1,120,000 ($11,200)
    const poisonedEpc = computeEpcCents(2_240_000, 4);
    expect(poisonedEpc).toBe(560_000);
    expect(2 * (poisonedEpc ?? 0)).toBe(1_120_000);

    const { production } = filterProductionLedgerRows([
      qaRow(2_240_000, 'qa-ledger-total'),
    ]);
    const productive = sumLedgerCentsInRange(
      production,
      '2026-01-01',
      '2026-12-31',
      '2026-01-01T00:00:00Z',
      '2027-01-01T00:00:00Z',
    );
    expect(productive).toBe(0);
    expect(computeEpcCents(productive, 2)).toBeNull();
  });

  it('solo ledger PRODUCTION alimenta EPC', () => {
    const rows = [
      qaRow(500_000, 'qa-ledger-1'),
      {
        amount_cents: 10_000,
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        created_at: '2026-09-10T00:00:00Z',
        external_ref: 'ML-COMMISSION-REAL-99',
        source: 'csv_import',
      },
    ];
    const { production, syntheticExcluded } = filterProductionLedgerRows(rows);
    expect(syntheticExcluded).toBe(1);
    expect(production).toHaveLength(1);
    expect(
      sumLedgerCentsInRange(
        production,
        '2026-09-01',
        '2026-09-30',
        '2026-09-01T00:00:00Z',
        '2026-10-01T00:00:00Z',
      ),
    ).toBe(10_000);
    expect(computeEpcCents(10_000, 100)).toBe(100);
  });

  it('production confirmed = $0 si no hay eventos reales', () => {
    const { production } = filterProductionLedgerRows([qaRow(100_000, 'staging-qa-x')]);
    expect(production).toHaveLength(0);
  });
});

describe('money provenance labels', () => {
  it('etiquetas semánticas correctas', () => {
    expect(moneyProvenanceLabel('confirmed_production')).toContain('Confirmed');
    expect(moneyProvenanceLabel('estimated_opportunity')).toContain('Estimated');
    expect(moneyProvenanceLabel('no_production_data')).toContain('No production');
    expect(moneyProvenanceLabel('synthetic_excluded')).toContain('Synthetic');
  });
});

describe('financial safety gates remain fail-closed', () => {
  it('Rewards program OFF por defecto', () => {
    const prev = process.env.REWARDS_PROGRAM_ACTIVE;
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    expect(isRewardsProgramActive()).toBe(false);
    if (prev != null) process.env.REWARDS_PROGRAM_ACTIVE = prev;
  });

  it('money path freeze: producción fail-closed si env ausente', () => {
    const prevFrozen = process.env.MONEY_PATH_FROZEN;
    const prevVercel = process.env.VERCEL_ENV;
    const prevNode = process.env.NODE_ENV;
    delete process.env.MONEY_PATH_FROZEN;
    process.env.VERCEL_ENV = 'production';
    expect(isProductionRuntime()).toBe(true);
    expect(isMoneyPathFrozen()).toBe(true);
    if (prevFrozen != null) process.env.MONEY_PATH_FROZEN = prevFrozen;
    else delete process.env.MONEY_PATH_FROZEN;
    if (prevVercel != null) process.env.VERCEL_ENV = prevVercel;
    else delete process.env.VERCEL_ENV;
    if (prevNode != null) process.env.NODE_ENV = prevNode;
  });
});
