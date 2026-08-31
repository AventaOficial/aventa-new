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

  it('1500 en amount son 1500 pesos, no 15 pesos', () => {
    const csv = `amount,tag
1500,ana`;
    const { rows } = parseAffiliateLedgerCsv(csv, { network: 'amazon' });
    expect(rows[0].amount_cents).toBe(150000);
  });
});

describe('buildOfferUrl plataforma', () => {
  it('aplica tag ML de plataforma', () => {
    process.env.ML_AFFILIATE_TAG = 'aventa_ana';
    const url = buildOfferUrl('https://articulo.mercadolibre.com.mx/MLM-1234567890-1');
    expect(url).toContain('tag=aventa_ana');
  });

  it('aplica ascsubtag cuando hay clickId de Rewards', () => {
    process.env.AMAZON_ASSOCIATE_TAG = 'aventa-20';
    const url = buildOfferUrl('https://www.amazon.com.mx/dp/B000TEST123', {
      offerId: 'offer-uuid',
      clickId: 'click-uuid',
    });
    expect(url).toContain('tag=aventa-20');
    expect(url).toContain('ascsubtag=av1.');
  });
});
