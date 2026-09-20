/**
 * S6.2 — Deal Alerts Decision Layer (deterministic, no delivery).
 *
 * Gate order (documented, fail-closed):
 *  1. identity válida
 *  2. evidencia suficiente
 *  3. freshness
 *  4. relevancia (opportunity-level alertability / opportunity decision)
 *  5. DQE eligibility cuando esté disponible
 *  6. subscription habilitada
 *  7. category/store constraints
 *  8. discount/threshold constraints
 *  9. cooldown
 * 10. frequency cap
 * 11. global idempotency (audit only — does NOT block fanout)
 * 12. dedupe misma oportunidad × subscription (alert identity)
 * 13. decisión final
 */

import { DEAL_ALERTS_CONTRACT_VERSION } from './constants';
import { evaluateAlertDecision } from './decision';
import { validateAlertSubscription } from './subscription';
import { alertIdentityKey } from './identityLayers';
import type { AlertDecisionContext } from './decisionContext';
import type {
  AlertabilityEvidence,
  AlertDecision,
  AlertDecisionResult,
  AlertSubscription,
  DealAlertsDealDetected,
} from './types';
import type { DealDetectedEvent } from '@/lib/dealIntelligence/types';

/** Subscription with stable id for decision / future fanout (S6.1 shape + id). */
export type DecisionSubscription = AlertSubscription & {
  subscriptionId: string;
};

export type EvaluatedRule = {
  gate: number;
  name: string;
  passed: boolean;
  detail: string;
};

export type EligibleSubscriptionMatch = {
  subscriptionId: string;
  userId: string;
  alertIdentityKey: string;
  matchedConstraints: {
    store: string | null;
    category: string | null;
    discountPercent: number | null;
    minimumDiscountPercent: number;
  };
  channels: AlertSubscription['notificationChannels'];
};

export type SuppressedSubscription = {
  subscriptionId: string;
  userId: string;
  reason: string;
  result: AlertDecisionResult;
};

/**
 * Structured Decision Layer result — auditable; no delivery side effects.
 */
export type DealAlertDecisionOutcome = {
  contractVersion: typeof DEAL_ALERTS_CONTRACT_VERSION;
  /** Aggregate decision for this evaluation. */
  decision: AlertDecisionResult;
  reason: string;
  /** S6.1 AlertDecision shape (opportunity-level summary). */
  alertDecision: AlertDecision;
  opportunityFingerprint: string | null;
  /** Global DealDetected key `da:{dw.v1}:{diKey}` — no userId. */
  idempotencyKey: string | null;
  /** True if opportunity key was already seen (audit; fanout still allowed). */
  opportunityAlreadySeen: boolean;
  eligibleSubscriptions: EligibleSubscriptionMatch[];
  suppressedSubscriptions: SuppressedSubscription[];
  evaluatedRules: EvaluatedRule[];
  /** Injected clock — deterministic. */
  createdAt: string;
  /** Minimal metadata for future delivery layer (S6.5). */
  deliveryPrep: {
    channelsUnion: AlertSubscription['notificationChannels'];
    matchCount: number;
    note: 'Decision Layer does not send alerts';
  };
};

export type DecideDealAlertInput = {
  dealDetected: DealDetectedEvent | DealAlertsDealDetected;
  alertability: AlertabilityEvidence;
  subscriptions: DecisionSubscription[];
  context: AlertDecisionContext;
  /**
   * Opportunity category when known.
   * Gap: AlertabilityEvidence has no category field — if subscriptions require
   * categories and this is null/empty → fail-closed NOT_RELEVANT per sub.
   */
  opportunityCategory?: string | null;
  /** Injected clock (required for determinism in tests). */
  now: Date;
  /** When true, record matches into context (test harness). Default false. */
  recordMatches?: boolean;
};

function normalizeToken(s: string): string {
  return s.trim().toLowerCase();
}

function storeMatches(
  opportunityStore: string | null,
  opportunityMerchant: string | null,
  subscriptionStores: string[],
): boolean {
  if (!subscriptionStores.length) return true; // empty = no store filter
  const candidates = [opportunityStore, opportunityMerchant]
    .filter((x): x is string => Boolean(x && x.trim()))
    .map(normalizeToken);
  if (!candidates.length) return false; // sub filters stores but deal has none → fail-closed
  const allowed = new Set(subscriptionStores.map(normalizeToken));
  return candidates.some((c) => allowed.has(c));
}

