/**
 * CazaOfertasss — FASE 2. PostgresPublicationRepository + outbox RPCs.
 */

import type {
  ClaimPublicationInput,
  DealPublicationRecord,
  DealPublicationRepository,
} from '../tracking/publication';
import {
  publicationRowToRpcPayload,
  publicationToRow,
  rowToPublication,
  type CazaPublicationRow,
} from './mappers';
import type { CazaSupabaseClient } from './supabaseClient';
import {
  CAZA_CLAIM_PUBLICATION_RPC,
  CAZA_INSERT_PUBLICATION_IDEMPOTENT_RPC,
  CAZA_PUBLICATIONS_TABLE,
  CAZA_RECOVER_PUBLICATION_LEASES_RPC,
  CAZA_SAVE_CLAIMED_PUBLICATION_RPC,
} from './tables';

function assertBoundedLimit(limit: number, max: number): number {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('caza.repo.limit_invalid');
  }
  return Math.min(Math.floor(limit), max);
}

export function createPostgresPublicationRepository(
  client: CazaSupabaseClient
): DealPublicationRepository {
  return {
    async findByIdentityKey(publicationId: string) {
      if (typeof publicationId !== 'string' || publicationId.trim().length === 0) {
        throw new Error('caza.repo.publication_id_invalid');
      }
      const { data, error } = await client
        .from(CAZA_PUBLICATIONS_TABLE)
        .select('*')
        .eq('publication_id', publicationId)
        .maybeSingle();
      if (error) throw new Error(`caza.repo.publication_find_failed:${error.message}`);
      if (!data) return null;
      return rowToPublication(data as unknown as CazaPublicationRow);
    },

    async save(record: DealPublicationRecord) {
      const row = publicationToRow(record);
      const { error } = await client
        .from(CAZA_PUBLICATIONS_TABLE)
        .upsert(row as unknown as Record<string, unknown>, {
          onConflict: 'publication_id',
        });
      if (error) throw new Error(`caza.repo.publication_save_failed:${error.message}`);
    },

    async saveIdempotent(record: DealPublicationRecord) {
      if (!record?.publicationId) {
        throw new Error('caza.repo.malformed_publication');
      }
      const payload = publicationRowToRpcPayload(publicationToRow(record));
      const { data, error } = await client.rpc(CAZA_INSERT_PUBLICATION_IDEMPOTENT_RPC, {
        p_row: payload,
      });
      if (error) throw new Error(`caza.repo.publication_idempotent_failed:${error.message}`);
      if (!data || typeof data !== 'object') {
        throw new Error('caza.repo.publication_idempotent_empty');
      }
      const body = data as { inserted?: boolean; row?: CazaPublicationRow };
      if (!body.row) throw new Error('caza.repo.publication_idempotent_malformed');
      return {
        inserted: Boolean(body.inserted),
        record: rowToPublication(body.row),
      };
    },

    async listByDealId(dealId: string, limit: number) {
      const safeLimit = assertBoundedLimit(limit, 200);
      const { data, error } = await client
        .from(CAZA_PUBLICATIONS_TABLE)
        .select('*')
        .eq('deal_id', dealId)
        .order('prepared_at', { ascending: false })
        .limit(safeLimit);
      if (error) throw new Error(`caza.repo.publication_list_failed:${error.message}`);
      return ((data ?? []) as unknown as CazaPublicationRow[]).map(rowToPublication);
    },

    async claimForSend(input: ClaimPublicationInput) {
      const { data, error } = await client.rpc(CAZA_CLAIM_PUBLICATION_RPC, {
        p_publication_id: input.publicationId,
        p_lease_owner: input.leaseOwner,
        p_lease_ms: input.leaseDurationMs,
        p_now: input.now.toISOString(),
      });
      if (error) throw new Error(`caza.repo.publication_claim_failed:${error.message}`);
      if (!data || typeof data !== 'object') {
        throw new Error('caza.repo.publication_claim_empty');
      }
      const body = data as {
        claimed?: boolean;
        reason?: string;
        row?: CazaPublicationRow | null;
      };
      return {
        claimed: Boolean(body.claimed),
        reason: body.reason,
        record: body.row ? rowToPublication(body.row) : null,
      };
    },

    async saveClaimed(record: DealPublicationRecord, leaseOwner: string) {
      const payload = publicationRowToRpcPayload(publicationToRow(record));
      const { data, error } = await client.rpc(CAZA_SAVE_CLAIMED_PUBLICATION_RPC, {
        p_row: payload,
        p_lease_owner: leaseOwner,
      });
      if (error) throw new Error(`caza.repo.publication_save_claimed_failed:${error.message}`);
      if (!data || typeof data !== 'object') {
        throw new Error('caza.repo.publication_save_claimed_empty');
      }
      return Boolean((data as { saved?: boolean }).saved);
    },

    async listDueForSend(limit: number, now: Date) {
      const safeLimit = assertBoundedLimit(limit, 25);
      // PostgREST: status=PREPARED AND (next_attempt_at IS NULL OR next_attempt_at <= now)
      // Usamos filtro compuesto vía or + lte a través del builder duck-typed.
      const builder = client
        .from(CAZA_PUBLICATIONS_TABLE)
        .select('*')
        .eq('status', 'PREPARED')
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
        .order('prepared_at', { ascending: true })
        .order('publication_id', { ascending: true })
        .limit(safeLimit);
      const { data, error } = await builder;
      if (error) throw new Error(`caza.repo.publication_list_due_failed:${error.message}`);
      return ((data ?? []) as unknown as CazaPublicationRow[]).map(rowToPublication);
    },

    async recoverExpiredLeases(now: Date, limit: number) {
      const safeLimit = assertBoundedLimit(limit, 100);
      const { data, error } = await client.rpc(CAZA_RECOVER_PUBLICATION_LEASES_RPC, {
        p_now: now.toISOString(),
        p_limit: safeLimit,
      });
      if (error) throw new Error(`caza.repo.publication_recover_failed:${error.message}`);
      if (!data || typeof data !== 'object') return 0;
      const recovered = (data as { recovered?: number }).recovered;
      return typeof recovered === 'number' && Number.isFinite(recovered) ? recovered : 0;
    },
  };
}

export { createPostgresPublicationRepository as PostgresPublicationRepository };
