/**
 * S6.1 — AlertSubscription conceptual validation (no persistence).
 */

import {
  DEAL_ALERTS_CONTRACT_VERSION,
  DEAL_ALERTS_SUBSCRIPTION_CAPS,
} from './constants';
import type {
  AlertSubscription,
  AlertSubscriptionCapsViolation,
} from './types';

export type ValidateAlertSubscriptionResult =
  | { ok: true; subscription: AlertSubscription }
  | { ok: false; violations: AlertSubscriptionCapsViolation[] };

/**
 * Validate a conceptual subscription against structural caps.
 * Does not persist. Does not scrape.
 */
export function validateAlertSubscription(
  input: Omit<AlertSubscription, 'contractVersion'> & {
    contractVersion?: string;
  },
  options?: { existingSubscriptionCount?: number },
): ValidateAlertSubscriptionResult {
  const caps = DEAL_ALERTS_SUBSCRIPTION_CAPS;
  const violations: AlertSubscriptionCapsViolation[] = [];

  if (input.stores.length > caps.maxStoresPerSubscription) {
    violations.push('too_many_stores');
  }
  if (input.categories.length > caps.maxCategoriesPerSubscription) {
    violations.push('too_many_categories');
  }
  if (input.minimumDiscountPercent < caps.minDiscountPercent) {
    violations.push('discount_below_minimum');
  }
  if (input.minimumDiscountPercent > caps.maxDiscountPercent) {
    violations.push('discount_above_maximum');
  }
  if (
    input.cooldownSeconds < caps.minCooldownSeconds ||
    input.cooldownSeconds > caps.maxCooldownSeconds
  ) {
    violations.push('cooldown_out_of_range');
  }
  if (input.dailyCap > caps.maxNotificationsPerUserPerDay || input.dailyCap < 1) {
    violations.push('daily_cap_exceeded');
  }
  if (!input.notificationChannels.length) {
    violations.push('empty_channels');
  }
  const existing = options?.existingSubscriptionCount ?? 0;
  if (existing >= caps.maxSubscriptionsPerUser) {
    violations.push('too_many_subscriptions');
  }

  if (violations.length) {
    return { ok: false, violations };
  }

  return {
    ok: true,
    subscription: {
      contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
      userId: input.userId,
      stores: [...input.stores],
      categories: [...input.categories],
      minimumDiscountPercent: input.minimumDiscountPercent,
      notificationChannels: [...input.notificationChannels],
      enabled: input.enabled,
      cooldownSeconds: input.cooldownSeconds,
      dailyCap: input.dailyCap,
    },
  };
}

/** Explicit invariant: subscriptions never authorize per-user scrape jobs. */
export const ALERT_SUBSCRIPTION_NEVER_IMPLIES_USER_SCRAPE = true as const;
