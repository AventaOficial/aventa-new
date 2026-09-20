/**
 * CazaOfertasss — FASE 3. Postgres attribution repository (append-only).
 */

import type { RevenueAttributionPort } from '../revenue/attribution';
import type { RevenueAttributionRecord } from '../revenue/types';
import type { CazaSupabaseClient } from './supabaseClient';
import {
  CAZA_APPEND_REVENUE_ATTRIBUTION_RPC,
  CAZA_REVENUE_ATTRIBUTIONS_TABLE,
} from './tables';

interface AttributionRow {
  attribution_id: string;
  event_id: string;
  decision: string;
  publication_id: string | null;
  deal_id: string | null;
  tracking_identifier: string | null;
  reason: string;
  decided_at: string;
}

function rowToAttribution(row: AttributionRow): RevenueAttributionRecord {
  return {
    attributionId: row.attribution_id,
    eventId: row.event_id,
    decision: row.decision as RevenueAttributionRecord['decision'],
    publicationId: row.publication_id,
    dealId: row.deal_id,
    trackingIdentifier: row.tracking_identifier,
    reason: row.reason,
    decidedAt: row.decided_at,
  };
}

export function createPostgresRevenueAttributionRepository(
  client: CazaSupabaseClient
): RevenueAttributionPort {
  return {
    async append(record) {
      const { data, error } = await client.rpc(CAZA_APPEND_REVENUE_ATTRIBUTION_RPC, {
        p_row: {
          attribution_id: record.attributionId,
          event_id: record.eventId,
          decision: record.decision,
          publication_id: record.publicationId ?? '',
          deal_id: record.dealId ?? '',
          tracking_identifier: record.trackingIdentifier ?? '',
          reason: record.reason,
          decided_at: record.decidedAt,
        },
      });
      if (error) throw new Error(`caza.repo.attribution_append_failed:${error.message}`);
      const body = data as { appended?: boolean; duplicate?: boolean };
      return {
        appended: Boolean(body?.appended),
        duplicate: Boolean(body?.duplicate),
      };
    },

    async findByEventId(eventId) {
      const { data, error } = await client
        .from(CAZA_REVENUE_ATTRIBUTIONS_TABLE)
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) throw new Error(`caza.repo.attribution_find_failed:${error.message}`);
      if (!data) return null;
      return rowToAttribution(data as unknown as AttributionRow);
    },

    async listByPublicationId(publicationId, limit) {
      const safe = Math.max(1, Math.min(limit, 500));
      const { data, error } = await client
        .from(CAZA_REVENUE_ATTRIBUTIONS_TABLE)
        .select('*')
        .eq('publication_id', publicationId)
        .limit(safe);
      if (error) throw new Error(`caza.repo.attribution_list_failed:${error.message}`);
      return ((data ?? []) as unknown as AttributionRow[]).map(rowToAttribution);
    },
  };
}
