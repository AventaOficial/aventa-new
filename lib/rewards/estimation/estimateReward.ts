/**
 * Proyección de recompensa. No es dinero.
 * No escribe affiliate_ledger_entries, creator_rewards, payouts ni saldos.
 * La comisión confirmada, cuando exista, se reparte con splitCommissionCents.
 */
import { rewardShareBps, type RewardRateContext } from '@/lib/rewards/levels';
import { normalizePrice } from '@/lib/money/normalize';
import { CANONICAL_CURRENCY, type FxQuote } from '@/lib/money/types';
import type { CurrencyRateProvider } from '@/lib/money/rates';
import {
  resolveAmazonCommissionRule,
  resolveRetailer,
  type CommissionRateRule,
} from './amazonMxRates';

export type { RewardRateContext };

export type RewardEstimateInput = {
  retailer: string | null;
  category: string | null;
  price: number | string | null;
  currency: string | null;
  reward: RewardRateContext;
  asOf?: string;
  actor?: unknown;
  rules?: readonly CommissionRateRule[];
};

export type RewardEstimateSnapshot = {
  retailer: string | null;
  category: string | null;
  sourcePriceCents: number | null;
  sourceCurrency: string | null;
  canonicalPriceCents: number | null;
  canonicalCurrency: 'MXN' | null;
  fxRate: string | null;
  fxTimestamp: string | null;
  fxSource: string | null;
  commissionRateBps: number | null;
  commissionRuleVersion: string | null;
  commissionRateSource: string | null;
  maximumCommissionCents: number | null;
  uncappedAffiliateCommissionCents: number | null;
  estimatedAffiliateCommissionCents: number | null;
  rewardRateBps: number | null;
  estimatedCreatorRewardCents: number | null;
  asOf: string;
  capped: boolean;
};

export type RewardEstimate = {
  ok: boolean;
  isEstimate: true;
  withdrawable: false;
  createsLedgerEntry: false;
  createsPayout: false;
  countsTowardProgression: false;
  unavailableReason: string | null;
  estimatedAffiliateRateBps: number | null;
  estimatedAffiliateCommissionCents: number | null;
  rewardRateBps: number | null;
  estimatedCreatorRewardCents: number | null;
  currency: 'MXN' | null;
  rateSource: string | null;
  rateVersion: string | null;
  limitations: string[];
  snapshot: RewardEstimateSnapshot;
};

const LIMITATIONS = [
  'estimate_not_balance',
  'estimate_not_confirmed_commission',
  'final_reward_uses_confirmed_commission',
] as const;

const BPS_SCALE = BigInt(10_000);
const HALF_BPS = BigInt(5_000);
const ONE = BigInt(1);

function applyBpsHalfUp(cents: number, bps: number): number {
  if (cents <= 0 || bps <= 0) return 0;
  const product = BigInt(cents) * BigInt(bps);
  const quotient = product / BPS_SCALE;
  const remainder = product % BPS_SCALE;
  const rounded = remainder >= HALF_BPS ? quotient + ONE : quotient;
  return Number(rounded);
}

function economicActor(actor: unknown): 'human' | 'inert' | 'unresolved' {
  if (actor === 'HUMAN') return 'human';
  if (actor === 'MACHINE_HUNTER' || actor === 'SYSTEM') return 'inert';
  return 'unresolved';
}

function emptySnapshot(input: RewardEstimateInput, asOf: string): RewardEstimateSnapshot {
  return {
    retailer: input.retailer,
    category: input.category,
    sourcePriceCents: null,
    sourceCurrency: input.currency,
    canonicalPriceCents: null,
    canonicalCurrency: null,
    fxRate: null,
    fxTimestamp: null,
    fxSource: null,
    commissionRateBps: null,
    commissionRuleVersion: null,
    commissionRateSource: null,
    maximumCommissionCents: null,
    uncappedAffiliateCommissionCents: null,
    estimatedAffiliateCommissionCents: null,
    rewardRateBps: null,
    estimatedCreatorRewardCents: null,
    asOf,
    capped: false,
  };
}

function unavailable(input: RewardEstimateInput, asOf: string, reason: string, snapshot?: RewardEstimateSnapshot): RewardEstimate {
  return {
    ok: false,
    isEstimate: true,
    withdrawable: false,
    createsLedgerEntry: false,
    createsPayout: false,
    countsTowardProgression: false,
    unavailableReason: reason,
    estimatedAffiliateRateBps: null,
    estimatedAffiliateCommissionCents: null,
    rewardRateBps: null,
    estimatedCreatorRewardCents: null,
    currency: null,
    rateSource: null,
    rateVersion: null,
    limitations: [...LIMITATIONS, reason],
    snapshot: snapshot ?? emptySnapshot(input, asOf),
  };
}

