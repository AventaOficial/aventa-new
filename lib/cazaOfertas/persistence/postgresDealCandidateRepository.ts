/**
 * CazaOfertasss — FASE 1. PostgresDealCandidateRepository.
 *
 * Implementa el puerto `DealCandidateRepository`. El dominio no conoce SQL.
 * Upsert atómico vía RPC `caza_upsert_deal_candidate` (revision en el motor).
 */

import type { DealCandidateRepository, DealUpsertOutcome } from '../dedupe';
import type { DealCandidate } from '../types';
import {
  dealCandidateRowToRpcPayload,
  dealCandidateToRow,
  rowToDealCandidate,
  type CazaDealCandidateRow,
} from './mappers';
import type { CazaSupabaseClient } from './supabaseClient';
import {
  CAZA_DEAL_CANDIDATES_TABLE,
  CAZA_UPSERT_DEAL_CANDIDATE_RPC,
} from './tables';

function assertBoundedLimit(limit: number, max: number): number {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('caza.repo.limit_invalid');
  }
  return Math.min(Math.floor(limit), max);
}

export function createPostgresDealCandidateRepository(
  client: CazaSupabaseClient
): DealCandidateRepository {
  async function upsertAtomic(incoming: DealCandidate): Promise<DealUpsertOutcome> {
    if (!incoming?.identity?.key) {
      throw new Error('caza.repo.malformed_candidate');
    }
    const payload = dealCandidateRowToRpcPayload(dealCandidateToRow(incoming));
    const { data, error } = await client.rpc(CAZA_UPSERT_DEAL_CANDIDATE_RPC, {
      p_row: payload,
    });
    if (error) throw new Error(`caza.repo.upsert_failed:${error.message}`);
    if (!data || typeof data !== 'object') {
      throw new Error('caza.repo.upsert_empty_response');
    }
    const body = data as { action?: string; row?: CazaDealCandidateRow };
    if (!body.row || !body.action) {
      throw new Error('caza.repo.upsert_malformed_response');
    }
    const candidate = rowToDealCandidate(body.row);
    const action = body.action as DealUpsertOutcome['action'];
    return {
      action,
      candidate,
      changedFields: action === 'updated' ? ['revision'] : [],
    };
  }

  return {
    async findByIdentityKey(identityKey: string) {
      if (typeof identityKey !== 'string' || identityKey.trim().length === 0) {
        throw new Error('caza.repo.identity_key_invalid');
      }
      const { data, error } = await client
        .from(CAZA_DEAL_CANDIDATES_TABLE)
        .select('*')
        .eq('identity_key', identityKey)
        .maybeSingle();
      if (error) throw new Error(`caza.repo.find_failed:${error.message}`);
      if (!data) return null;
      return rowToDealCandidate(data as CazaDealCandidateRow);
    },

    async save(candidate: DealCandidate) {
      await upsertAtomic(candidate);
    },

    upsertAtomic,

    async listByStatus(status, limit, cursor) {
      const safeLimit = assertBoundedLimit(limit, 200);
      let query = client
        .from(CAZA_DEAL_CANDIDATES_TABLE)
        .select('*')
        .eq('status', status)
        .order('identity_key', { ascending: true })
        .limit(safeLimit);

      if (cursor) {
        query = client
          .from(CAZA_DEAL_CANDIDATES_TABLE)
          .select('*')
          .eq('status', status)
          .gt('identity_key', cursor)
          .order('identity_key', { ascending: true })
          .limit(safeLimit);
      }

      const { data, error } = await query;
      if (error) throw new Error(`caza.repo.list_failed:${error.message}`);
      const rows = (data ?? []) as CazaDealCandidateRow[];
      const items = rows.map(rowToDealCandidate);
      const nextCursor =
        items.length === safeLimit ? items[items.length - 1].identity.key : null;
      return { items, nextCursor };
    },
  };
}
