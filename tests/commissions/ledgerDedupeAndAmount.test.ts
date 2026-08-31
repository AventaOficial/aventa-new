import { describe, it, expect } from 'vitest';
import {
  parseAffiliateLedgerCsv,
  parseAmountToCents,
} from '../../lib/commissions/parseAffiliateLedgerCsv';
import { fingerprintLedgerRow } from '../../lib/commissions/ledgerFingerprint';

describe('parseAmountToCents — unidad explícita', () => {
  it('major: 12.50 y 12,50 son 1250 centavos', () => {
    expect(parseAmountToCents('12.50', 'major')).toBe(1250);
    expect(parseAmountToCents('12,50', 'major')).toBe(1250);
    expect(parseAmountToCents('8', 'major')).toBe(800);
  });

  it('no trata 1500 como centavos cuando la unidad es major', () => {
    expect(parseAmountToCents('1500', 'major')).toBe(150000);
    expect(parseAmountToCents('1500', 'cents')).toBe(1500);
  });

  it('cents rechaza decimales ambiguos', () => {
    expect(parseAmountToCents('12.50', 'cents')).toBeNull();
  });
});

describe('CSV + fingerprint', () => {
  it('usa amount_cents sin multiplicar por 100', () => {
    const csv = `amount_cents,tag,external_ref
1500,ana,ORD-1`;
    const { rows } = parseAffiliateLedgerCsv(csv, { network: 'amazon' });
    expect(rows[0].amount_cents).toBe(1500);
  });

  it('la misma fila produce la misma huella', () => {
    const a = fingerprintLedgerRow({
      network: 'amazon',
      amount_cents: 1250,
      currency: 'MXN',
      tracking_tag: 'ana',
      rawLine: '12.50,ana,ORD-1',
    });
    const b = fingerprintLedgerRow({
      network: 'amazon',
      amount_cents: 1250,
      currency: 'MXN',
      tracking_tag: 'ana',
      rawLine: '12.50,ana,ORD-1',
    });
    expect(a).toBe(b);
    expect(a.startsWith('fp:')).toBe(true);
  });
});
