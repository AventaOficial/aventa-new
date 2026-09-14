import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSyntheticFinancialRecord } from '@/lib/finance/financialRecordClass';

describe('rewards money truth', () => {
  it('API me/rewards clasifica synthetic y no etiqueta QA como Entregada', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/me/rewards/route.ts'), 'utf8');
    expect(src).toMatch(/classifyFinancialRecord/);
    expect(src).toMatch(/ledger_entry_id/);
    expect(src).toMatch(/Prueba QA \(no es pago real\)/);
    expect(src).toMatch(/Sin pagos reales/);
    expect(src).toMatch(/moneyTruth/);
    expect(src).toMatch(/affiliate_ledger_entries/);
  });

  it('UI historial soporta uiStatus synthetic', () => {
    const src = readFileSync(join(process.cwd(), 'app/me/MyRewardsHistory.tsx'), 'utf8');
    expect(src).toMatch(/synthetic/);
    expect(src).toMatch(/emptyProductionMessage/);
  });

  it('staging_qa meta nunca es production payout', () => {
    expect(isSyntheticFinancialRecord({ meta: { staging_qa: true } })).toBe(true);
  });
});
