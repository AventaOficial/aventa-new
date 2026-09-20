/**
 * S6.4 — Persistence + candidate index tests (matrix A–AA).
 * Uses InMemory store mirroring Postgres semantics (no silent prod DDL).
 */

import { describe, expect, it } from 'vitest';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import type { OpportunityEvidence, OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import {
  DEAL_ALERTS_CONTRACT_VERSION,
  DEAL_ALERTS_SUBSCRIPTION_CAPS,
  assertDealAlertsMoneyUntouched,
  buildDealAlertsDealDetected,
  classifyFanoutClass,
  createInMemoryAlertSubscriptionStore,
  createInMemoryAlertDecisionContext,
  createPostgresSubscriptionCandidateIndex,
  fanoutDealAlert,
  toDecisionSubscription,
} from '@/lib/dealAlerts';

const NOW = new Date('2026-09-19T18:00:00.000Z');
const CAPS = DEAL_ALERTS_SUBSCRIPTION_CAPS;

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
    productFingerprint: overrides.productFingerprint ?? 'ml:MLM640',
    signals: {},
    ...overrides,
  };
}

function alertableBundle(opts?: {
  store?: string;
  discountPercent?: number;
  category?: string;
}) {
  const evidence = makeEvidence({
    evidenceLevel: 'history_backed',
    historyReady: true,
    discountPercent: opts?.discountPercent ?? 50,
  });
  const evaluation: OpportunityEvaluation = {
    candidateUrl: 'https://www.mercadolibre.com.mx/item/MLM640',
    productFingerprint: evidence.productFingerprint,
    decision: 'OPPORTUNITY',
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
    evaluatedAt: NOW.toISOString(),
    dryRun: false,
    adapterNotes: [],
  };
  const deal = buildDealAlertsDealDetected({
    evaluation,
    store: opts?.store ?? 'mercadolibre',
    merchant: 'mercadolibre',
    dqeEligible: true,
    evidenceStrength: 'STRONG',
    now: NOW,
  });
  return {
    deal,
    alertability: deal.alertability,
    category: opts?.category ?? 'tecnologia',
  };
}

function baseCreate(userId: string, partial?: Partial<Parameters<ReturnType<typeof createInMemoryAlertSubscriptionStore>['create']>[0]>) {
  return {
    userId,
    stores: ['mercadolibre'],
    categories: ['tecnologia'],
    minimumDiscountPercent: 40,
    notificationChannels: ['in_app' as const],
    cooldownSeconds: CAPS.defaultCooldownSeconds,
    dailyCap: 10,
    ...partial,
  };
}

