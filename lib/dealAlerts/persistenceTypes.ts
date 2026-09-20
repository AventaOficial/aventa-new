/**
 * S6.4 — Persisted AlertSubscription types + structural fanout class.
 */

import type { DEAL_ALERTS_CONTRACT_VERSION } from './constants';
import type { AlertNotificationChannel } from './types';
import type { DecisionSubscription } from './decideDealAlert';

export type DealAlertFanoutClass = 'narrow' | 'broad' | 'high_fanout';

/**
 * Canonical persisted subscription row (matches deal_alert_subscriptions).
 * Ownership: user_id → auth.users (same as profiles.id).
 */
export type PersistedAlertSubscription = {
  subscriptionId: string;
  userId: string;
  enabled: boolean;
  stores: string[];
  categories: string[];
  minimumDiscountPercent: number;
  notificationChannels: AlertNotificationChannel[];
  cooldownSeconds: number;
  dailyCap: number;
  version: number;
  isBroad: boolean;
  fanoutClass: DealAlertFanoutClass;
  contractVersion: typeof DEAL_ALERTS_CONTRACT_VERSION | string;
  createdAt: string;
  updatedAt: string;
};

export type CreateAlertSubscriptionInput = {
  userId: string;
  stores: string[];
  categories: string[];
  minimumDiscountPercent: number;
  notificationChannels: AlertNotificationChannel[];
  enabled?: boolean;
  cooldownSeconds: number;
  dailyCap: number;
};

export type UpdateAlertSubscriptionInput = {
  subscriptionId: string;
  userId: string;
  /** Optimistic concurrency — must match current version. */
  expectedVersion: number;
  stores?: string[];
  categories?: string[];
  minimumDiscountPercent?: number;
  notificationChannels?: AlertNotificationChannel[];
  enabled?: boolean;
  cooldownSeconds?: number;
  dailyCap?: number;
};

export type SubscriptionPersistenceErrorCode =
  | 'validation_failed'
  | 'not_found'
  | 'version_mismatch'
  | 'cap_exceeded'
  | 'forbidden'
  | 'storage_error'
  | 'malformed_row';

export type SubscriptionPersistenceResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: SubscriptionPersistenceErrorCode;
      message: string;
      violations?: string[];
    };

export function classifyFanoutClass(
  stores: string[],
  categories: string[],
): { isBroad: boolean; fanoutClass: DealAlertFanoutClass } {
  const storeCount = stores.filter((s) => s.trim()).length;
  const catCount = categories.filter((c) => c.trim()).length;
  if (storeCount === 0 && catCount === 0) {
    return { isBroad: true, fanoutClass: 'high_fanout' };
  }
  if (storeCount === 0 || catCount === 0) {
    return { isBroad: true, fanoutClass: 'broad' };
  }
  return { isBroad: false, fanoutClass: 'narrow' };
}

export function toDecisionSubscription(
  row: PersistedAlertSubscription,
): DecisionSubscription {
  return {
    contractVersion: row.contractVersion as DecisionSubscription['contractVersion'],
    subscriptionId: row.subscriptionId,
    userId: row.userId,
    stores: [...row.stores],
    categories: [...row.categories],
    minimumDiscountPercent: row.minimumDiscountPercent,
    notificationChannels: [...row.notificationChannels],
    enabled: row.enabled,
    cooldownSeconds: row.cooldownSeconds,
    dailyCap: row.dailyCap,
  };
}

/** Columns required for S6.2/S6.3 — never SELECT *. */
export const DEAL_ALERT_SUBSCRIPTION_SELECT_COLUMNS = [
  'id',
  'user_id',
  'enabled',
  'stores',
  'categories',
  'minimum_discount_percent',
  'notification_channels',
  'cooldown_seconds',
  'daily_cap',
  'version',
  'is_broad',
  'fanout_class',
  'contract_version',
  'created_at',
  'updated_at',
].join(', ');
