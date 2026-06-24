import { describe, it, expect } from 'vitest';
import { applyVitalesFeedTransform, DIA_A_DIA_SCORE_CAP } from '../../lib/offers/homeFeedClient';
import { resolveGrowthStage, computeBillingTotals, AVENTA_DOMAIN_PAYMENT } from '../../lib/owner/growthModel';

describe('homeFeedClient', () => {
  it('applyVitalesFeedTransform excluye score >= cap', () => {
    const list = [
      { votes: { score: DIA_A_DIA_SCORE_CAP } },
      { votes: { score: 10 } },
      { votes: { score: 5 } },
    ];
    const out = applyVitalesFeedTransform(list, 10);
    expect(out.every((o) => (o.votes?.score ?? 0) < DIA_A_DIA_SCORE_CAP)).toBe(true);
    expect(out.length).toBe(2);
  });
});

describe('growthModel', () => {
  it('resolveGrowthStage asigna etapa seed y progreso al millón', () => {
    const r = resolveGrowthStage(500);
    expect(r.current.id).toBe('seed');
    expect(r.next?.id).toBe('beta');
    expect(r.progressToMillionPct).toBe(0.05);
  });

  it('resolveGrowthStage escala en growth', () => {
    const r = resolveGrowthStage(25_000);
    expect(r.current.id).toBe('growth');
  });

  it('computeBillingTotals suma dominio prorrateado y stack prod', () => {
    const t = computeBillingTotals();
    expect(t.currentMonthlyUsd).toBe(Math.round((AVENTA_DOMAIN_PAYMENT.amountUsd / 12) * 100) / 100);
    expect(t.domainAnnualUsd).toBe(11.25);
    expect(t.prodStackMonthlyUsd).toBe(20 + 25 + 10 + 20 + t.currentMonthlyUsd);
  });
});
