/**
 * S6.3 — Fanout / Matching Engine tests (matrix A–Z).
 */

import { describe, expect, it } from 'vitest';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import type { OpportunityEvidence, OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import {
  DEAL_ALERTS_CONTRACT_VERSION,
  DEAL_ALERTS_SUBSCRIPTION_CAPS,
  assertDealAlertsMoneyUntouched,
  buildDealAlertsDealDetected,
  createEmptySubscriptionCandidateIndex,
  createFixedSubscriptionCandidateIndex,
  createInMemoryAlertDecisionContext,
  createInMemorySubscriptionCandidateIndex,
  evaluateAlertability,
  fanoutDealAlert,
  type DecisionSubscription,
} from '@/lib/dealAlerts';

const NOW = new Date('2026-09-19T16:00:00.000Z');

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
    productFingerprint: overrides.productFingerprint ?? 'ml:MLM900',
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
    candidateUrl: 'https://www.mercadolibre.com.mx/item/MLM900',
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

function alertableBundle(opts?: {
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
}) {
  const evidence = makeEvidence({
    evidenceLevel: opts?.evidenceLevel ?? 'history_backed',
    historyReady: opts?.historyReady ?? true,
    productFingerprint: opts?.fingerprint === undefined ? 'ml:MLM900' : opts.fingerprint,
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
  const alertability =
    opts?.identityStatus != null
      ? evaluateAlertability({
          opportunityDecision: evaluation.decision,
          evidence: { ...evidence, salePriceAmount: evidence.salePrice.amount },
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
  return { deal, alertability };
}

function sub(
  partial: Partial<DecisionSubscription> & { subscriptionId: string },
): DecisionSubscription {
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

async function runFanout(
  bundle: ReturnType<typeof alertableBundle>,
  subscriptions: DecisionSubscription[],
  opts?: {
    category?: string | null;
    index?: ReturnType<typeof createInMemorySubscriptionCandidateIndex>;
    ctx?: ReturnType<typeof createInMemoryAlertDecisionContext>;
  },
) {
  const index =
    opts?.index ?? createInMemorySubscriptionCandidateIndex(subscriptions);
  return await fanoutDealAlert({
    dealDetected: bundle.deal,
    alertability: bundle.alertability,
    candidateIndex: index,
    context: opts?.ctx ?? createInMemoryAlertDecisionContext(),
    opportunityCategory: opts?.category === undefined ? 'tecnologia' : opts.category,
    now: NOW,
  });
}

describe('S6.3 Fanout matrix', () => {
  it('A — 0 subscriptions', async () => {
    const out = await runFanout(alertableBundle(), []);
    expect(out.matchedSubscriptions).toHaveLength(0);
    expect(out.stats.candidatesFound).toBe(0);
    expect(out.decision).toBe('NOT_RELEVANT');
    expect(out.channelExpansionDeferred).toBe(true);
  });

  it('B — 1 subscription MATCH', async () => {
    const out = await runFanout(alertableBundle(), [sub({ subscriptionId: 's1' })]);
    expect(out.decision).toBe('MATCH');
    expect(out.matchedSubscriptions).toHaveLength(1);
    expect(out.matchedSubscriptions[0]?.opportunityKey).toBe('ml:MLM900');
    expect(out.alertIdentityKey).toBe(out.matchedSubscriptions[0]?.alertIdentityKey);
  });

  it('C — múltiples subscriptions MATCH', async () => {
    const out = await runFanout(alertableBundle(), [
      sub({ subscriptionId: 's1', userId: 'u1' }),
      sub({ subscriptionId: 's2', userId: 'u2' }),
      sub({ subscriptionId: 's3', userId: 'u3' }),
    ]);
    expect(out.matchedSubscriptions).toHaveLength(3);
    expect(out.alertIdentityKey).toBeNull(); // multi-match
  });

  it('D — same opportunity × 100 subscriptions', async () => {
    const subs = Array.from({ length: 100 }, (_, i) =>
      sub({
        subscriptionId: `s${String(i).padStart(3, '0')}`,
        userId: `u${i}`,
      }),
    );
    const out = await runFanout(alertableBundle(), subs);
    expect(out.matchedSubscriptions).toHaveLength(100);
    expect(out.stats.matched).toBe(100);
    expect(out.stats.duplicates).toBe(0);
    expect(out.duplicateSubscriptions).toHaveLength(0);
  });

  it('E — store index mismatch', async () => {
    const out = await runFanout(alertableBundle({ store: 'mercadolibre' }), [
      sub({ subscriptionId: 's-amz', stores: ['amazon'] }),
    ]);
    // Index may return 0 candidates (store miss) OR decision NOT_RELEVANT
    expect(out.matchedSubscriptions).toHaveLength(0);
    expect(out.decision).toBe('NOT_RELEVANT');
  });

  it('F — category index mismatch', async () => {
    const out = await runFanout(
      alertableBundle(),
      [sub({ subscriptionId: 's-hogar', categories: ['hogar'] })],
      { category: 'tecnologia' },
    );
    expect(out.matchedSubscriptions).toHaveLength(0);
  });

  it('G — discount threshold mismatch (index prefilter)', async () => {
    const out = await runFanout(alertableBundle({ discountPercent: 25 }), [
      sub({ subscriptionId: 's-high', minimumDiscountPercent: 40 }),
    ]);
    expect(out.stats.candidatesFound).toBe(0);
    expect(out.matchedSubscriptions).toHaveLength(0);
  });

  it('H — disabled subscriptions', async () => {
    const out = await runFanout(alertableBundle(), [
      sub({ subscriptionId: 's-off', enabled: false }),
    ]);
    expect(out.matchedSubscriptions).toHaveLength(0);
    expect(out.suppressedSubscriptions.some((s) => s.reason === 'subscription_disabled')).toBe(
      true,
    );
  });

  it('I — subscriptions duplicadas por input', async () => {
    const dup = sub({ subscriptionId: 's-dup', userId: 'u1' });
    const out = await runFanout(alertableBundle(), [dup, { ...dup }, { ...dup }]);
    expect(out.matchedSubscriptions).toHaveLength(1);
    expect(out.stats.matched).toBe(1);
  });

  it('J — duplicate alert identity', async () => {
    const bundle = alertableBundle();
    const s = sub({ subscriptionId: 's-j' });
    const ctx = createInMemoryAlertDecisionContext();
    const first = await runFanout(bundle, [s], { ctx });
    expect(first.decision).toBe('MATCH');
    // Record match then fanout again
    const alertKey = first.matchedSubscriptions[0]!.alertIdentityKey;
    const ctx2 = createInMemoryAlertDecisionContext({ matchedAlertKeys: [alertKey] });
    const second = await runFanout(bundle, [s], { ctx: ctx2 });
    expect(second.duplicateSubscriptions).toHaveLength(1);
    expect(second.matchedSubscriptions).toHaveLength(0);
    expect(second.decision).toBe('DUPLICATE');
  });

  it('K — S6.2 SUPPRESS (REJECT)', async () => {
    const out = await runFanout(alertableBundle({ decision: 'REJECT' }), [
      sub({ subscriptionId: 's-k' }),
    ]);
    expect(out.decision).toBe('SUPPRESS');
    expect(out.matchedSubscriptions).toHaveLength(0);
  });

  it('L — S6.2 STALE', async () => {
    const old = new Date(NOW.getTime() - 48 * 3600_000).toISOString();
    const out = await runFanout(alertableBundle({ observedAt: old }), [sub({ subscriptionId: 's-l' })]);
    expect(out.decision).toBe('STALE');
  });

  it('M — S6.2 INSUFFICIENT_EVIDENCE', async () => {
    const out = await runFanout(
      alertableBundle({ evidenceLevel: 'weak_card', evidenceStrength: 'WEAK' }),
      [sub({ subscriptionId: 's-m' })],
    );
    expect(out.decision).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('N — S6.2 NOT_RELEVANT path via category', async () => {
    const out = await runFanout(alertableBundle(), [sub({ subscriptionId: 's-n', categories: ['hogar'] })], {
      category: 'tecnologia',
    });
    expect(out.decision).toBe('NOT_RELEVANT');
  });

  it('O — S6.2 RATE_LIMITED', async () => {
    const bundle = alertableBundle();
    const fp = bundle.alertability.fingerprint!;
    const ctx = createInMemoryAlertDecisionContext({
      lastMatchAt: new Map([[`s-o|${fp}`, NOW.getTime() - 1000]]),
    });
    const out = await runFanout(bundle, [sub({ subscriptionId: 's-o', cooldownSeconds: 3600 })], {
      ctx,
    });
    expect(out.decision).toBe('RATE_LIMITED');
  });

  it('P — deterministic replay', async () => {
    const bundle = alertableBundle();
    const subs = [sub({ subscriptionId: 's-p1' }), sub({ subscriptionId: 's-p2' })];
    const a = await runFanout(bundle, subs);
    const b = await runFanout(bundle, [...subs].reverse());
    expect(a.matchedSubscriptions.map((m) => m.subscriptionId)).toEqual(
      b.matchedSubscriptions.map((m) => m.subscriptionId),
    );
    expect(a.decision).toBe(b.decision);
    expect(a.stats).toEqual(b.stats);
  });

  it('Q — concurrent ×10', async () => {
    const bundle = alertableBundle();
    const subs = [sub({ subscriptionId: 's-q' })];
    const results = await Promise.all(
      Array.from({ length: 10 }, () => runFanout(bundle, subs)),
    );
    expect(results.every((r) => r.decision === 'MATCH')).toBe(true);
    expect(results.every((r) => JSON.stringify(r.matchedSubscriptions) === JSON.stringify(results[0]!.matchedSubscriptions))).toBe(true);
  });

  it('R — candidate retrieval separado de decision', async () => {
    const bundle = alertableBundle();
    const index = createInMemorySubscriptionCandidateIndex([
      sub({ subscriptionId: 's-r' }),
    ]);
    const candidates = await index.findCandidates({
      store: 'mercadolibre',
      merchant: 'mercadolibre',
      category: 'tecnologia',
      discountPercent: 50,
    });
    expect(candidates.retrievalSource).toBe('in_memory_index');
    expect(candidates.subscriptions).toHaveLength(1);
    // Fanout still uses decideDealAlert — retrieval alone does not decide MATCH
    expect(candidates).not.toHaveProperty('decision');
  });

  it('S — candidate index returns irrelevant candidates', async () => {
    const bundle = alertableBundle({ store: 'mercadolibre' });
    const irrelevant = createFixedSubscriptionCandidateIndex([
      sub({ subscriptionId: 's-irr', stores: ['amazon'], categories: ['hogar'] }),
    ]);
    const out = await fanoutDealAlert({
      dealDetected: bundle.deal,
      alertability: bundle.alertability,
      candidateIndex: irrelevant,
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.stats.candidatesFound).toBe(1);
    expect(out.matchedSubscriptions).toHaveLength(0);
    expect(out.decision).toBe('NOT_RELEVANT');
  });

  it('T — candidate index empty subset', async () => {
    const bundle = alertableBundle();
    const out = await fanoutDealAlert({
      dealDetected: bundle.deal,
      alertability: bundle.alertability,
      candidateIndex: createEmptySubscriptionCandidateIndex(),
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: 'tecnologia',
      now: NOW,
    });
    expect(out.stats.candidatesFound).toBe(0);
    expect(out.matchedSubscriptions).toHaveLength(0);
  });

  it('U — same opportunity × múltiples usuarios', async () => {
    const out = await runFanout(alertableBundle(), [
      sub({ subscriptionId: 's-u1', userId: 'alice' }),
      sub({ subscriptionId: 's-u2', userId: 'bob' }),
    ]);
    expect(out.matchedSubscriptions.map((m) => m.userId).sort()).toEqual(['alice', 'bob']);
  });

  it('V — mismo usuario × múltiples subscriptions (no colapsar)', async () => {
    const out = await runFanout(alertableBundle(), [
      sub({
        subscriptionId: 's-v-amz',
        userId: 'same',
        stores: ['mercadolibre'],
        categories: ['tecnologia'],
      }),
      sub({
        subscriptionId: 's-v-any',
        userId: 'same',
        stores: [],
        categories: [],
        minimumDiscountPercent: 40,
      }),
    ]);
    expect(out.matchedSubscriptions).toHaveLength(2);
    expect(out.matchedSubscriptions.every((m) => m.userId === 'same')).toBe(true);
    expect(new Set(out.matchedSubscriptions.map((m) => m.subscriptionId)).size).toBe(2);
  });

  it('W — orden de input diferente', async () => {
    const bundle = alertableBundle();
    const a = await runFanout(bundle, [
      sub({ subscriptionId: 'z-last' }),
      sub({ subscriptionId: 'a-first' }),
    ]);
    const b = await runFanout(bundle, [
      sub({ subscriptionId: 'a-first' }),
      sub({ subscriptionId: 'z-last' }),
    ]);
    expect(a.matchedSubscriptions.map((m) => m.subscriptionId)).toEqual([
      'a-first',
      'z-last',
    ]);
    expect(a.matchedSubscriptions).toEqual(b.matchedSubscriptions);
  });

  it('X — malformed subscription', async () => {
    const out = await runFanout(alertableBundle(), [
      sub({
        subscriptionId: 's-x',
        minimumDiscountPercent: 5,
        notificationChannels: [],
      }),
    ]);
    expect(out.stats.malformed).toBe(1);
    expect(out.matchedSubscriptions).toHaveLength(0);
  });

  it('Y — MONEY_PATH_FROZEN=true', async () => {
    const prev = process.env.MONEY_PATH_FROZEN;
    process.env.MONEY_PATH_FROZEN = 'true';
    try {
      expect(isMoneyPathFrozen()).toBe(true);
      const out = await runFanout(alertableBundle(), [sub({ subscriptionId: 's-y' })]);
      expect(out.decision).toBe('MATCH');
    } finally {
      process.env.MONEY_PATH_FROZEN = prev;
    }
  });

  it('Z — economy mutation guard', async () => {
    assertDealAlertsMoneyUntouched();
    const out = await runFanout(alertableBundle(), [sub({ subscriptionId: 's-z' })]);
    expect(out.contractVersion).toBe('deal-alerts.v1');
    expect(out.opportunityIdempotencyKey?.startsWith('da:')).toBe(true);
  });

  it('CRITICAL — 1 opp × 100 subs × 10 concurrent', async () => {
    const bundle = alertableBundle();
    const subs = Array.from({ length: 100 }, (_, i) =>
      sub({
        subscriptionId: `crit-${String(i).padStart(3, '0')}`,
        userId: `user-${i}`,
      }),
    );
    const results = await Promise.all(
      Array.from({ length: 10 }, () => runFanout(bundle, subs)),
    );
    for (const r of results) {
      expect(r.matchedSubscriptions).toHaveLength(100);
      expect(r.stats.duplicates).toBe(0);
      expect(r.duplicateSubscriptions).toHaveLength(0);
    }
    const serialized = results.map((r) =>
      JSON.stringify(r.matchedSubscriptions.map((m) => m.subscriptionId)),
    );
    expect(new Set(serialized).size).toBe(1);
    assertDealAlertsMoneyUntouched();
  });

  it('exclusivity — no matched+suppressed overlap', async () => {
    const out = await runFanout(alertableBundle(), [
      sub({ subscriptionId: 'ok' }),
      sub({ subscriptionId: 'bad', stores: ['amazon'] }),
    ]);
    const matched = new Set(out.matchedSubscriptions.map((m) => m.subscriptionId));
    const suppressed = new Set([
      ...out.suppressedSubscriptions.map((s) => s.subscriptionId),
      ...out.duplicateSubscriptions.map((s) => s.subscriptionId),
    ]);
    for (const id of matched) expect(suppressed.has(id)).toBe(false);
  });
});
