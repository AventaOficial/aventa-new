/**
 * CazaOfertasss — FASE 1. PostgresRevenueRepository (append-only ledger).
 *
 * No UPDATE/DELETE económicos. Duplicados → duplicate:true.
 */

import type { AffiliateRevenueEvent, AffiliateRevenueLedgerPort } from '../revenue/ledger';
import {
  revenueEventRowToRpcPayload,
  revenueEventToRow,
  rowToRevenueEvent,
  type CazaRevenueEventRow,
} from './mappers';
import type { CazaSupabaseClient } from './supabaseClient';
import { CAZA_APPEND_REVENUE_EVENT_RPC, CAZA_REVENUE_EVENTS_TABLE } from './tables';

function assertBoundedLimit(limit: number, max: number): number {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('caza.repo.limit_invalid');
  }
  return Math.min(Math.floor(limit), max);
}

export function createPostgresRevenueRepository(
  client: CazaSupabaseClient
): AffiliateRevenueLedgerPort {
  return {
    async append(event: AffiliateRevenueEvent) {
      if (!event?.eventId) throw new Error('caza.repo.malformed_revenue_event');
      const payload = revenueEventRowToRpcPayload(revenueEventToRow(event));
      const { data, error } = await client.rpc(CAZA_APPEND_REVENUE_EVENT_RPC, {
        p_row: payload,
      });
      if (error) throw new Error(`caza.repo.revenue_append_failed:${error.message}`);
      if (!data || typeof data !== 'object') {
        throw new Error('caza.repo.revenue_append_empty');
      }
      const body = data as { appended?: boolean; duplicate?: boolean };
      return {
        appended: Boolean(body.appended),
        duplicate: Boolean(body.duplicate),
      };
    },

    async findByEventId(eventId: string) {
      if (typeof eventId !== 'string' || eventId.trim().length === 0) {
        throw new Error('caza.repo.event_id_invalid');
      }
      const { data, error } = await client
        .from(CAZA_REVENUE_EVENTS_TABLE)
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) throw new Error(`caza.repo.revenue_find_failed:${error.message}`);
      if (!data) return null;
      return rowToRevenueEvent(data as unknown as CazaRevenueEventRow);
    },

    async listByDealId(dealId: string, limit: number) {
      const safeLimit = assertBoundedLimit(limit, 500);
      const { data, error } = await client
        .from(CAZA_REVENUE_EVENTS_TABLE)
        .select('*')
        .eq('deal_id', dealId)
        .order('occurred_at', { ascending: false })
        .limit(safeLimit);
      if (error) throw new Error(`caza.repo.revenue_list_failed:${error.message}`);
      return ((data ?? []) as unknown as CazaRevenueEventRow[]).map(rowToRevenueEvent);
    },
  };
}

export { createPostgresRevenueRepository as PostgresRevenueRepository };
