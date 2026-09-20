/**
 * S6.4 — PostgresSubscriptionCandidateIndex
 * Coarse DB retrieval via deal_alert_find_candidates RPC.
 * Fine decision remains decideDealAlert (S6.2).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEAL_ALERT_FIND_CANDIDATES_RPC,
  DEAL_ALERTS_CONTRACT_VERSION,
} from './constants';
import type { DecisionSubscription } from './decideDealAlert';
import { assertDealAlertsMoneyUntouched } from './safety';
import {
  normalizeCandidateLimit,
  type OpportunityCandidateQuery,
  type SubscriptionCandidateIndex,
  type CandidateSet,
} from './subscriptionIndex';
import type { AlertNotificationChannel } from './types';

type CandidateRpcRow = {
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
  is_broad?: boolean;
  fanout_class?: string;
  contract_version?: string;
};

const CHANNELS: AlertNotificationChannel[] = ['in_app', 'email_digest'];

function mapRpcRow(row: CandidateRpcRow): DecisionSubscription | null {
  const channels: AlertNotificationChannel[] = [];
  for (const c of row.notification_channels ?? []) {
    const n = String(c).trim().toLowerCase();
    if ((CHANNELS as string[]).includes(n)) {
      channels.push(n as AlertNotificationChannel);
    }
  }
  if (!channels.length) return null; // malformed — drop at retrieval; S6.2 would SUPPRESS
  return {
    contractVersion: (row.contract_version ||
      DEAL_ALERTS_CONTRACT_VERSION) as DecisionSubscription['contractVersion'],
    subscriptionId: row.id,
    userId: row.user_id,
    stores: (row.stores ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
    categories: (row.categories ?? [])
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    minimumDiscountPercent: Number(row.minimum_discount_percent),
    notificationChannels: channels,
    enabled: row.enabled === true,
    cooldownSeconds: row.cooldown_seconds,
    dailyCap: row.daily_cap,
  };
}

/**
 * Production candidate index. Uses service_role client (RPC not granted to authenticated).
 */
export function createPostgresSubscriptionCandidateIndex(
  client: SupabaseClient,
  options?: { retrievalSource?: string },
): SubscriptionCandidateIndex {
  assertDealAlertsMoneyUntouched();
  const retrievalSource = options?.retrievalSource ?? 'postgres_rpc';

  return {
    async findCandidates(query: OpportunityCandidateQuery): Promise<CandidateSet> {
      const started = Date.now();
      const limit = normalizeCandidateLimit(query.candidateLimit);
      const enabledOnly = query.enabledOnly === true;

      const { data, error } = await client.rpc(DEAL_ALERT_FIND_CANDIDATES_RPC, {
        p_store: query.store,
        p_merchant: query.merchant,
        p_category: query.category,
        p_discount: query.discountPercent,
        p_enabled_only: enabledOnly,
        p_limit: limit,
      });

      if (error) {
        throw new Error(
          `deal_alert_find_candidates failed: ${error.message}`,
        );
      }

      const rows = (data ?? []) as CandidateRpcRow[];
      const limitReached = rows.length > limit;
      const sliced = limitReached ? rows.slice(0, limit) : rows;
      const subscriptions: DecisionSubscription[] = [];
      for (const row of sliced) {
        const mapped = mapRpcRow(row);
        if (mapped) subscriptions.push(mapped);
      }
      // Deterministic order (RPC already ORDER BY id; re-sort for safety)
      subscriptions.sort((a, b) =>
        a.subscriptionId.localeCompare(b.subscriptionId),
      );

      return {
        subscriptions,
        retrievalSource,
        stats: {
          scanned: rows.length,
          returned: subscriptions.length,
          candidateLimit: limit,
          candidateLimitReached: limitReached,
          latencyMs: Date.now() - started,
          queryDimensions: {
            store: query.store,
            merchant: query.merchant,
            category: query.category,
            discountPercent: query.discountPercent,
            enabledOnly,
          },
        },
      };
    },
  };
}
