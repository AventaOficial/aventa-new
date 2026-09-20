/**
 * S6.2 — Injectable decision context (cooldown / frequency / dedupe).
 * In-memory for tests; replaceable by Redis later without changing decideDealAlert.
 */

export type AlertDecisionContext = {
  /**
   * Opportunity-level: has this DealDetected idempotency key been seen?
   * Informational for audit — MUST NOT block all subscriptions (fanout-safe).
   */
  hasSeenOpportunity(dealDetectedIdempotencyKey: string): boolean;

  /** Mark opportunity as seen (optional side-effect for deterministic test harness). */
  markOpportunitySeen?(dealDetectedIdempotencyKey: string): void;

  /**
   * Subscription already matched this opportunity fingerprint (per-alert dedupe).
   */
  hasMatchedAlert(alertIdentityKey: string): boolean;

  markAlertMatched?(alertIdentityKey: string): void;

  /**
   * Cooldown active for (subscription, opportunity fingerprint).
   */
  isCooldownActive(input: {
    subscriptionId: string;
    opportunityFingerprint: string;
    cooldownSeconds: number;
    nowMs: number;
  }): boolean;

  /**
   * Alerts already counted for this subscription in the current day window.
   */
  getSubscriptionAlertCountToday(input: {
    subscriptionId: string;
    nowMs: number;
  }): number;

  /** Optional: record a match for subsequent cooldown/cap checks in same harness. */
  recordMatch?(input: {
    subscriptionId: string;
    opportunityFingerprint: string;
    alertIdentityKey: string;
    nowMs: number;
  }): void;
};

/**
 * Deterministic in-memory context for tests / local evaluation.
 * Not for production persistence.
 */
export function createInMemoryAlertDecisionContext(seed?: {
  seenOpportunityKeys?: Iterable<string>;
  matchedAlertKeys?: Iterable<string>;
  /** lastMatchMs by `${subscriptionId}|${opportunityFingerprint}` */
  lastMatchAt?: Map<string, number>;
  /** count by `${subscriptionId}|${utcDay}` */
  dailyCounts?: Map<string, number>;
}): AlertDecisionContext & {
  snapshot: () => {
    seenOpportunityKeys: string[];
    matchedAlertKeys: string[];
  };
} {
  const seenOpp = new Set(seed?.seenOpportunityKeys ?? []);
  const matchedAlerts = new Set(seed?.matchedAlertKeys ?? []);
  const lastMatchAt = seed?.lastMatchAt ?? new Map<string, number>();
  const dailyCounts = seed?.dailyCounts ?? new Map<string, number>();

  function utcDay(nowMs: number): string {
    return new Date(nowMs).toISOString().slice(0, 10);
  }

  function cooldownKey(subscriptionId: string, fp: string): string {
    return `${subscriptionId}|${fp}`;
  }

  return {
    hasSeenOpportunity(key) {
      return seenOpp.has(key);
    },
    markOpportunitySeen(key) {
      seenOpp.add(key);
    },
    hasMatchedAlert(key) {
      return matchedAlerts.has(key);
    },
    markAlertMatched(key) {
      matchedAlerts.add(key);
    },
    isCooldownActive({ subscriptionId, opportunityFingerprint, cooldownSeconds, nowMs }) {
      const at = lastMatchAt.get(cooldownKey(subscriptionId, opportunityFingerprint));
      if (at == null) return false;
      return nowMs - at < cooldownSeconds * 1000;
    },
    getSubscriptionAlertCountToday({ subscriptionId, nowMs }) {
      return dailyCounts.get(`${subscriptionId}|${utcDay(nowMs)}`) ?? 0;
    },
    recordMatch({ subscriptionId, opportunityFingerprint, alertIdentityKey, nowMs }) {
      matchedAlerts.add(alertIdentityKey);
      lastMatchAt.set(cooldownKey(subscriptionId, opportunityFingerprint), nowMs);
      const dk = `${subscriptionId}|${utcDay(nowMs)}`;
      dailyCounts.set(dk, (dailyCounts.get(dk) ?? 0) + 1);
    },
    snapshot() {
      return {
        seenOpportunityKeys: [...seenOpp],
        matchedAlertKeys: [...matchedAlerts],
      };
    },
  };
}