describe('S6.4 Persistence + Candidate Index', () => {
  it('A — create subscription', () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(baseCreate('user-a'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.version).toBe(1);
    expect(created.value.contractVersion).toBe(DEAL_ALERTS_CONTRACT_VERSION);
    expect(created.value.fanoutClass).toBe('narrow');
  });

  it('B — read own subscription', () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(baseCreate('user-b'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const got = store.getOwn({
      subscriptionId: created.value.subscriptionId,
      userId: 'user-b',
    });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.userId).toBe('user-b');
  });

  it('C — update own subscription', () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(baseCreate('user-c'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const updated = store.update({
      subscriptionId: created.value.subscriptionId,
      userId: 'user-c',
      expectedVersion: 1,
      minimumDiscountPercent: 45,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.version).toBe(2);
    expect(updated.value.minimumDiscountPercent).toBe(45);
  });

  it('D — disable subscription', () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(baseCreate('user-d'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const disabled = store.disable({
      subscriptionId: created.value.subscriptionId,
      userId: 'user-d',
      expectedVersion: 1,
    });
    expect(disabled.ok).toBe(true);
    if (!disabled.ok) return;
    expect(disabled.value.enabled).toBe(false);
    expect(disabled.value.version).toBe(2);
  });

  it('E — RLS cross-user read rejected', () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(baseCreate('owner'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const got = store.getAsUser({
      subscriptionId: created.value.subscriptionId,
      actingUserId: 'intruder',
    });
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.code).toBe('forbidden');
  });

  it('F — RLS cross-user update rejected', () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(baseCreate('owner'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const upd = store.updateAsUser({
      subscriptionId: created.value.subscriptionId,
      userId: 'owner',
      actingUserId: 'intruder',
      expectedVersion: 1,
      enabled: false,
    });
    expect(upd.ok).toBe(false);
    if (upd.ok) return;
    expect(upd.code).toBe('forbidden');
  });

  it('G — candidate retrieval by store', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    store.create(baseCreate('u1', { stores: ['amazon'] }));
    store.create(baseCreate('u2', { stores: ['mercadolibre'] }));
    const set = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: 'mercadolibre',
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    expect(set.subscriptions).toHaveLength(1);
    expect(set.subscriptions[0]?.stores).toContain('mercadolibre');
  });

  it('H — candidate retrieval by category', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    store.create(baseCreate('u1', { categories: ['hogar'] }));
    store.create(baseCreate('u2', { categories: ['tecnologia'] }));
    const set = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    expect(set.subscriptions).toHaveLength(1);
    expect(set.subscriptions[0]?.categories).toContain('tecnologia');
  });

  it('I — candidate retrieval by discount', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    store.create(baseCreate('u1', { minimumDiscountPercent: 60 }));
    store.create(baseCreate('u2', { minimumDiscountPercent: 30 }));
    const set = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    expect(set.subscriptions).toHaveLength(1);
    expect(set.subscriptions[0]?.minimumDiscountPercent).toBe(30);
  });

  it('J — combined filters', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    store.create(
      baseCreate('u1', {
        stores: ['amazon'],
        categories: ['tecnologia'],
        minimumDiscountPercent: 30,
      }),
    );
    store.create(
      baseCreate('u2', {
        stores: ['mercadolibre'],
        categories: ['hogar'],
        minimumDiscountPercent: 30,
      }),
    );
    store.create(
      baseCreate('u3', {
        stores: ['mercadolibre'],
        categories: ['tecnologia'],
        minimumDiscountPercent: 30,
      }),
    );
    const set = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    expect(set.subscriptions).toHaveLength(1);
    expect(set.subscriptions[0]?.userId).toBe('u3');
  });

  it('K — broad subscription', () => {
    expect(classifyFanoutClass([], ['tecnologia']).fanoutClass).toBe('broad');
    expect(classifyFanoutClass(['amazon'], []).fanoutClass).toBe('broad');
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(
      baseCreate('u-broad', { stores: [], categories: ['tecnologia'] }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.isBroad).toBe(true);
    expect(created.value.fanoutClass).toBe('broad');
  });

  it('L — narrow subscription', () => {
    expect(classifyFanoutClass(['amazon'], ['tecnologia']).fanoutClass).toBe(
      'narrow',
    );
  });

  it('M — zero candidates', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    store.create(baseCreate('u1', { stores: ['amazon'] }));
    const set = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    expect(set.subscriptions).toHaveLength(0);
  });

  it('N — candidate limit', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    for (let i = 0; i < 5; i++) {
      store.create(
        baseCreate(`u-${i}`, {
          stores: [],
          categories: [],
          minimumDiscountPercent: 20,
        }),
      );
    }
    const set = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
      candidateLimit: 3,
    });
    expect(set.stats.candidateLimitReached).toBe(true);
    expect(set.subscriptions).toHaveLength(3);
    const bundle = alertableBundle();
    const fanout = await fanoutDealAlert({
      dealDetected: bundle.deal,
      alertability: bundle.alertability,
      candidateIndex: store.asCandidateIndex(),
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: bundle.category,
      now: NOW,
      candidateLimit: 3,
      enabledOnly: true,
    });
    expect(fanout.candidateLimitReached).toBe(true);
    expect(fanout.decision).toBe('SUPPRESS');
    expect(fanout.matchedSubscriptions).toHaveLength(0);
  });

  it('O — deterministic ordering', async () => {
    const store = createInMemoryAlertSubscriptionStore({
      clock: () => NOW,
      idFactory: (() => {
        const ids = ['c', 'a', 'b'];
        let i = 0;
        return () => ids[i++]!;
      })(),
    });
    store.create(baseCreate('u1'));
    store.create(baseCreate('u2'));
    store.create(baseCreate('u3'));
    const a = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    const b = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    expect(a.subscriptions.map((s) => s.subscriptionId)).toEqual(['a', 'b', 'c']);
    expect(a.subscriptions.map((s) => s.subscriptionId)).toEqual(
      b.subscriptions.map((s) => s.subscriptionId),
    );
  });

  it('P — disabled subscription excluded (enabledOnly)', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(baseCreate('u1'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    store.disable({
      subscriptionId: created.value.subscriptionId,
      userId: 'u1',
      expectedVersion: 1,
    });
    const set = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    expect(set.subscriptions).toHaveLength(0);
  });

  it('Q — malformed persisted data', () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const bad = store.create(
      baseCreate('u1', {
        minimumDiscountPercent: 5,
        notificationChannels: [],
      }),
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe('validation_failed');
  });

  it('R — subscription update race (version)', () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(baseCreate('u1'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = store.update({
      subscriptionId: created.value.subscriptionId,
      userId: 'u1',
      expectedVersion: 1,
      minimumDiscountPercent: 42,
    });
    expect(first.ok).toBe(true);
    const stale = store.update({
      subscriptionId: created.value.subscriptionId,
      userId: 'u1',
      expectedVersion: 1,
      minimumDiscountPercent: 55,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.code).toBe('version_mismatch');
  });

  it('S — version mismatch', () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    const created = store.create(baseCreate('u1'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const bad = store.update({
      subscriptionId: created.value.subscriptionId,
      userId: 'u1',
      expectedVersion: 99,
      enabled: false,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe('version_mismatch');
  });

  it('T — same opportunity multiple subscriptions', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    store.create(baseCreate('u1'));
    store.create(baseCreate('u2'));
    store.create(baseCreate('u3'));
    const bundle = alertableBundle();
    const out = await fanoutDealAlert({
      dealDetected: bundle.deal,
      alertability: bundle.alertability,
      candidateIndex: store.asCandidateIndex(),
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: bundle.category,
      now: NOW,
      enabledOnly: true,
    });
    expect(out.matchedSubscriptions).toHaveLength(3);
  });

  it('U — same user multiple subscriptions', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    store.create(baseCreate('same', { categories: ['tecnologia'] }));
    store.create(
      baseCreate('same', {
        stores: [],
        categories: [],
        minimumDiscountPercent: 40,
      }),
    );
    const bundle = alertableBundle();
    const out = await fanoutDealAlert({
      dealDetected: bundle.deal,
      alertability: bundle.alertability,
      candidateIndex: store.asCandidateIndex(),
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: bundle.category,
      now: NOW,
      enabledOnly: true,
    });
    expect(out.matchedSubscriptions).toHaveLength(2);
    expect(out.matchedSubscriptions.every((m) => m.userId === 'same')).toBe(true);
  });

  it('V — candidate retrieval ≠ decision', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    store.create(baseCreate('u1'));
    const candidates = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    expect(candidates).not.toHaveProperty('decision');
    expect(candidates.retrievalSource).toContain('in_memory');
  });

  it('W — candidate false positive handled by S6.2', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    // Broad wildcard will be retrieved, but category filter empty means match;
    // create a sub that passes index store/category but fails cooldown in decision.
    const created = store.create(baseCreate('u1'));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const bundle = alertableBundle();
    const fp = bundle.alertability.fingerprint!;
    const ctx = createInMemoryAlertDecisionContext({
      lastMatchAt: new Map([
        [`${created.value.subscriptionId}|${fp}`, NOW.getTime() - 1000],
      ]),
    });
    const out = await fanoutDealAlert({
      dealDetected: bundle.deal,
      alertability: bundle.alertability,
      candidateIndex: store.asCandidateIndex(),
      context: ctx,
      opportunityCategory: bundle.category,
      now: NOW,
      enabledOnly: true,
    });
    expect(out.stats.candidatesFound).toBe(1);
    expect(out.matchedSubscriptions).toHaveLength(0);
    expect(out.decision).toBe('RATE_LIMITED');
  });

  it('X — 100 subscriptions', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    for (let i = 0; i < 100; i++) {
      store.create(baseCreate(`user-${i}`));
    }
    const bundle = alertableBundle();
    const t0 = Date.now();
    const candidates = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    const retrievalMs = Date.now() - t0;
    expect(candidates.subscriptions).toHaveLength(100);
    const t1 = Date.now();
    const out = await fanoutDealAlert({
      dealDetected: bundle.deal,
      alertability: bundle.alertability,
      candidateIndex: store.asCandidateIndex(),
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: bundle.category,
      now: NOW,
      enabledOnly: true,
    });
    const fanoutMs = Date.now() - t1;
    expect(out.matchedSubscriptions).toHaveLength(100);
    expect(retrievalMs).toBeLessThan(500);
    expect(fanoutMs).toBeLessThan(2000);
  });

  it('Y — 1,000 subscriptions staging-style benchmark', async () => {
    const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
    for (let i = 0; i < 1000; i++) {
      // Mix: 10% match mercadolibre+tecnologia; rest noise
      if (i % 10 === 0) {
        store.create(baseCreate(`hit-${i}`));
      } else {
        store.create(
          baseCreate(`noise-${i}`, {
            stores: ['amazon'],
            categories: ['hogar'],
          }),
        );
      }
    }
    const t0 = Date.now();
    const candidates = await store.asCandidateIndex().findCandidates({
      store: 'mercadolibre',
      merchant: null,
      category: 'tecnologia',
      discountPercent: 50,
      enabledOnly: true,
    });
    const retrievalMs = Date.now() - t0;
    expect(candidates.subscriptions.length).toBe(100);
    const bundle = alertableBundle();
    const t1 = Date.now();
    const out = await fanoutDealAlert({
      dealDetected: bundle.deal,
      alertability: bundle.alertability,
      candidateIndex: store.asCandidateIndex(),
      context: createInMemoryAlertDecisionContext(),
      opportunityCategory: bundle.category,
      now: NOW,
      enabledOnly: true,
    });
    const decisionMs = Date.now() - t1;
    expect(out.matchedSubscriptions).toHaveLength(100);
    // Controlled synthetic benchmark — architecture proof, not 1M claim
    expect(retrievalMs).toBeLessThan(2000);
    expect(decisionMs).toBeLessThan(5000);
    expect(candidates.stats.candidateLimitReached).toBe(false);
  });

  it('Z — MONEY_PATH_FROZEN', async () => {
    const prev = process.env.MONEY_PATH_FROZEN;
    process.env.MONEY_PATH_FROZEN = 'true';
    try {
      expect(isMoneyPathFrozen()).toBe(true);
      const store = createInMemoryAlertSubscriptionStore({ clock: () => NOW });
      const created = store.create(baseCreate('u-z'));
      expect(created.ok).toBe(true);
      const bundle = alertableBundle();
      const out = await fanoutDealAlert({
        dealDetected: bundle.deal,
        alertability: bundle.alertability,
        candidateIndex: store.asCandidateIndex(),
        context: createInMemoryAlertDecisionContext(),
        opportunityCategory: bundle.category,
        now: NOW,
        enabledOnly: true,
      });
      expect(out.decision).toBe('MATCH');
    } finally {
      process.env.MONEY_PATH_FROZEN = prev;
    }
  });

  it('AA — economy mutation guard', () => {
    assertDealAlertsMoneyUntouched();
    // Factory must not touch money modules
    expect(() =>
      createPostgresSubscriptionCandidateIndex({
        rpc: async () => ({ data: [], error: null }),
      } as never),
    ).not.toThrow();
    const row = toDecisionSubscription({
      subscriptionId: 'x',
      userId: 'u',
      enabled: true,
      stores: ['mercadolibre'],
      categories: ['tecnologia'],
      minimumDiscountPercent: 40,
      notificationChannels: ['in_app'],
      cooldownSeconds: CAPS.defaultCooldownSeconds,
      dailyCap: 10,
      version: 1,
      isBroad: false,
      fanoutClass: 'narrow',
      contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(row.subscriptionId).toBe('x');
  });

  it('high_fanout structural class', () => {
    expect(classifyFanoutClass([], []).fanoutClass).toBe('high_fanout');
  });
});
