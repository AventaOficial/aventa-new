/**
 * S6.3/S6.4 — Subscription candidate retrieval (separated from decision).
 *
 * findCandidates(opportunity) → CandidateSet
 * Evaluation stays in decideDealAlert (S6.2).
 *
 * S6.4: PostgresSubscriptionCandidateIndex replaces InMemory at runtime
 * without changing fanout/decision business rules.
 */

import {
  DEAL_ALERTS_CANDIDATE_LIMIT_DEFAULT,
  DEAL_ALERTS_CANDIDATE_LIMIT_HARD_MAX,
} from './constants';
import type { DecisionSubscription } from './decideDealAlert';

/** Dimensions available from AlertabilityEvidence + caller category — no invented fields. */
export type OpportunityCandidateQuery = {
  store: string | null;
  merchant: string | null;
  /** From fanout input — not on AlertabilityEvidence (documented gap S6.2). */
  category: string | null;
  discountPercent: number | null;
  /**
   * When true, only enabled subscriptions (scale path).
   * Default false so disabled can still surface as SUPPRESS in decision.
   * Postgres production path typically uses true.
   */
  enabledOnly?: boolean;
  /** Max candidates; overflow → candidateLimitReached (no silent truncate). */
  candidateLimit?: number;
};

export type CandidateQueryDimensions = {
  store: string | null;
  merchant: string | null;
  category: string | null;
  discountPercent: number | null;
  enabledOnly: boolean;
};

export type CandidateSetStats = {
  scanned: number;
  returned: number;
  candidateLimit: number;
  candidateLimitReached: boolean;
  latencyMs: number;
  queryDimensions: CandidateQueryDimensions;
};

export type CandidateSet = {
  subscriptions: DecisionSubscription[];
  retrievalSource: string;
  stats: CandidateSetStats;
};

/**
 * Pluggable candidate index — InMemory (tests) or Postgres (S6.4).
 * Always async so DB adapters share the same contract.
 */
export type SubscriptionCandidateIndex = {
  findCandidates(
    query: OpportunityCandidateQuery,
  ): Promise<CandidateSet>;
};

export function normalizeCandidateLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) {
    return DEAL_ALERTS_CANDIDATE_LIMIT_DEFAULT;
  }
  const n = Math.floor(limit);
  if (n < 1) return 1;
  return Math.min(n, DEAL_ALERTS_CANDIDATE_LIMIT_HARD_MAX);
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function dedupeBySubscriptionId(
  subs: DecisionSubscription[],
): DecisionSubscription[] {
  const map = new Map<string, DecisionSubscription>();
  const sorted = [...subs].sort((a, b) =>
    a.subscriptionId.localeCompare(b.subscriptionId),
  );
  for (const s of sorted) {
    if (!map.has(s.subscriptionId)) map.set(s.subscriptionId, s);
  }
  return [...map.values()].sort((a, b) =>
    a.subscriptionId.localeCompare(b.subscriptionId),
  );
}

function dimensionsOf(
  query: OpportunityCandidateQuery,
): CandidateQueryDimensions {
  return {
    store: query.store,
    merchant: query.merchant,
    category: query.category,
    discountPercent: query.discountPercent,
    enabledOnly: query.enabledOnly === true,
  };
}

/**
 * In-memory inverted index for tests / local evaluation.
 * Indexes: store tokens, category tokens; discount as prefilter.
 * Not for production scale.
 */
