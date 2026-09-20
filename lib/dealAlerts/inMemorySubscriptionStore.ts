/**
 * S6.4 — In-memory subscription store (tests / local).
 * Mirrors Postgres semantics: version concurrency, soft-disable, caps, fanout class.
 */

import {
  DEAL_ALERTS_CONTRACT_VERSION,
  DEAL_ALERTS_SUBSCRIPTION_CAPS,
} from './constants';
import { validateAlertSubscription } from './subscription';
import {
  classifyFanoutClass,
  type CreateAlertSubscriptionInput,
  type PersistedAlertSubscription,
  type SubscriptionPersistenceResult,
  type UpdateAlertSubscriptionInput,
} from './persistenceTypes';
import { createInMemorySubscriptionCandidateIndex } from './subscriptionIndex';
import type { SubscriptionCandidateIndex } from './subscriptionIndex';
import { toDecisionSubscription } from './persistenceTypes';

function normalizeTokens(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function nowIso(clock: () => Date): string {
  return clock().toISOString();
}

export type InMemoryAlertSubscriptionStore = {
  create(
    input: CreateAlertSubscriptionInput,
  ): SubscriptionPersistenceResult<PersistedAlertSubscription>;
  getOwn(input: {
    subscriptionId: string;
    userId: string;
  }): SubscriptionPersistenceResult<PersistedAlertSubscription>;
  listOwn(userId: string): PersistedAlertSubscription[];
  update(
    input: UpdateAlertSubscriptionInput,
  ): SubscriptionPersistenceResult<PersistedAlertSubscription>;
  disable(input: {
    subscriptionId: string;
    userId: string;
    expectedVersion: number;
  }): SubscriptionPersistenceResult<PersistedAlertSubscription>;
  /** Hard delete (owner). Prefer disable for audit. */
  remove(input: {
    subscriptionId: string;
    userId: string;
  }): SubscriptionPersistenceResult<{ deleted: true }>;
  /** Cross-user probe — always forbidden for foreign user. */
  getAsUser(input: {
    subscriptionId: string;
    actingUserId: string;
  }): SubscriptionPersistenceResult<PersistedAlertSubscription>;
  updateAsUser(
    input: UpdateAlertSubscriptionInput & { actingUserId: string },
  ): SubscriptionPersistenceResult<PersistedAlertSubscription>;
  /** Snapshot all rows (test harness). */
  snapshot(): PersistedAlertSubscription[];
  /** Candidate index over current enabled/disabled store. */
  asCandidateIndex(options?: {
    retrievalSource?: string;
  }): SubscriptionCandidateIndex;
};

export function createInMemoryAlertSubscriptionStore(options?: {
  clock?: () => Date;
  idFactory?: () => string;
}): InMemoryAlertSubscriptionStore {
  const clock = options?.clock ?? (() => new Date());
  let seq = 0;
  const idFactory =
    options?.idFactory ??
    (() => {
      seq += 1;
      return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
    });
  const byId = new Map<string, PersistedAlertSubscription>();

  function countForUser(userId: string): number {
    let n = 0;
    for (const row of byId.values()) if (row.userId === userId) n += 1;
    return n;
  }

  function create(
    input: CreateAlertSubscriptionInput,
  ): SubscriptionPersistenceResult<PersistedAlertSubscription> {
    const stores = normalizeTokens(input.stores);
    const categories = normalizeTokens(input.categories);
    const channels = normalizeTokens(input.notificationChannels) as CreateAlertSubscriptionInput['notificationChannels'];
    const existing = countForUser(input.userId);
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
    const { isBroad, fanoutClass } = classifyFanoutClass(stores, categories);
    const ts = nowIso(clock);
    const row: PersistedAlertSubscription = {
      subscriptionId: idFactory(),
      userId: input.userId,
      enabled: input.enabled ?? true,
      stores,
      categories,
      minimumDiscountPercent: input.minimumDiscountPercent,
      notificationChannels: channels,
      cooldownSeconds: input.cooldownSeconds,
      dailyCap: input.dailyCap,
      version: 1,
      isBroad,
      fanoutClass,
      contractVersion: DEAL_ALERTS_CONTRACT_VERSION,
      createdAt: ts,
      updatedAt: ts,
    };
    byId.set(row.subscriptionId, row);
    return { ok: true, value: row };
  }

  function getOwn(input: {
    subscriptionId: string;
    userId: string;
  }): SubscriptionPersistenceResult<PersistedAlertSubscription> {
    const row = byId.get(input.subscriptionId);
    if (!row) {
      return { ok: false, code: 'not_found', message: 'subscription not found' };
    }
    if (row.userId !== input.userId) {
      return { ok: false, code: 'forbidden', message: 'RLS cross-user read rejected' };
    }
    return { ok: true, value: { ...row } };
  }

  function listOwn(userId: string): PersistedAlertSubscription[] {
    return [...byId.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.subscriptionId.localeCompare(b.subscriptionId))
      .map((r) => ({ ...r }));
  }

  function update(
    input: UpdateAlertSubscriptionInput,
  ): SubscriptionPersistenceResult<PersistedAlertSubscription> {
    const row = byId.get(input.subscriptionId);
    if (!row) {
      return { ok: false, code: 'not_found', message: 'subscription not found' };
    }
    if (row.userId !== input.userId) {
      return { ok: false, code: 'forbidden', message: 'RLS cross-user update rejected' };
    }
    if (row.version !== input.expectedVersion) {
      return {
        ok: false,
        code: 'version_mismatch',
        message: `expected version ${input.expectedVersion}, got ${row.version}`,
      };
    }
    const nextStores = input.stores != null ? normalizeTokens(input.stores) : row.stores;
    const nextCats =
      input.categories != null ? normalizeTokens(input.categories) : row.categories;
    const nextChannels =
      input.notificationChannels != null
        ? (normalizeTokens(input.notificationChannels) as PersistedAlertSubscription['notificationChannels'])
        : row.notificationChannels;
    const draft = {
      userId: row.userId,
      stores: nextStores,
      categories: nextCats,
      minimumDiscountPercent:
        input.minimumDiscountPercent ?? row.minimumDiscountPercent,
      notificationChannels: nextChannels,
      enabled: input.enabled ?? row.enabled,
      cooldownSeconds: input.cooldownSeconds ?? row.cooldownSeconds,
      dailyCap: input.dailyCap ?? row.dailyCap,
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
    const { isBroad, fanoutClass } = classifyFanoutClass(nextStores, nextCats);
    const updated: PersistedAlertSubscription = {
      ...row,
      ...draft,
      stores: nextStores,
      categories: nextCats,
      notificationChannels: nextChannels,
      isBroad,
      fanoutClass,
      version: row.version + 1,
      updatedAt: nowIso(clock),
    };
    byId.set(row.subscriptionId, updated);
    return { ok: true, value: { ...updated } };
  }

  function disable(input: {
    subscriptionId: string;
    userId: string;
    expectedVersion: number;
  }): SubscriptionPersistenceResult<PersistedAlertSubscription> {
    return update({
      subscriptionId: input.subscriptionId,
      userId: input.userId,
      expectedVersion: input.expectedVersion,
      enabled: false,
    });
  }

  function remove(input: {
    subscriptionId: string;
    userId: string;
  }): SubscriptionPersistenceResult<{ deleted: true }> {
    const row = byId.get(input.subscriptionId);
    if (!row) {
      return { ok: false, code: 'not_found', message: 'subscription not found' };
    }
    if (row.userId !== input.userId) {
      return { ok: false, code: 'forbidden', message: 'RLS cross-user delete rejected' };
    }
    byId.delete(input.subscriptionId);
    return { ok: true, value: { deleted: true } };
  }

  return {
    create,
    getOwn,
    listOwn,
    update,
    disable,
    remove,
    getAsUser({ subscriptionId, actingUserId }) {
      return getOwn({ subscriptionId, userId: actingUserId });
    },
    updateAsUser(input) {
      if (input.actingUserId !== input.userId) {
        return {
          ok: false,
          code: 'forbidden',
          message: 'RLS cross-user update rejected',
        };
      }
      return update(input);
    },
    snapshot() {
      return [...byId.values()]
        .sort((a, b) => a.subscriptionId.localeCompare(b.subscriptionId))
        .map((r) => ({ ...r }));
    },
    asCandidateIndex(options) {
      const subs = [...byId.values()].map(toDecisionSubscription);
      return createInMemorySubscriptionCandidateIndex(subs, {
        retrievalSource: options?.retrievalSource ?? 'in_memory_persisted_index',
      });
    },
  };
}
