import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  countByStatus,
  economyWindowLabel,
  moneyFlowReading,
  openPayoutIntents,
  payoutIntentCounts,
  projectExecutiveEconomicMonth,
  rewardObligationCounts,
} from '@/lib/owner/executiveFinance';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('lectura ejecutiva financiera', () => {
  it('cuenta estados de recompensa en mayúsculas y no trata PAID como pago abierto', () => {
    const rewards = { PAID: 4, pending: 2, AVAILABLE: 1, VALIDATING: 3 };
    expect(rewardObligationCounts(rewards)).toEqual({
      pendingApproval: 2,
      validating: 3,
      approvedToPay: 1,
      markedPaid: 4,
      cancelled: 0,
    });
    expect(openPayoutIntents({ PAID: 4, SUCCEEDED: 1, RESERVED: 0 })).toBe(0);
    expect(openPayoutIntents({ reserved: 1, SUBMITTED: 2, unknown: 1 })).toBe(4);
    expect(payoutIntentCounts({ FAILED: 1, UNKNOWN: 2 }).failed).toBe(1);
  });

  it('un mapa ausente no se convierte en cero', () => {
    expect(countByStatus(null, ['PAID'])).toBeNull();
    expect(openPayoutIntents(undefined)).toBeNull();
  });

  it('la ventana de 30 días no inventa un libro ni una estimación', () => {
    expect(economyWindowLabel('30d')).toBeNull();
    expect(economyWindowLabel('month')).toBe('Mes calendario en curso');
  });

  it('separa el congelamiento de la compuerta y no habilita operaciones', () => {
    const blocked = moneyFlowReading({
      moneyPathFrozen: true,
      payout: 'BLOCKED',
      rewardsProgramActive: false,
    });
    expect(blocked.blocked).toBe(true);
    expect(blocked.summary).toMatch(/MONEY_PATH_FROZEN/);
    expect(blocked.operations.join(' ')).toMatch(/payout_intent/);
    expect(moneyFlowReading({ moneyPathFrozen: false, payout: 'ALLOWED', rewardsProgramActive: true }).blocked).toBe(false);
    expect(moneyFlowReading({ moneyPathFrozen: null, payout: null, rewardsProgramActive: null }).summary).toMatch(/No hay datos suficientes/);
  });

  it('proyecta el mes canónico sin mezclar evidencia y comisión reconocida', () => {
    const month = projectExecutiveEconomicMonth({
      period: '2026-10',
      networkEconomy: {
        state: 'ready',
        grossRecognized: { state: 'amount', cents: 0 },
        reversals: { state: 'amount', cents: 0 },
        netRecognized: { state: 'amount', cents: 0 },
        evidenceRows: 3,
      },
      creatorEconomy: {
        state: 'none',
        creatorLiability: { state: 'none', reason: 'sin settlement' },
        validating: { state: 'none', reason: 'sin settlement' },
        available: { state: 'none', reason: 'sin settlement' },
        paid: { state: 'none', reason: 'sin settlement' },
      },
      payoutOps: {
        state: 'none',
        reserved: 0,
        submitted: 0,
        succeeded: 0,
        failed: 0,
        unknown: 0,
        cancelled: 0,
        succeededAmount: { state: 'none', reason: 'sin intents' },
      },
      anomalies: [],
      monetizationStatus: {
        rewardsProgramActive: false,
        commissionProgramActive: false,
        label: 'Monetización congelada.',
      },
    });
    expect(month.periodLabel).toBe('Octubre 2026');
    expect(month.grossRecognized).toEqual({ state: 'amount', cents: 0 });
    expect(month.evidenceRows).toBe(3);
    expect(month.grossRecognized).not.toMatchObject({ cents: 3 });
  });

  it('las vistas no suman libro y estimación ni presentan PAID como pago confirmado', () => {
    const ingresos = read('app/admin/owner/vista/ingresos/page.tsx');
    const pagos = read('app/admin/owner/vista/pagos/page.tsx');
    expect(ingresos).not.toMatch(/revenueDonutSplit/);
    expect(ingresos).toMatch(/Registrar en el libro/);
    expect(ingresos).not.toMatch(/Abrir contabilidad|Ver contabilidad/);
    expect(ingresos).toMatch(/Sin datos/);
    expect(pagos).toMatch(/Marcadas PAID/);
    expect(pagos).not.toMatch(/Listos/);
    expect(pagos).toMatch(/Operar una recompensa/);
    expect(pagos).not.toMatch(/Abrir recompensas|Abrir comisiones/);
  });

  it('la salud de monetización abre las vistas ejecutivas', () => {
    const derive = read('app/admin/owner/command/derive.ts');
    expect(derive).not.toMatch(/href: '\/equipo\/contabilidad'/);
    expect(derive).toMatch(/href: '\/admin\/owner\/vista\/pagos'/);
    expect(derive).toMatch(/href: '\/admin\/owner\/vista\/ingresos'/);
  });
});
