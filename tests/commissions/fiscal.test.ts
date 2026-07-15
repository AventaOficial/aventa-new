import { describe, it, expect } from 'vitest';
import {
  normalizeRfc,
  validateRfc,
  validateClabe,
  validateCommissionFiscal,
  isFiscalProfileComplete,
} from '../../lib/commissions/fiscal';
import { evaluatePayoutReadiness, maskRfc, maskClabe } from '../../lib/commissions/fraudSignals';

describe('commission fiscal', () => {
  it('normaliza RFC a mayúsculas sin espacios', () => {
    expect(normalizeRfc(' xaxx010101000 ')).toBe('XAXX010101000');
  });

  it('valida RFC persona física 13 caracteres', () => {
    expect(validateRfc('XAXX010101000')).toBe(true);
    expect(validateRfc('INVALID')).toBe(false);
  });

  it('valida CLABE con dígito verificador', () => {
    // CLABE de ejemplo válida (Banxico test vectors style)
    expect(validateClabe('002010077777777771')).toBe(true);
    expect(validateClabe('002010077777777772')).toBe(false);
  });

  it('validateCommissionFiscal exige nombre y RFC', () => {
    const bad = validateCommissionFiscal({ legal_name: 'Ana', rfc: 'BAD' });
    expect(bad.ok).toBe(false);

    const good = validateCommissionFiscal({
      legal_name: 'María García López',
      rfc: 'XAXX010101000',
      clabe: '002010077777777771',
    });
    expect(good.ok).toBe(true);
    expect(good.normalized?.rfc).toBe('XAXX010101000');
  });

  it('isFiscalProfileComplete no exige CLABE', () => {
    expect(
      isFiscalProfileComplete({
        legalName: 'María García López',
        rfc: 'XAXX010101000',
        clabe: null,
        updatedAt: null,
      }),
    ).toBe(true);
  });
});

describe('commission fraud signals', () => {
  it('bloquea payout sin fiscal o RFC duplicado', () => {
    const blocked = evaluatePayoutReadiness({
      fiscal: { legalName: null, rfc: null, clabe: null, updatedAt: null },
      duplicateRfc: false,
      termsAccepted: true,
      programPubliclyActive: true,
    });
    expect(blocked.ready).toBe(false);
    expect(blocked.flags).toContain('missing_fiscal');

    const dup = evaluatePayoutReadiness({
      fiscal: {
        legalName: 'María García López',
        rfc: 'XAXX010101000',
        clabe: '002010077777777771',
        updatedAt: null,
      },
      duplicateRfc: true,
      termsAccepted: true,
      programPubliclyActive: true,
    });
    expect(dup.ready).toBe(false);
    expect(dup.flags).toContain('duplicate_rfc');
  });

  it('enmascara RFC y CLABE', () => {
    expect(maskRfc('XAXX010101000')).toBe('XAXX***000');
    expect(maskClabe('002010077777777771')).toBe('****7771');
  });
});
