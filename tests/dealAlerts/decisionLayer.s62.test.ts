/**
 * S6.2 — Deal Alerts Decision Layer tests (matrix A–T).
 */

import { describe, expect, it } from 'vitest';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import type { OpportunityEvidence } from '@/lib/supply/intelligence/types';
import {
  DEAL_ALERTS_CONTRACT_VERSION,
  DEAL_ALERTS_SUBSCRIPTION_CAPS,
  assertDealAlertsMoneyUntouched,
  buildDealAlertsDealDetected,
  createInMemoryAlertDecisionContext,
  decideDealAlert,
  evaluateAlertability,
  alertIdentityKey,
  opportunityIdentityKey,
  DELIVERY_IDENTITY_DEFERRED,
  type DecisionSubscription,
} from '@/lib/dealAlerts';
import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';

const NOW = new Date('2026-09-19T15:00:00.000Z');

function makeEvidence(
  overrides: Partial<OpportunityEvidence> & {
    evidenceLevel: OpportunityEvidence['evidenceLevel'];
    historyReady: boolean;
  },
): OpportunityEvidence {
  return {
    salePrice: {
      amount: 500,
      kind: 'api_quote',
      source: 'mercadolibre',
      observedAt: NOW.toISOString(),
      trusted: true,
    },
    referencePrice: {
      amount: 1000,
      kind: 'history_low',
      source: 'price_memory',
      observedAt: NOW.toISOString(),
      trusted: true,
    },
    discountPercent: 50,
    evidenceLevel: overrides.evidenceLevel,
    historyReady: overrides.historyReady,
    suspectedArtificialListPrice: false,
    hasImage: true,
    productFingerprint: overrides.productFingerprint ?? 'ml:MLM777',
    signals: {},
    ...overrides,
  };
}

function makeEvaluation(
  decision: OpportunityEvaluation['decision'],
  evidence: OpportunityEvidence,
  evaluatedAt = NOW.toISOString(),
): OpportunityEvaluation {
  return {
    candidateUrl: 'https://www.mercadolibre.com.mx/item/MLM777',
    productFingerprint: evidence.productFingerprint,
    decision,
    score: {
      value: 80,
      confidence: 0.9,
      reasonCodes: [],
      breakdown: {
        priceEvidence: 0.3,
        discountMagnitude: 0.3,
        historySupport: 0.2,
        qualitySignals: 0.15,
      },
    },
    evidence,
    evaluatedAt,
    dryRun: false,
    adapterNotes: [],
  };
}

function alertableBundle(
  opts?: {
    evidenceLevel?: OpportunityEvidence['evidenceLevel'];
    historyReady?: boolean;
    dqeEligible?: boolean | null;
    observedAt?: string;
    store?: string;
    discountPercent?: number;
    fingerprint?: string | null;
    decision?: OpportunityEvaluation['decision'];
    identityStatus?: 'exact' | 'probable' | 'unknown';
    evidenceStrength?: 'WEAK' | 'MEDIUM' | 'STRONG' | null;
  },
) {
  const evidence = makeEvidence({
    evidenceLevel: opts?.evidenceLevel ?? 'history_backed',
    historyReady: opts?.historyReady ?? true,
    productFingerprint: opts?.fingerprint === undefined ? 'ml:MLM777' : opts.fingerprint,
    discountPercent: opts?.discountPercent ?? 50,
  });
  const evaluation = makeEvaluation(
    opts?.decision ?? 'OPPORTUNITY',
    evidence,
    opts?.observedAt ?? NOW.toISOString(),
  );
  const deal = buildDealAlertsDealDetected({
    evaluation,
    store: opts?.store ?? 'mercadolibre',
    merchant: 'mercadolibre',
    dqeEligible: opts?.dqeEligible === undefined ? true : opts.dqeEligible,
    evidenceStrength: opts?.evidenceStrength ?? 'STRONG',
    now: NOW,
  });
  // Recompute alertability with explicit identity when testing unknown
  const alertability =
    opts?.identityStatus != null
      ? evaluateAlertability({
          opportunityDecision: evaluation.decision,
          evidence: {
            ...evidence,
            salePriceAmount: evidence.salePrice.amount,
          },
          identityStatus: opts.identityStatus,
          merchant: 'mercadolibre',
          store: opts?.store ?? 'mercadolibre',
          sourceId: evaluation.candidateUrl,
          observedAt: evaluation.evaluatedAt,
          evidenceStrength: opts?.evidenceStrength ?? 'STRONG',
          dqeEligible: opts?.dqeEligible === undefined ? true : opts.dqeEligible,
          now: NOW,
        })
      : deal.alertability;
  return { deal, alertability, evaluation };
}