export function estimateReward(input: RewardEstimateInput, fx: FxQuote | null = null, now: Date = new Date()): RewardEstimate {
  const asOf = input.asOf ?? now.toISOString();
  const retailer = resolveRetailer(input.retailer);
  if (retailer === 'unknown') return unavailable(input, asOf, 'unknown_retailer');
  if (retailer === 'mercadolibre_mx') return unavailable(input, asOf, 'no_reliable_rate');

  const money = normalizePrice({ amount: input.price, currency: input.currency }, fx, now);
  if (money.status !== 'canonical') return unavailable(input, asOf, money.reason);

  const priceCents = Number(money.canonicalAmountMinor);
  const rule = resolveAmazonCommissionRule(input.category, asOf, input.rules);
  if (!rule) return unavailable(input, asOf, 'no_active_rule');

  const uncapped = applyBpsHalfUp(priceCents, rule.rateBps);
  const cap = rule.maximumCommissionCents;
  const capped = cap != null && uncapped > cap;
  const affiliateCents = cap == null ? uncapped : Math.min(uncapped, cap);
  const actor = economicActor(input.actor);
  const rateBps = rewardShareBps(input.reward);
  const creatorCents = actor === 'human' ? applyBpsHalfUp(affiliateCents, rateBps) : null;
  const actorReason = actor === 'inert' ? 'economically_inert_actor' : actor === 'unresolved' ? 'actor_unresolved' : null;

  const snapshot: RewardEstimateSnapshot = {
    retailer,
    category: rule.category,
    sourcePriceCents: Number(money.sourceAmountMinor),
    sourceCurrency: money.sourceCurrency,
    canonicalPriceCents: priceCents,
    canonicalCurrency: CANONICAL_CURRENCY,
    fxRate: money.fx ? `${money.fx.numerator.toString()}/${money.fx.denominator.toString()}` : null,
    fxTimestamp: money.fx?.timestamp ?? null,
    fxSource: money.fx?.source ?? null,
    commissionRateBps: rule.rateBps,
    commissionRuleVersion: rule.rateVersion,
    commissionRateSource: rule.rateSource,
    maximumCommissionCents: rule.maximumCommissionCents,
    uncappedAffiliateCommissionCents: uncapped,
    estimatedAffiliateCommissionCents: affiliateCents,
    rewardRateBps: actor === 'human' ? rateBps : null,
    estimatedCreatorRewardCents: creatorCents,
    asOf,
    capped,
  };

  return {
    ok: true,
    isEstimate: true,
    withdrawable: false,
    createsLedgerEntry: false,
    createsPayout: false,
    countsTowardProgression: false,
    unavailableReason: actorReason,
    estimatedAffiliateRateBps: rule.rateBps,
    estimatedAffiliateCommissionCents: affiliateCents,
    rewardRateBps: actor === 'human' ? rateBps : null,
    estimatedCreatorRewardCents: creatorCents,
    currency: CANONICAL_CURRENCY,
    rateSource: rule.rateSource,
    rateVersion: rule.rateVersion,
    limitations: [
      ...LIMITATIONS,
      ...(capped ? ['commission_cap'] : []),
      ...(actorReason ? [actorReason] : []),
    ],
    snapshot,
  };
}

export async function estimateRewardWithFx(
  input: RewardEstimateInput,
  rates: CurrencyRateProvider,
  now: Date = new Date(),
): Promise<RewardEstimate> {
  const currency = input.currency?.trim().toUpperCase() ?? '';
  if (currency === CANONICAL_CURRENCY || !currency) return estimateReward(input, null, now);
  const asOf = input.asOf ?? now.toISOString();
  const quote = await rates.getRate({
    baseCurrency: currency,
    quoteCurrency: CANONICAL_CURRENCY,
    asOf,
  });
  return estimateReward(input, quote, now);
}

export function illustrativePhoneEstimate(now: Date = new Date('2026-10-07T12:00:00.000Z')): RewardEstimate {
  return estimateReward({
    retailer: 'Amazon MX',
    category: 'Celulares',
    price: 19_999,
    currency: 'MXN',
    reward: { kind: 'level', level: 1 },
    asOf: now.toISOString(),
    actor: 'HUMAN',
  }, null, now);
}

