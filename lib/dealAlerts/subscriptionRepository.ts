/**
 * S6.4 — Postgres AlertSubscription repository (Supabase).
 * User CRUD uses authenticated client (RLS). Candidate path uses service_role RPC.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEAL_ALERTS_CONTRACT_VERSION,
  DEAL_ALERTS_SUBSCRIPTION_CAPS,
  DEAL_ALERT_SUBSCRIPTIONS_TABLE,
} from './constants';
import { validateAlertSubscription } from './subscription';
import { assertDealAlertsMoneyUntouched } from './safety';
import {
  DEAL_ALERT_SUBSCRIPTION_SELECT_COLUMNS,
  classifyFanoutClass,
  type CreateAlertSubscriptionInput,
  type PersistedAlertSubscription,
  type SubscriptionPersistenceResult,
  type UpdateAlertSubscriptionInput,
} from './persistenceTypes';
import type { AlertNotificationChannel } from './types';

type DbRow = {
  id: string;
  user_id: string;
  enabled: boolean;
  stores: string[] | null;
  categories: string[] | null;
  minimum_discount_percent: number | string;
  notification_channels: string[] | null;
  cooldown_seconds: number;
  daily_cap: number;
  version: number;
  is_broad: boolean;
  fanout_class: string;
  contract_version: string;
  created_at: string;
  updated_at: string;
};

const CHANNELS: AlertNotificationChannel[] = ['in_app', 'email_digest'];

function normalizeTokens(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function parseChannels(raw: string[] | null): AlertNotificationChannel[] {
  const out: AlertNotificationChannel[] = [];
  for (const c of raw ?? []) {
    const n = c.trim().toLowerCase();
    if ((CHANNELS as string[]).includes(n)) {
      out.push(n as AlertNotificationChannel);
    }
  }
  return out;
}

export function mapDealAlertSubscriptionRow(
  row: DbRow,
): SubscriptionPersistenceResult<PersistedAlertSubscription> {
  const channels = parseChannels(row.notification_channels);
  if (!channels.length) {
    return {
      ok: false,
      code: 'malformed_row',
      message: 'empty or unknown notification_channels',
    };
  }
  const stores = normalizeTokens(row.stores ?? []);
  const categories = normalizeTokens(row.categories ?? []);
  const fanout =
    row.fanout_class === 'narrow' ||
    row.fanout_class === 'broad' ||
    row.fanout_class === 'high_fanout'
      ? row.fanout_class
      : classifyFanoutClass(stores, categories).fanoutClass;

  return {
    ok: true,
    value: {
      subscriptionId: row.id,
      userId: row.user_id,
      enabled: row.enabled === true,
      stores,
      categories,
      minimumDiscountPercent: Number(row.minimum_discount_percent),
      notificationChannels: channels,
      cooldownSeconds: row.cooldown_seconds,
      dailyCap: row.daily_cap,
      version: row.version,
      isBroad: row.is_broad === true,
      fanoutClass: fanout,
      contractVersion: row.contract_version || DEAL_ALERTS_CONTRACT_VERSION,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}

export type DealAlertSubscriptionRepository = {
  create(
    input: CreateAlertSubscriptionInput,
  ): Promise<SubscriptionPersistenceResult<PersistedAlertSubscription>>;
  getOwn(input: {
    subscriptionId: string;
    userId: string;
  }): Promise<SubscriptionPersistenceResult<PersistedAlertSubscription>>;
  listOwn(
    userId: string,
  ): Promise<SubscriptionPersistenceResult<PersistedAlertSubscription[]>>;
  update(
    input: UpdateAlertSubscriptionInput,
  ): Promise<SubscriptionPersistenceResult<PersistedAlertSubscription>>;
  disable(input: {
    subscriptionId: string;
    userId: string;
    expectedVersion: number;
  }): Promise<SubscriptionPersistenceResult<PersistedAlertSubscription>>;
};

/**
 * @param client Authenticated user client for RLS, or service_role for backend ops
 *               that already enforce userId in filters.
 */
