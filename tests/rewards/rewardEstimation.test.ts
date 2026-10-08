import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REWARDS_CREATOR_SHARE_BPS, splitCommissionCents } from '@/lib/rewards/config';
import { resolveSettlementRewardContext, rewardsLevelShareBps } from '@/lib/rewards/levels';
import { UnavailableCurrencyRateProvider, type CurrencyRateProvider } from '@/lib/money/rates';
import type { FxQuote } from '@/lib/money/types';
import { AMAZON_MX_COMMISSION_RULES, AMAZON_MX_RATE_VERSION } from '@/lib/rewards/estimation/amazonMxRates';
import {
  confirmedAffiliateCommissionFromLedger,
  estimatedAffiliateCommission,
  projectRewardFromConfirmedCommission,
  transitionEstimateToConfirmed,
} from '@/lib/rewards/estimation/confirmedCommission';
import {
  estimateReward,
  estimateRewardWithFx,
  illustrativePhoneEstimate,
  type RewardEstimateInput,
} from '@/lib/rewards/estimation/estimateReward';

const NOW = new Date('2026-10-07T12:00:00.000Z');

function input(overrides: Partial<RewardEstimateInput> = {}): RewardEstimateInput {
  return {
    retailer: 'Amazon MX',
    category: 'Celulares',
    price: 19_999,
    currency: 'MXN',
    reward: { kind: 'level', level: 1 },
    asOf: NOW.toISOString(),
    actor: 'HUMAN',
    ...overrides,
  };
}