export function createInMemorySubscriptionCandidateIndex(
  subscriptions: DecisionSubscription[],
  options?: { retrievalSource?: string },
): SubscriptionCandidateIndex {
  const universe = dedupeBySubscriptionId(subscriptions);
  const byStore = new Map<string, Set<string>>();
  const byCategory = new Map<string, Set<string>>();
  const byId = new Map<string, DecisionSubscription>();
  /** Subs with empty stores/categories match all on that dimension. */
  const wildcardStore = new Set<string>();
  const wildcardCategory = new Set<string>();

  for (const s of universe) {
    byId.set(s.subscriptionId, s);
    if (!s.stores.length) wildcardStore.add(s.subscriptionId);
    else {
      for (const st of s.stores) {
        const k = norm(st);
        if (!byStore.has(k)) byStore.set(k, new Set());
        byStore.get(k)!.add(s.subscriptionId);
      }
    }
    if (!s.categories.length) wildcardCategory.add(s.subscriptionId);
    else {
      for (const c of s.categories) {
        const k = norm(c);
        if (!byCategory.has(k)) byCategory.set(k, new Set());
        byCategory.get(k)!.add(s.subscriptionId);
      }
    }
  }

  function idsForStore(store: string | null, merchant: string | null): Set<string> {
    const out = new Set<string>(wildcardStore);
    for (const token of [store, merchant]) {
      if (!token?.trim()) continue;
      const hits = byStore.get(norm(token));
      if (hits) for (const id of hits) out.add(id);
    }
    if (!store?.trim() && !merchant?.trim()) {
      return new Set(wildcardStore);
    }
    return out;
  }

  function idsForCategory(category: string | null): Set<string> {
    const out = new Set<string>(wildcardCategory);
    if (!category?.trim()) {
      return new Set(wildcardCategory);
    }
    const hits = byCategory.get(norm(category));
    if (hits) for (const id of hits) out.add(id);
    return out;
  }

  function intersect(a: Set<string>, b: Set<string>): Set<string> {
    const out = new Set<string>();
    for (const id of a) if (b.has(id)) out.add(id);
    return out;
  }

  return {
    async findCandidates(query: OpportunityCandidateQuery): Promise<CandidateSet> {
      const started = Date.now();
      const limit = normalizeCandidateLimit(query.candidateLimit);
      const storeIds = idsForStore(query.store, query.merchant);
      const catIds = idsForCategory(query.category);
      const ids = intersect(storeIds, catIds);

      const discount = query.discountPercent;
      const matched: DecisionSubscription[] = [];
      for (const id of [...ids].sort((a, b) => a.localeCompare(b))) {
        const s = byId.get(id);
        if (!s) continue;
        if (query.enabledOnly && !s.enabled) continue;
        if (
          discount != null &&
          Number.isFinite(discount) &&
          discount < s.minimumDiscountPercent
        ) {
          continue;
        }
        matched.push(s);
      }

      const limitReached = matched.length > limit;
      const result = limitReached ? matched.slice(0, limit) : matched;

      return {
        subscriptions: result,
        retrievalSource: options?.retrievalSource ?? 'in_memory_index',
        stats: {
          scanned: universe.length,
          returned: result.length,
          candidateLimit: limit,
          candidateLimitReached: limitReached,
          latencyMs: Date.now() - started,
          queryDimensions: dimensionsOf(query),
        },
      };
    },
  };
}

/**
 * Test helper: index that always returns a fixed set (may be irrelevant).
 */
export function createFixedSubscriptionCandidateIndex(
  subscriptions: DecisionSubscription[],
  retrievalSource = 'fixed_index',
): SubscriptionCandidateIndex {
  const list = dedupeBySubscriptionId(subscriptions);
  return {
    async findCandidates(query) {
      const started = Date.now();
      const limit = normalizeCandidateLimit(query.candidateLimit);
      const limitReached = list.length > limit;
      const result = limitReached ? list.slice(0, limit) : list;
      return {
        subscriptions: result,
        retrievalSource,
        stats: {
          scanned: list.length,
          returned: result.length,
          candidateLimit: limit,
          candidateLimitReached: limitReached,
          latencyMs: Date.now() - started,
          queryDimensions: dimensionsOf(query),
        },
      };
    },
  };
}

export function createEmptySubscriptionCandidateIndex(
  retrievalSource = 'empty_index',
): SubscriptionCandidateIndex {
  return {
    async findCandidates(query) {
      return {
        subscriptions: [],
        retrievalSource,
        stats: {
          scanned: 0,
          returned: 0,
          candidateLimit: normalizeCandidateLimit(query.candidateLimit),
          candidateLimitReached: false,
          latencyMs: 0,
          queryDimensions: dimensionsOf(query),
        },
      };
    },
  };
}