function sub(partial: Partial<DecisionSubscription> & { subscriptionId: string }): DecisionSubscription {
  return {
    contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
    subscriptionId: partial.subscriptionId,
    userId: partial.userId ?? 'user-1',
    stores: partial.stores ?? ['mercadolibre'],
    categories: partial.categories ?? ['tecnologia'],
    minimumDiscountPercent: partial.minimumDiscountPercent ?? 40,
    notificationChannels: partial.notificationChannels ?? ['in_app'],
    enabled: partial.enabled ?? true,
    cooldownSeconds: partial.cooldownSeconds ?? DEAL_ALERTS_SUBSCRIPTION_CAPS.defaultCooldownSeconds,
    dailyCap: partial.dailyCap ?? 10,
  };
}

describe('S6.2 Decision Layer matrix', () => {
  it('A — MATCH', () => {
    const { deal, alertability } = alertableBundle();
    const ctx = createInMemoryAlertDecisionContext();
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-a' })],
      context: ctx,
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('MATCH');
    expect(out.eligibleSubscriptions).toHaveLength(1);
    expect(out.eligibleSubscriptions[0]?.subscriptionId).toBe('sub-a');
    expect(out.deliveryPrep.matchCount).toBe(1);
  });

  it('B — missing identity', () => {
    const { deal, alertability } = alertableBundle({ identityStatus: 'unknown' });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-b' })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('INSUFFICIENT_EVIDENCE');
    expect(out.eligibleSubscriptions).toHaveLength(0);
  });

  it('C — weak evidence', () => {
    const { deal, alertability } = alertableBundle({
      evidenceLevel: 'weak_card',
      evidenceStrength: 'WEAK',
    });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-c' })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('D — stale opportunity', () => {
    const old = new Date(NOW.getTime() - 48 * 3600_000).toISOString();
    const { deal, alertability } = alertableBundle({ observedAt: old });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-d' })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('STALE');
  });

  it('E — DQE ineligible', () => {
    const { deal, alertability } = alertableBundle({ dqeEligible: false });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-e' })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('INSUFFICIENT_EVIDENCE');
    expect(out.reason).toMatch(/dqe/);
  });

  it('F — store mismatch', () => {
    const { deal, alertability } = alertableBundle({ store: 'mercadolibre' });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-f', stores: ['amazon'] })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('NOT_RELEVANT');
    expect(out.suppressedSubscriptions[0]?.reason).toBe('store_mismatch');
  });

  it('G — category mismatch', () => {
    const { deal, alertability } = alertableBundle();
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-g', categories: ['hogar'] })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('NOT_RELEVANT');
    expect(out.suppressedSubscriptions[0]?.reason).toBe('category_mismatch');
  });

  it('H — discount below threshold', () => {
    const { deal, alertability } = alertableBundle({ discountPercent: 25 });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-h', minimumDiscountPercent: 40 })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('NOT_RELEVANT');
    expect(out.suppressedSubscriptions[0]?.reason).toBe('discount_below_threshold');
  });

  it('I — disabled subscription', () => {
    const { deal, alertability } = alertableBundle();
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-i', enabled: false })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('NOT_RELEVANT');
    expect(out.suppressedSubscriptions[0]?.reason).toBe('subscription_disabled');
  });

  it('J — cooldown active', () => {
    const { deal, alertability } = alertableBundle();
    const fp = alertability.fingerprint!;
    const lastMatchAt = new Map([[`sub-j|${fp}`, NOW.getTime() - 60_000]]);
    const ctx = createInMemoryAlertDecisionContext({ lastMatchAt });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-j', cooldownSeconds: 3600 })],
      context: ctx,
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('RATE_LIMITED');
    expect(out.suppressedSubscriptions[0]?.reason).toBe('cooldown_active');
  });

  it('K — frequency cap reached', () => {
    const { deal, alertability } = alertableBundle();
    const day = NOW.toISOString().slice(0, 10);
    const dailyCounts = new Map([[`sub-k|${day}`, 5]]);
    const ctx = createInMemoryAlertDecisionContext({ dailyCounts });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-k', dailyCap: 5 })],
      context: ctx,
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('RATE_LIMITED');
    expect(out.suppressedSubscriptions[0]?.reason).toBe('frequency_cap_reached');
  });

  it('L — duplicate opportunity×subscription (alert identity)', () => {
    const { deal, alertability } = alertableBundle();
    const alertKey = alertIdentityKey({
      opportunityFingerprint: alertability.fingerprint!,
      subscriptionId: 'sub-l',
    });
    const ctx = createInMemoryAlertDecisionContext({ matchedAlertKeys: [alertKey] });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-l' })],
      context: ctx,
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('DUPLICATE');
  });

  it('M — same opportunity + different eligible subscriptions (fanout prep)', () => {
    const { deal, alertability } = alertableBundle();
    // Opportunity already seen globally — must NOT block fanout
    const ctx = createInMemoryAlertDecisionContext({
      seenOpportunityKeys: [deal.idempotencyKey],
    });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [
        sub({ subscriptionId: 'sub-m1', userId: 'u1' }),
        sub({ subscriptionId: 'sub-m2', userId: 'u2' }),
      ],
      context: ctx,
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.opportunityAlreadySeen).toBe(true);
    expect(out.decision).toBe('MATCH');
    expect(out.eligibleSubscriptions).toHaveLength(2);
    expect(out.eligibleSubscriptions.map((e) => e.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('N — deterministic replay', () => {
    const { deal, alertability } = alertableBundle();
    const ctx = createInMemoryAlertDecisionContext();
    const input = {
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-n' })],
      context: ctx,
      opportunityCategory: 'tecnologia',
      now: NOW,
    };
    const a = decideDealAlert(input);
    const b = decideDealAlert(input);
    expect(a).toEqual(b);
  });

  it('O — concurrent evaluation', async () => {
    const { deal, alertability } = alertableBundle();
    const ctx = createInMemoryAlertDecisionContext();
    const input = {
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-o' })],
      context: ctx,
      opportunityCategory: 'tecnologia',
      now: NOW,
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => Promise.resolve(decideDealAlert(input))),
    );
    expect(results.every((r) => r.decision === 'MATCH')).toBe(true);
    expect(results.every((r) => r.reason === results[0]!.reason)).toBe(true);
  });

  it('P — malformed subscription', () => {
    const { deal, alertability } = alertableBundle();
    const bad = sub({
      subscriptionId: 'sub-p',
      minimumDiscountPercent: 5, // below cap min
      notificationChannels: [],
    });
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [bad],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.suppressedSubscriptions[0]?.reason).toMatch(/malformed/);
    expect(out.decision).toBe('NOT_RELEVANT');
  });

  it('Q — missing optional DQE (null) still MATCH', () => {
    const { deal, alertability } = alertableBundle({ dqeEligible: null });
    expect(alertability.alertable).toBe(true);
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-q' })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('MATCH');
    expect(
      out.evaluatedRules.some((r) => r.name === 'dqe_eligibility' && r.detail === 'dqe_not_evaluated'),
    ).toBe(true);
  });

  it('R — evidence history_backed MATCH', () => {
    const { deal, alertability } = alertableBundle({ evidenceLevel: 'history_backed' });
    expect(alertability.evidenceLevel).toBe('history_backed');
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-r' })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('MATCH');
  });

  it('S — evidence api_verified + historyReady MATCH', () => {
    const { deal, alertability } = alertableBundle({
      evidenceLevel: 'api_verified',
      historyReady: true,
    });
    expect(alertability.evidenceLevel).toBe('api_verified');
    const out = decideDealAlert({
      dealDetected: deal,
      alertability,
      subscriptions: [sub({ subscriptionId: 'sub-s' })],
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.decision).toBe('MATCH');
  });

  it('T — MONEY_PATH_FROZEN does not block Decision Layer', () => {
    const prev = process.env.MONEY_PATH_FROZEN;
    process.env.MONEY_PATH_FROZEN = 'true';
    try {
      expect(isMoneyPathFrozen()).toBe(true);
      assertDealAlertsMoneyUntouched();
      const { deal, alertability } = alertableBundle();
      const out = decideDealAlert({
        dealDetected: deal,
        alertability,
        subscriptions: [sub({ subscriptionId: 'sub-t' })],
        context: createInMemoryAlertDecisionContext(),
        opportunityCategory: 'tecnologia',
        now: NOW,
      });
      expect(out.decision).toBe('MATCH');
      expect(out.contractVersion).toBe('deal-alerts.v1');
    } finally {
      process.env.MONEY_PATH_FROZEN = prev;
    }
  });

  it('identity layers documented helpers', () => {
    expect(opportunityIdentityKey('ml:X')).toBe('opp:ml:X');
    expect(alertIdentityKey({ opportunityFingerprint: 'ml:X', subscriptionId: 's1' })).toMatch(
      /^alert:/,
    );
    expect(DELIVERY_IDENTITY_DEFERRED.layer).toBe('S6.5');
  });
});