describe('estimación de recompensa', () => {
  it('Amazon Celulares cobra 7% de comisión y después el 5% del nivel', () => {
    const estimate = illustrativePhoneEstimate(NOW);
    expect(estimate.ok).toBe(true);
    expect(estimate.isEstimate).toBe(true);
    expect(estimate.estimatedAffiliateRateBps).toBe(700);
    expect(estimate.snapshot.uncappedAffiliateCommissionCents).toBe(139_993);
    expect(estimate.snapshot.capped).toBe(true);
    expect(estimate.estimatedAffiliateCommissionCents).toBe(50_000);
    expect(estimate.rewardRateBps).toBe(rewardsLevelShareBps(1));
    expect(estimate.rewardRateBps).toBe(500);
    expect(estimate.estimatedCreatorRewardCents).toBe(2_500);
    expect(estimate.rateVersion).toBe(AMAZON_MX_RATE_VERSION);
    expect(estimate.snapshot.category).toBe('Celulares y Accesorios Móviles');
  });

  it('no calcula la recompensa como porcentaje del precio', () => {
    const estimate = estimateReward(input({ price: 1_000 }), null, NOW);
    const priceCents = 100_000;
    const wrong = Math.round((priceCents * 500) / 10_000);
    expect(estimate.estimatedAffiliateCommissionCents).toBe(7_000);
    expect(estimate.estimatedCreatorRewardCents).toBe(350);
    expect(estimate.estimatedCreatorRewardCents).not.toBe(wrong);
  });

  it('Amazon Ropa usa 10%', () => {
    const estimate = estimateReward(input({ category: 'Ropa', price: 1_000 }), null, NOW);
    expect(estimate.estimatedAffiliateRateBps).toBe(1000);
    expect(estimate.estimatedAffiliateCommissionCents).toBe(10_000);
    expect(estimate.estimatedCreatorRewardCents).toBe(500);
    expect(estimate.snapshot.capped).toBe(false);
  });

  it('Amazon Películas usa 5% y el tope de $500', () => {
    const estimate = estimateReward(input({ category: 'Películas', price: 20_000 }), null, NOW);
    expect(estimate.estimatedAffiliateRateBps).toBe(500);
    expect(estimate.snapshot.capped).toBe(true);
    expect(estimate.estimatedAffiliateCommissionCents).toBe(50_000);
    expect(estimate.estimatedCreatorRewardCents).toBe(2_500);
  });

  it('Amazon Cómputo respeta el tope de $800', () => {
    const estimate = estimateReward(input({ category: 'Cómputo', price: 20_000 }), null, NOW);
    expect(estimate.estimatedAffiliateRateBps).toBe(500);
    expect(estimate.snapshot.maximumCommissionCents).toBe(80_000);
    expect(estimate.snapshot.capped).toBe(true);
    expect(estimate.estimatedAffiliateCommissionCents).toBe(80_000);
    expect(estimate.estimatedCreatorRewardCents).toBe(4_000);
  });

  it('Amazon Coach es 0%', () => {
    const estimate = estimateReward(input({ category: 'Coach', price: 19_999 }), null, NOW);
    expect(estimate.ok).toBe(true);
    expect(estimate.estimatedAffiliateRateBps).toBe(0);
    expect(estimate.estimatedAffiliateCommissionCents).toBe(0);
    expect(estimate.estimatedCreatorRewardCents).toBe(0);
    expect(estimate.rateVersion).toBe(AMAZON_MX_RATE_VERSION);
  });

  it('un retailer sin tasa no inventa comisión', () => {
    const estimate = estimateReward(input({ retailer: 'Walmart' }), null, NOW);
    expect(estimate.ok).toBe(false);
    expect(estimate.unavailableReason).toBe('unknown_retailer');
    expect(estimate.estimatedAffiliateCommissionCents).toBeNull();
    expect(estimate.estimatedCreatorRewardCents).toBeNull();
  });

  it('Mercado Libre no tiene tasa confiable', () => {
    const estimate = estimateReward(input({ retailer: 'Mercado Libre', category: 'Celulares' }), null, NOW);
    expect(estimate.ok).toBe(false);
    expect(estimate.unavailableReason).toBe('no_reliable_rate');
    expect(estimate.estimatedAffiliateRateBps).toBeNull();
    expect(estimate.estimatedCreatorRewardCents).toBeNull();
  });

  it('la Oferta de Bienvenida es 40% de la comisión, no del precio', () => {
    const estimate = estimateReward(
      input({ price: 2_000, reward: { kind: 'welcome' } }),
      null,
      NOW,
    );
    expect(estimate.estimatedAffiliateCommissionCents).toBe(14_000);
    expect(estimate.rewardRateBps).toBe(REWARDS_CREATOR_SHARE_BPS);
    expect(estimate.estimatedCreatorRewardCents).toBe(5_600);
    expect(estimate.estimatedCreatorRewardCents).not.toBe(80_000);
  });

  it('el nivel 1 usa la fuente de verdad de 5%', () => {
    const estimate = estimateReward(input({ price: 5_000, reward: { kind: 'level', level: 1 } }), null, NOW);
    expect(estimate.rewardRateBps).toBe(rewardsLevelShareBps(1));
    expect(estimate.estimatedAffiliateCommissionCents).toBe(35_000);
    expect(estimate.estimatedCreatorRewardCents).toBe(1_750);
  });

  it('un nivel intermedio usa exactamente el catálogo existente', () => {
    const level = 4;
    const estimate = estimateReward(input({ price: 5_000, reward: { kind: 'level', level } }), null, NOW);
    expect(estimate.rewardRateBps).toBe(rewardsLevelShareBps(level));
    expect(estimate.rewardRateBps).toBe(2_000);
    expect(estimate.estimatedCreatorRewardCents).toBe(7_000);
  });

  it('el nivel máximo se queda en 40%', () => {
    const top = estimateReward(input({ price: 5_000, reward: { kind: 'level', level: 8 } }), null, NOW);
    const past = estimateReward(input({ price: 5_000, reward: { kind: 'level', level: 99 } }), null, NOW);
    expect(top.rewardRateBps).toBe(4_000);
    expect(past.rewardRateBps).toBe(rewardsLevelShareBps(99));
    expect(past.rewardRateBps).toBe(REWARDS_CREATOR_SHARE_BPS);
    expect(top.estimatedCreatorRewardCents).toBe(14_000);
  });

  it('convierte otra moneda solo con CurrencyRateProvider', async () => {
    const quote: FxQuote = {
      baseCurrency: 'USD',
      quoteCurrency: 'MXN',
      numerator: 20n,
      denominator: 1n,
      timestamp: '2026-10-07T11:00:00.000Z',
      source: 'test-provider',
    };
    const rates: CurrencyRateProvider = { getRate: async () => quote };
    const estimate = await estimateRewardWithFx(input({ price: 100, currency: 'USD' }), rates, NOW);
    expect(estimate.ok).toBe(true);
    expect(estimate.snapshot.sourceCurrency).toBe('USD');
    expect(estimate.snapshot.sourcePriceCents).toBe(10_000);
    expect(estimate.snapshot.canonicalPriceCents).toBe(200_000);
    expect(estimate.snapshot.fxRate).toBe('20/1');
    expect(estimate.snapshot.fxSource).toBe('test-provider');
    expect(estimate.snapshot.fxTimestamp).toBe(quote.timestamp);
    expect(estimate.estimatedAffiliateCommissionCents).toBe(14_000);
    expect(estimate.estimatedCreatorRewardCents).toBe(700);

    const missing = await estimateRewardWithFx(
      input({ price: 100, currency: 'USD' }),
      new UnavailableCurrencyRateProvider(),
      NOW,
    );
    expect(missing.ok).toBe(false);
    expect(missing.unavailableReason).toBe('missing_rate');
    expect(missing.estimatedCreatorRewardCents).toBeNull();
  });

  it('guarda la versión de la regla en el snapshot', () => {
    const estimate = illustrativePhoneEstimate(NOW);
    expect(estimate.snapshot.commissionRuleVersion).toBe('amazon_mx_standard_2026_10');
    expect(estimate.snapshot.commissionRateSource).toBe('amazon_associates_mx_standard');
    expect(estimate.snapshot.commissionRateBps).toBe(700);
    expect(estimate.snapshot.asOf).toBe(NOW.toISOString());
    expect(estimate.rateSource).toBe(estimate.snapshot.commissionRateSource);
  });

  it('una tasa nueva no reescribe una estimación ya tomada', () => {
    const base = AMAZON_MX_COMMISSION_RULES.find((rule) => rule.match.includes('celulares'));
    expect(base).toBeTruthy();
    const previous = {
      ...base!,
      rateBps: 700,
      rateVersion: 'amazon_mx_standard_2026_10',
      effectiveFrom: '2026-10-01T00:00:00.000Z',
      effectiveUntil: '2026-11-01T00:00:00.000Z',
    };
    const next = {
      ...base!,
      rateBps: 800,
      rateVersion: 'amazon_mx_standard_2026_11',
      effectiveFrom: '2026-11-01T00:00:00.000Z',
      effectiveUntil: null,
    };
    const rules = [previous, next];
    const historical = estimateReward(
      input({ asOf: '2026-10-15T00:00:00.000Z', rules, price: 5_000 }),
      null,
      NOW,
    );
    const taken = structuredClone(historical.snapshot);
    const current = estimateReward(
      input({ asOf: '2026-11-15T00:00:00.000Z', rules, price: 5_000 }),
      null,
      NOW,
    );
    expect(historical.snapshot).toEqual(taken);
    expect(historical.estimatedAffiliateRateBps).toBe(700);
    expect(historical.rateVersion).toBe('amazon_mx_standard_2026_10');
    expect(current.estimatedAffiliateRateBps).toBe(800);
    expect(current.rateVersion).toBe('amazon_mx_standard_2026_11');
    expect(historical.estimatedAffiliateCommissionCents).toBe(35_000);
    expect(current.estimatedAffiliateCommissionCents).toBe(40_000);
  });

  it('la estimación no crea ledger, payout ni saldo disponible', () => {
    const estimate = illustrativePhoneEstimate(NOW);
    expect(estimate.createsLedgerEntry).toBe(false);
    expect(estimate.createsPayout).toBe(false);
    expect(estimate.withdrawable).toBe(false);
    expect(estimate.countsTowardProgression).toBe(false);
    expect(estimate).not.toHaveProperty('availableCents');
    expect(estimate.limitations).toContain('estimate_not_balance');
    expect(estimate.limitations).toContain('estimate_not_confirmed_commission');

    const source = readFileSync('lib/rewards/estimation/estimateReward.ts', 'utf8');
    const imports = source.split('\n').filter((line) => line.startsWith('import ')).join('\n');
    expect(imports).not.toMatch(/supabase|rewardsEngine|payout|ledger|affiliate_commissions|creator_rewards/i);
    expect(source).not.toMatch(/process\.env\.(MONEY_PATH_FROZEN|REWARDS_PROGRAM_ACTIVE|REWARDS_PAYOUT_ENABLED)/);
  });

  it('un actor MACHINE_HUNTER no recibe recompensa estimada', () => {
    const estimate = estimateReward(input({ actor: 'MACHINE_HUNTER' }), null, NOW);
    expect(estimate.estimatedAffiliateCommissionCents).toBe(50_000);
    expect(estimate.estimatedCreatorRewardCents).toBeNull();
    expect(estimate.unavailableReason).toBe('economically_inert_actor');
    expect(estimate.countsTowardProgression).toBe(false);
  });

  it('un actor SYSTEM no recibe recompensa estimada', () => {
    const estimate = estimateReward(input({ actor: 'SYSTEM' }), null, NOW);
    expect(estimate.estimatedCreatorRewardCents).toBeNull();
    expect(estimate.rewardRateBps).toBeNull();
    expect(estimate.limitations).toContain('economically_inert_actor');
  });

  it('null, undefined y un actor desconocido no se tratan como humano', () => {
    for (const actor of [null, undefined, 'BOT']) {
      const estimate = estimateReward(input({ actor }), null, NOW);
      expect(estimate.estimatedCreatorRewardCents).toBeNull();
      expect(estimate.unavailableReason).toBe('actor_unresolved');
    }
    const human = estimateReward(input({ actor: 'HUMAN' }), null, NOW);
    expect(human.estimatedCreatorRewardCents).toBe(2_500);
  });

  it('una estimación no puede confirmarse ni repartirse como comisión real', () => {
    const estimate = illustrativePhoneEstimate(NOW);
    const estimated = estimatedAffiliateCommission(estimate.estimatedAffiliateCommissionCents ?? 0);
    expect(() => transitionEstimateToConfirmed(estimated)).toThrow('estimated_commission_is_not_confirmed');
    expect(() =>
      projectRewardFromConfirmedCommission({
        commission: estimated as never,
        reward: { kind: 'level', level: 1 },
      }),
    ).toThrow('confirmed_commission_required');
    expect(confirmedAffiliateCommissionFromLedger({ ledgerEntryId: '', amountCents: 100 })).toBeNull();
  });

  it('la recompensa final usa la comisión del ledger y la misma tasa del contexto', () => {
    const estimate = illustrativePhoneEstimate(NOW);
    const confirmed = confirmedAffiliateCommissionFromLedger({
      ledgerEntryId: 'ledger-1',
      amountCents: 118_450,
    });
    expect(confirmed).not.toBeNull();
    const finalReward = projectRewardFromConfirmedCommission({
      commission: confirmed!,
      reward: { kind: 'level', level: 1 },
    });
    const expected = splitCommissionCents(118_450, rewardsLevelShareBps(1));
    expect(finalReward.isEstimate).toBe(false);
    expect(finalReward.basis).toBe('confirmed_commission');
    expect(finalReward.withdrawable).toBe(false);
    expect(finalReward.ledgerEntryId).toBe('ledger-1');
    expect(finalReward.creatorRewardCents).toBe(expected.creatorCents);
    expect(finalReward.creatorRewardCents).toBe(5_922);
    expect(finalReward.creatorRewardCents).not.toBe(estimate.estimatedCreatorRewardCents);

    const welcome = resolveSettlementRewardContext({
      offerId: 'offer-1',
      welcomeOfferId: 'offer-1',
      validRewardCount: 0,
    });
    const later = resolveSettlementRewardContext({
      offerId: 'offer-2',
      welcomeOfferId: 'offer-1',
      validRewardCount: 1,
    });
    expect(welcome).toEqual({ kind: 'welcome' });
    expect(later).toEqual({ kind: 'level', level: 1 });
    expect(rewardsLevelShareBps(1)).toBe(500);
    expect(rewardsLevelShareBps(8)).toBe(4_000);

    const engine = readFileSync('lib/rewards/rewardsEngine.ts', 'utf8');
    expect(engine).toContain('rewardShareBps');
    expect(engine).toContain('resolveSettlementRewardContext');
    expect(engine).not.toMatch(/splitCommissionCents\(\s*ledger\.amount_cents,\s*REWARDS_CREATOR_SHARE_BPS/);
    const policy = readFileSync('docs/SYSTEMS/REWARD_ESTIMATION.md', 'utf8');
    expect(policy).toContain('LIVE PREVIEW');
    expect(policy).toContain('ECONOMIC EVENT');
  });

  it('la página explica estimación y no dice que todas las ofertas reciben 40%', () => {
    const page = readFileSync('app/me/recompensas/page.tsx', 'utf8');
    expect(page).toContain('¿Cuánto puedo generar con una oferta?');
    expect(page).toContain('Estimación, no garantía');
    expect(page).toContain('Las recompensas se calculan sobre la comisión que Aventa recibe del retailer, no sobre el precio del producto.');
    expect(page).toContain('Las cifras mostradas antes de una compra son estimaciones.');
    expect(page).toContain('Oferta de Bienvenida');
    expect(page).toContain('Niveles de recompensa');
    expect(page).toContain('Máximo');
    expect(page).toContain('illustrativePhoneEstimate');
    expect(page).not.toMatch(/Tú recibes el \$\{sharePct\}%|todas las ofertas reciben/);
  });
});