export function createDealAlertSubscriptionRepository(
  client: SupabaseClient,
): DealAlertSubscriptionRepository {
  assertDealAlertsMoneyUntouched();

  async function countForUser(userId: string): Promise<number> {
    const { count, error } = await client
      .from(DEAL_ALERT_SUBSCRIPTIONS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  return {
    async create(input) {
      const stores = normalizeTokens(input.stores);
      const categories = normalizeTokens(input.categories);
      const channels = normalizeTokens(
        input.notificationChannels,
      ) as AlertNotificationChannel[];
      let existing = 0;
      try {
        existing = await countForUser(input.userId);
      } catch (err) {
        return {
          ok: false,
          code: 'storage_error',
          message: err instanceof Error ? err.message : String(err),
        };
      }
      const validation = validateAlertSubscription(
        {
          userId: input.userId,
          stores,
          categories,
          minimumDiscountPercent: input.minimumDiscountPercent,
          notificationChannels: channels,
          enabled: input.enabled ?? true,
          cooldownSeconds: input.cooldownSeconds,
          dailyCap: input.dailyCap,
        },
        { existingSubscriptionCount: existing },
      );
      if (!validation.ok) {
        return {
          ok: false,
          code: 'validation_failed',
          message: 'subscription validation failed',
          violations: validation.violations,
        };
      }
      if (existing >= DEAL_ALERTS_SUBSCRIPTION_CAPS.maxSubscriptionsPerUser) {
        return {
          ok: false,
          code: 'cap_exceeded',
          message: 'max subscriptions per user',
        };
      }

      const { data, error } = await client
        .from(DEAL_ALERT_SUBSCRIPTIONS_TABLE)
        .insert({
          user_id: input.userId,
          enabled: input.enabled ?? true,
          stores,
          categories,
          minimum_discount_percent: input.minimumDiscountPercent,
          notification_channels: channels,
          cooldown_seconds: input.cooldownSeconds,
          daily_cap: input.dailyCap,
          contract_version: DEAL_ALERTS_CONTRACT_VERSION,
          version: 1,
        })
        .select(DEAL_ALERT_SUBSCRIPTION_SELECT_COLUMNS)
        .single();

      if (error) {
        return {
          ok: false,
          code: 'storage_error',
          message: error.message,
        };
      }
      return mapDealAlertSubscriptionRow(data as unknown as DbRow);
    },

    async getOwn({ subscriptionId, userId }) {
      const { data, error } = await client
        .from(DEAL_ALERT_SUBSCRIPTIONS_TABLE)
        .select(DEAL_ALERT_SUBSCRIPTION_SELECT_COLUMNS)
        .eq('id', subscriptionId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        return { ok: false, code: 'storage_error', message: error.message };
      }
      if (!data) {
        return { ok: false, code: 'not_found', message: 'subscription not found' };
      }
      return mapDealAlertSubscriptionRow(data as unknown as DbRow);
    },

    async listOwn(userId) {
      const { data, error } = await client
        .from(DEAL_ALERT_SUBSCRIPTIONS_TABLE)
        .select(DEAL_ALERT_SUBSCRIPTION_SELECT_COLUMNS)
        .eq('user_id', userId)
        .order('id', { ascending: true });
      if (error) {
        return { ok: false, code: 'storage_error', message: error.message };
      }
      const out: PersistedAlertSubscription[] = [];
      for (const row of data ?? []) {
        const mapped = mapDealAlertSubscriptionRow(row as unknown as DbRow);
        if (!mapped.ok) {
          return mapped;
        }
        out.push(mapped.value);
      }
      return { ok: true, value: out };
    },

    async update(input) {
      const current = await this.getOwn({
        subscriptionId: input.subscriptionId,
        userId: input.userId,
      });
      if (!current.ok) return current;
      if (current.value.version !== input.expectedVersion) {
        return {
          ok: false,
          code: 'version_mismatch',
          message: `expected version ${input.expectedVersion}, got ${current.value.version}`,
        };
      }

      const nextStores =
        input.stores != null ? normalizeTokens(input.stores) : current.value.stores;
      const nextCats =
        input.categories != null
          ? normalizeTokens(input.categories)
          : current.value.categories;
      const nextChannels =
        input.notificationChannels != null
          ? (normalizeTokens(
              input.notificationChannels,
            ) as AlertNotificationChannel[])
          : current.value.notificationChannels;

      const draft = {
        userId: input.userId,
        stores: nextStores,
        categories: nextCats,
        minimumDiscountPercent:
          input.minimumDiscountPercent ?? current.value.minimumDiscountPercent,
        notificationChannels: nextChannels,
        enabled: input.enabled ?? current.value.enabled,
        cooldownSeconds: input.cooldownSeconds ?? current.value.cooldownSeconds,
        dailyCap: input.dailyCap ?? current.value.dailyCap,
      };
      const validation = validateAlertSubscription(draft);
      if (!validation.ok) {
        return {
          ok: false,
          code: 'validation_failed',
          message: 'subscription validation failed',
          violations: validation.violations,
        };
      }

      const nextVersion = current.value.version + 1;
      const { data, error } = await client
        .from(DEAL_ALERT_SUBSCRIPTIONS_TABLE)
        .update({
          stores: nextStores,
          categories: nextCats,
          minimum_discount_percent: draft.minimumDiscountPercent,
          notification_channels: nextChannels,
          enabled: draft.enabled,
          cooldown_seconds: draft.cooldownSeconds,
          daily_cap: draft.dailyCap,
          version: nextVersion,
        })
        .eq('id', input.subscriptionId)
        .eq('user_id', input.userId)
        .eq('version', input.expectedVersion)
        .select(DEAL_ALERT_SUBSCRIPTION_SELECT_COLUMNS)
        .maybeSingle();

      if (error) {
        return { ok: false, code: 'storage_error', message: error.message };
      }
      if (!data) {
        return {
          ok: false,
          code: 'version_mismatch',
          message: 'update raced or row missing',
        };
      }
      return mapDealAlertSubscriptionRow(data as unknown as DbRow);
    },

    async disable(input) {
      return this.update({
        subscriptionId: input.subscriptionId,
        userId: input.userId,
        expectedVersion: input.expectedVersion,
        enabled: false,
      });
    },
  };
}
