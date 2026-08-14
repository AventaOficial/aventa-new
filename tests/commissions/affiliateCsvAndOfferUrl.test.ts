import { describe, it, expect } from 'vitest';
import { parseAffiliateLedgerCsv } from '../../lib/commissions/parseAffiliateLedgerCsv';
import { buildOfferUrl } from '../../lib/offerUrl';

describe('parseAffiliateLedgerCsv', () => {
  it('parsea amount+tag y convierte a centavos', () => {
    const csv = `amount,tag,external_ref
12.50,ana_tag,ORD-1
8,beto_tag,ORD-2`;
    const { rows, skipped, error } = parseAffiliateLedgerCsv(csv, { network: 'mercadolibre' });
    expect(error).toBeUndefined();
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].amount_cents).toBe(1250);
    expect(rows[0].tracking_tag).toBe('ana_tag');
    expect(rows[0].network).toBe('mercadolibre');
  });

  it('acepta commission como alias de monto', () => {
    const csv = `commission,tracking_tag
100.00,ml_user`;
    const { rows } = parseAffiliateLedgerCsv(csv);
    expect(rows[0].amount_cents).toBe(10000);
    expect(rows[0].tracking_tag).toBe('ml_user');
  });
});

describe('buildOfferUrl creator priority', () => {
  it('aplica tag ML del creador', () => {
    const url = buildOfferUrl('https://articulo.mercadolibre.com.mx/MLM-1', {
      mlTag: 'aventa_ana',
    });
    expect(url).toContain('tag=aventa_ana');
  });

  it('aplica tag Amazon del creador', () => {
    const url = buildOfferUrl('https://www.amazon.com.mx/dp/B000', {
      amazonTag: 'aventa-20',
    });
    expect(url).toContain('tag=aventa-20');
  });
});