function categoryMatches(
  opportunityCategory: string | null | undefined,
  subscriptionCategories: string[],
): boolean {
  if (!subscriptionCategories.length) return true;
  if (!opportunityCategory?.trim()) return false; // required but missing → fail-closed
  const allowed = new Set(subscriptionCategories.map(normalizeToken));
  return allowed.has(normalizeToken(opportunityCategory));
}

function pushRule(
  rules: EvaluatedRule[],
  gate: number,
  name: string,
  passed: boolean,
  detail: string,
): void {
  rules.push({ gate, name, passed, detail });
}

/**
 * Deterministic Decision Layer entrypoint.
 * Same inputs + same context state + same `now` → same outcome.
 */
export function decideDealAlert(input: DecideDealAlertInput): DealAlertDecisionOutcome {
  const now = input.now;
  const nowMs = now.getTime();
  const createdAt = now.toISOString();
  const a = input.alertability;
  const rules: EvaluatedRule[] = [];
  const idempotencyKey =
    'idempotencyKey' in input.dealDetected
      ? input.dealDetected.idempotencyKey
      : null;
  const opportunityFingerprint = a.fingerprint;
  const opportunityAlreadySeen = Boolean(
    idempotencyKey && input.context.hasSeenOpportunity(idempotencyKey),
  );

  // --- Gates 1–5: opportunity-level (via alertability + explicit checks) ---
  const identityOk =
    Boolean(opportunityFingerprint?.trim()) && a.identityStatus !== 'unknown';
  pushRule(
    rules,
    1,
    'identity_valid',
    identityOk,
    identityOk
      ? `fingerprint=${opportunityFingerprint};status=${a.identityStatus}`
      : `block=${a.blockReason ?? 'missing_identity_or_fingerprint'}`,
  );

  const evidenceOk =
    a.historyReady &&
    (a.evidenceLevel === 'history_backed' || a.evidenceLevel === 'api_verified') &&
    a.authority.evidenceStrength !== 'WEAK';
  pushRule(
    rules,
    2,
    'evidence_sufficient',
    evidenceOk,
    `level=${a.evidenceLevel};historyReady=${a.historyReady};strength=${a.authority.evidenceStrength}`,
  );

  const freshnessOk = !a.stale;
  pushRule(rules, 3, 'freshness', freshnessOk, a.stale ? 'stale' : 'fresh');

  const relevanceOk = a.authority.opportunityDecision === 'OPPORTUNITY' && a.alertable;
  pushRule(
    rules,
    4,
    'relevance_opportunity',
    relevanceOk,
    `decision=${a.authority.opportunityDecision};alertable=${a.alertable}`,
  );

  const dqe = a.authority.dqeEligible;
  const dqeOk = dqe !== false; // null = not evaluated → pass-through (documented)
  pushRule(
    rules,
    5,
    'dqe_eligibility',
    dqeOk,
    dqe === null ? 'dqe_not_evaluated' : `dqeEligible=${dqe}`,
  );

  // Opportunity-level early exit
  if (!identityOk || !evidenceOk || !freshnessOk || !relevanceOk || !dqeOk || !a.alertable) {
    const summary = evaluateAlertDecision({
      alertability: a,
      dealDetectedIdempotencyKey: idempotencyKey,
      now,
    });
    pushRule(rules, 13, 'final_decision', false, summary.result);
    return {
      contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
      decision: summary.result,
      reason: summary.reason,
      alertDecision: summary,
      opportunityFingerprint,
      idempotencyKey,
      opportunityAlreadySeen,
      eligibleSubscriptions: [],
      suppressedSubscriptions: [],
      evaluatedRules: rules,
      createdAt,
      deliveryPrep: {
        channelsUnion: [],
        matchCount: 0,
        note: 'Decision Layer does not send alerts',
      },
    };
  }

  // Gate 11 — global idempotency audit (does NOT suppress fanout)
  pushRule(
    rules,
    11,
    'global_idempotency_audit',
    true,
    opportunityAlreadySeen
      ? 'opportunity_seen_fanout_allowed'
      : 'opportunity_first_seen',
  );

  const eligible: EligibleSubscriptionMatch[] = [];
  const suppressed: SuppressedSubscription[] = [];

  for (const rawSub of input.subscriptions) {
    const validation = validateAlertSubscription(rawSub);
    if (!validation.ok) {
      pushRule(
        rules,
        6,
        `subscription_malformed:${rawSub.subscriptionId}`,
        false,
        validation.violations.join(','),
      );
      suppressed.push({
        subscriptionId: rawSub.subscriptionId,
        userId: rawSub.userId,
        reason: `malformed:${validation.violations.join(',')}`,
        result: 'SUPPRESS',
      });
      continue;
    }
    const sub = { ...validation.subscription, subscriptionId: rawSub.subscriptionId };

    // Gate 6 — enabled
    if (!sub.enabled) {
      pushRule(rules, 6, `subscription_enabled:${sub.subscriptionId}`, false, 'disabled');
      suppressed.push({
        subscriptionId: sub.subscriptionId,
        userId: sub.userId,
        reason: 'subscription_disabled',
        result: 'SUPPRESS',
      });
      continue;
    }
    pushRule(rules, 6, `subscription_enabled:${sub.subscriptionId}`, true, 'enabled');

    // Gate 7 — store / category
    const storeOk = storeMatches(a.store, a.merchant, sub.stores);
    pushRule(
      rules,
      7,
      `store_constraint:${sub.subscriptionId}`,
      storeOk,
      storeOk ? 'store_match' : 'store_mismatch',
    );
    if (!storeOk) {
      suppressed.push({
        subscriptionId: sub.subscriptionId,
        userId: sub.userId,
        reason: 'store_mismatch',
        result: 'NOT_RELEVANT',
      });
      continue;
    }

    const catOk = categoryMatches(input.opportunityCategory, sub.categories);
    pushRule(
      rules,
      7,
      `category_constraint:${sub.subscriptionId}`,
      catOk,
      catOk ? 'category_match_or_unfiltered' : 'category_mismatch_or_missing',
    );
    if (!catOk) {
      suppressed.push({
        subscriptionId: sub.subscriptionId,
        userId: sub.userId,
        reason: 'category_mismatch',
        result: 'NOT_RELEVANT',
      });
      continue;
    }

    // Gate 8 — discount threshold
    const discount = a.discountPercent;
    const discountOk =
      discount != null && Number.isFinite(discount) && discount >= sub.minimumDiscountPercent;
    pushRule(
      rules,
      8,
      `discount_threshold:${sub.subscriptionId}`,
      discountOk,
      `discount=${discount};min=${sub.minimumDiscountPercent}`,
    );
    if (!discountOk) {
      suppressed.push({
        subscriptionId: sub.subscriptionId,
        userId: sub.userId,
        reason: 'discount_below_threshold',
        result: 'NOT_RELEVANT',
      });
      continue;
    }

    const alertKey = alertIdentityKey({
      opportunityFingerprint: opportunityFingerprint!,
      subscriptionId: sub.subscriptionId,
    });

    // Gate 12 — per-subscription dedupe (alert identity)
    if (input.context.hasMatchedAlert(alertKey)) {
      pushRule(rules, 12, `alert_dedupe:${sub.subscriptionId}`, false, 'duplicate_alert');
      suppressed.push({
        subscriptionId: sub.subscriptionId,
        userId: sub.userId,
        reason: 'duplicate_alert_identity',
        result: 'DUPLICATE',
      });
      continue;
    }
    pushRule(rules, 12, `alert_dedupe:${sub.subscriptionId}`, true, 'new_alert_identity');

    // Gate 9 — cooldown
    const cool = input.context.isCooldownActive({
      subscriptionId: sub.subscriptionId,
      opportunityFingerprint: opportunityFingerprint!,
      cooldownSeconds: sub.cooldownSeconds,
      nowMs,
    });
    pushRule(
      rules,
      9,
      `cooldown:${sub.subscriptionId}`,
      !cool,
      cool ? 'cooldown_active' : 'cooldown_clear',
    );
    if (cool) {
      suppressed.push({
        subscriptionId: sub.subscriptionId,
        userId: sub.userId,
        reason: 'cooldown_active',
        result: 'RATE_LIMITED',
      });
      continue;
    }

    // Gate 10 — frequency cap
    const count = input.context.getSubscriptionAlertCountToday({
      subscriptionId: sub.subscriptionId,
      nowMs,
    });
    const capOk = count < sub.dailyCap;
    pushRule(
      rules,
      10,
      `frequency_cap:${sub.subscriptionId}`,
      capOk,
      `count=${count};cap=${sub.dailyCap}`,
    );
    if (!capOk) {
      suppressed.push({
        subscriptionId: sub.subscriptionId,
        userId: sub.userId,
        reason: 'frequency_cap_reached',
        result: 'RATE_LIMITED',
      });
      continue;
    }

    const match: EligibleSubscriptionMatch = {
      subscriptionId: sub.subscriptionId,
      userId: sub.userId,
      alertIdentityKey: alertKey,
      matchedConstraints: {
        store: a.store ?? a.merchant,
        category: input.opportunityCategory?.trim() || null,
        discountPercent: discount,
        minimumDiscountPercent: sub.minimumDiscountPercent,
      },
      channels: [...sub.notificationChannels],
    };
    eligible.push(match);

    if (input.recordMatches) {
      input.context.recordMatch?.({
        subscriptionId: sub.subscriptionId,
        opportunityFingerprint: opportunityFingerprint!,
        alertIdentityKey: alertKey,
        nowMs,
      });
      input.context.markAlertMatched?.(alertKey);
    }
  }

  // Gate 13 — final aggregate
  let decision: AlertDecisionResult;
  let reason: string;
  if (eligible.length > 0) {
    decision = 'MATCH';
    reason = `matched_subscriptions=${eligible.length}`;
  } else if (suppressed.every((s) => s.result === 'DUPLICATE') && suppressed.length > 0) {
    decision = 'DUPLICATE';
    reason = 'all_subscriptions_duplicate_alert';
  } else if (suppressed.some((s) => s.result === 'RATE_LIMITED') && suppressed.every((s) => s.result === 'RATE_LIMITED' || s.result === 'DUPLICATE')) {
    decision = 'RATE_LIMITED';
    reason = 'all_eligible_rate_limited';
  } else if (suppressed.length > 0) {
    decision = 'NOT_RELEVANT';
    reason = 'no_subscription_matched';
  } else {
    decision = 'NOT_RELEVANT';
    reason = 'no_subscriptions_provided';
  }

  pushRule(rules, 13, 'final_decision', decision === 'MATCH', `${decision}:${reason}`);

  if (input.recordMatches && idempotencyKey) {
    input.context.markOpportunitySeen?.(idempotencyKey);
  }

  const alertDecision = evaluateAlertDecision({
    alertability: a,
    dealDetectedIdempotencyKey: idempotencyKey,
    duplicateOfExisting: decision === 'DUPLICATE',
    rateLimited: decision === 'RATE_LIMITED',
    relevantToCriteria: decision === 'NOT_RELEVANT' ? false : decision === 'MATCH' ? true : null,
    now,
  });

  // Prefer aggregate decision from Decision Layer over mapper when MATCH with fanout
  const finalDecision =
    decision === 'MATCH'
      ? ({ ...alertDecision, result: 'MATCH' as const, reason })
      : decision === 'DUPLICATE'
        ? ({ ...alertDecision, result: 'DUPLICATE' as const, reason })
        : decision === 'RATE_LIMITED'
          ? ({ ...alertDecision, result: 'RATE_LIMITED' as const, reason })
          : decision === 'NOT_RELEVANT'
            ? ({ ...alertDecision, result: 'NOT_RELEVANT' as const, reason })
            : alertDecision;

  const channelsUnion = [
    ...new Set(eligible.flatMap((e) => e.channels)),
  ] as AlertSubscription['notificationChannels'];

  return {
    contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
    decision: finalDecision.result,
    reason: finalDecision.reason,
    alertDecision: finalDecision,
    opportunityFingerprint,
    idempotencyKey,
    opportunityAlreadySeen,
    eligibleSubscriptions: eligible,
    suppressedSubscriptions: suppressed,
    evaluatedRules: rules,
    createdAt,
    deliveryPrep: {
      channelsUnion,
      matchCount: eligible.length,
      note: 'Decision Layer does not send alerts',
    },
  };
}
