import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EMPTY_PAYOUT_CERTIFICATION,
  presentCreatorReward,
} from '@/lib/rewards/payoutReadModel';

const certified = {
  intentSucceeded: true,
  rewardPaidAudit: true,
  payoutIntentSucceededAudit: true,
};

describe('payout read model', () => {
  it('Entregada exige reward PAID, intent SUCCEEDED y las dos auditorías', () => {
    expect(presentCreatorReward({ status: 'PAID', synthetic: false, certification: certified })).toEqual({
      uiStatus: 'delivered',
      label: 'Entregada',
    });
  });

  it('PAID sin intent, con intent no exitoso o con auditoría incompleta no es Entregada', () => {
    const cases = [
      { name: 'sin payout intent', certification: EMPTY_PAYOUT_CERTIFICATION },
      {
        name: 'intent UNKNOWN',
        certification: {
          intentSucceeded: false,
          rewardPaidAudit: true,
          payoutIntentSucceededAudit: false,
        },
      },
      {
        name: 'intent FAILED',
        certification: {
          intentSucceeded: false,
          rewardPaidAudit: true,
          payoutIntentSucceededAudit: false,
        },
      },
      {
        name: 'auditoría incompleta',
        certification: {
          intentSucceeded: true,
          rewardPaidAudit: true,
          payoutIntentSucceededAudit: false,
        },
      },
    ];
    for (const entry of cases) {
      const presented = presentCreatorReward({
        status: 'PAID',
        synthetic: false,
        certification: entry.certification,
      });
      expect(presented.label, entry.name).not.toBe('Entregada');
      expect(presented.uiStatus, entry.name).toBe('validating');
    }
  });

  it('PAID sin evidencia completa no se muestra como Entregada ni como disponible', () => {
    for (const certification of [
      EMPTY_PAYOUT_CERTIFICATION,
      { intentSucceeded: true, rewardPaidAudit: false, payoutIntentSucceededAudit: false },
      { intentSucceeded: true, rewardPaidAudit: true, payoutIntentSucceededAudit: false },
      { intentSucceeded: false, rewardPaidAudit: true, payoutIntentSucceededAudit: true },
    ]) {
      const presented = presentCreatorReward({ status: 'PAID', synthetic: false, certification });
      expect(presented.label).not.toBe('Entregada');
      expect(presented.uiStatus).not.toBe('delivered');
      expect(presented.uiStatus).not.toBe('available');
    }
  });

  it('AVAILABLE, hold, cancelada y revertida conservan su etiqueta', () => {
    expect(presentCreatorReward({ status: 'AVAILABLE', synthetic: false }).label).toBe('Lista');
    expect(presentCreatorReward({ status: 'PENDING', synthetic: false }).label).toBe('En validación');
    expect(presentCreatorReward({ status: 'VALIDATING', synthetic: false }).label).toBe('En validación');
    expect(presentCreatorReward({ status: 'CANCELLED', synthetic: false }).label).toBe('Cancelada');
    expect(presentCreatorReward({ status: 'REVERSED', synthetic: false }).label).toBe('Revertida');
  });

  it('un registro sintético pagado no dice Entregada', () => {
    expect(
      presentCreatorReward({ status: 'PAID', synthetic: true, certification: certified }).label,
    ).toBe('Prueba QA (no es pago real)');
  });

  it('el RPC legado del repositorio está fail-closed y no asigna PAID', () => {
    const sql = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/20260919_execute_reward_payout_m42_failclosed.sql'),
      'utf8',
    );
    expect(sql).toContain("RAISE EXCEPTION 'legacy_rpc_disabled_use_payout_intent'");
    expect(sql).not.toContain("status = 'PAID'");
    expect(sql).not.toContain('INSERT INTO public.reward_payouts');
  });
});
