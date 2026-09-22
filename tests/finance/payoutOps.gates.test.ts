import { describe, expect, it } from 'vitest';
import { evaluatePayeeGates } from '@/lib/finance/payoutOps/payeeGates';
import type { PayeeGateInput } from '@/lib/finance/payoutOps/types';

// CLABE válida (dígito verificador correcto): 032180000118359719
const VALID_CLABE = '032180000118359719';

function base(over: Partial<PayeeGateInput> = {}): PayeeGateInput {
  return {
    amountCents: 50_000,
    minPayoutCents: 20_000,
    legalName: 'Juan Pérez López',
    rfc: 'PELJ900101ABC',
    clabe: VALID_CLABE,
    fiscalUpdatedAt: '2026-01-01T00:00:00Z',
    termsAcceptedAt: '2026-01-02T00:00:00Z',
    termsVersion: '2026-08-30',
    requiredTermsVersion: '2026-08-30',
    priorPaidCount: 2,
    lastPaidAt: '2026-06-01T00:00:00Z',
    fraudFlags: [],
    pendingClawbackCents: 0,
    rfcDuplicate: false,
    ...over,
  };
}

describe('evaluatePayeeGates', () => {
  it('pass cuando todo está en orden', () => {
    const r = evaluatePayeeGates(base());
    expect(r.decision).toBe('pass');
    expect(r.codes).toEqual([]);
  });

  it('carry por debajo del mínimo, antes que cualquier otro gate', () => {
    const r = evaluatePayeeGates(base({ amountCents: 1_000, clabe: null }));
    expect(r.decision).toBe('carry');
    expect(r.codes).toEqual(['below_minimum']);
  });

  it('fail: CLABE ausente / inválida', () => {
    expect(evaluatePayeeGates(base({ clabe: null })).codes).toContain('clabe_missing');
    expect(evaluatePayeeGates(base({ clabe: '032180000118359710' })).codes).toContain('clabe_invalid');
  });

  it('fail: fiscal incompleto (RFC inválido o nombre corto)', () => {
    expect(evaluatePayeeGates(base({ rfc: 'XXX' })).codes).toContain('fiscal_incomplete');
    expect(evaluatePayeeGates(base({ legalName: 'Ana' })).codes).toContain('fiscal_incomplete');
  });

  it('fail: términos faltantes u obsoletos', () => {
    expect(evaluatePayeeGates(base({ termsAcceptedAt: null })).codes).toContain('terms_missing');
    expect(evaluatePayeeGates(base({ termsVersion: '2025-01-01' })).codes).toContain('terms_outdated');
  });

  it('fail: RFC duplicado', () => {
    const r = evaluatePayeeGates(base({ rfcDuplicate: true }));
    expect(r.decision).toBe('fail');
    expect(r.codes).toContain('rfc_duplicate');
  });

  it('fail agrupa múltiples motivos y gana sobre review', () => {
    const r = evaluatePayeeGates(base({ clabe: null, priorPaidCount: 0, fraudFlags: ['self_click'] }));
    expect(r.decision).toBe('fail');
    expect(r.codes).toEqual(['clabe_missing']);
  });

  it('review: primer pago (SPEI irrevocable)', () => {
    const r = evaluatePayeeGates(base({ priorPaidCount: 0, lastPaidAt: null }));
    expect(r.decision).toBe('review');
    expect(r.codes).toEqual(['first_payout']);
  });

  it('review: cambio de datos bancarios tras último pago', () => {
    const r = evaluatePayeeGates(
      base({ fiscalUpdatedAt: '2026-07-01T00:00:00Z', lastPaidAt: '2026-06-01T00:00:00Z' }),
    );
    expect(r.decision).toBe('review');
    expect(r.codes).toEqual(['bank_details_changed']);
  });

  it('review: clawback pendiente + fraud flags se acumulan', () => {
    const r = evaluatePayeeGates(base({ pendingClawbackCents: 500, fraudFlags: ['anonymous_click'] }));
    expect(r.decision).toBe('review');
    expect(r.codes).toEqual(['clawback_pending', 'fraud_flags']);
    expect(r.reasons).toHaveLength(2);
  });
});
