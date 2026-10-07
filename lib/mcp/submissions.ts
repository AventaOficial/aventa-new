import type { SupabaseClient } from '@supabase/supabase-js';
import { createOfferBatch } from '@/lib/offers/batch/service';
import type { MachineClientContext } from '@/lib/mcp/auth';
import { canonicalSubmissionHash, validateCandidates, type CandidateRejection } from '@/lib/mcp/candidates';
import {
  MCP_IDEMPOTENCY_KEY_MAX,
  MCP_IDEMPOTENCY_KEY_MIN,
  MCP_MAX_CANDIDATES_PER_CALL,
  MCP_RUN_ID_MAX,
  mapBatchItemToCandidateState,
  type CandidateRejectionCode,
  type McpErrorCode,
  type SubmissionCandidateState,
} from '@/lib/mcp/contract';
import { isMcpIngestEnabled } from '@/lib/mcp/flags';
import { enqueueHunterOffer } from '@/lib/offers/ingestion/enqueueHunterOffer';

export type McpQuota = { dailyCap: number; usedToday: number; remainingToday: number };

export type SubmitResponse = {
  submissionId: string;
  accepted: Array<{ index: number }>;
  rejected: Array<{ index: number; code: CandidateRejectionCode }>;
  duplicatesInRequest: Array<{ index: number; duplicateOf: number }>;
  quota: McpQuota;
};

export type McpOutcome<T> =
  | { ok: true; data: T; replay?: boolean }
  | { ok: false; code: McpErrorCode; message: string };

type StoredCandidate = {
  index: number;
  identity_key: string | null;
  outcome: 'queued' | 'rejected' | 'duplicate_in_request' | 'already_in_review';
  code: CandidateRejectionCode | null;
};

type StoredMcpMeta = {
  quota_units?: number;
  candidates?: StoredCandidate[];
  response?: SubmitResponse;
};

const KEY_RE = /^[A-Za-z0-9._:-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail<T>(code: McpErrorCode, message: string): McpOutcome<T> {
  return { ok: false, code, message };
}

export function isValidIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= MCP_IDEMPOTENCY_KEY_MIN &&
    value.length <= MCP_IDEMPOTENCY_KEY_MAX &&
    KEY_RE.test(value)
  );
}

function isValidRunId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= MCP_RUN_ID_MAX && KEY_RE.test(value);
}

function startOfUtcDay(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function readMcpMeta(meta: unknown): StoredMcpMeta {
  if (!meta || typeof meta !== 'object') return {};
  const mcp = (meta as { mcp?: unknown }).mcp;
  return mcp && typeof mcp === 'object' ? (mcp as StoredMcpMeta) : {};
}

/** Candidatos que entraron a la cola hoy (UTC). Las respuestas idempotentes no consumen cuota. */
export async function loadDailyUsage(
  supabase: SupabaseClient,
  clientId: string,
  now: Date = new Date(),
): Promise<number | null> {
  const { data, error } = await supabase
    .from('offer_batches')
    .select('meta')
    .eq('machine_client_id', clientId)
    .gte('created_at', startOfUtcDay(now))
    .limit(1000);
  if (error) {
    console.error('[mcp] quota lookup failed:', error.code ?? 'unknown');
    return null;
  }
  return ((data ?? []) as Array<{ meta: unknown }>).reduce((sum, row) => {
    const units = Number(readMcpMeta(row.meta).quota_units);
    return sum + (Number.isFinite(units) && units > 0 ? units : 0);
  }, 0);
}

export function quotaOf(client: MachineClientContext, usedToday: number): McpQuota {
  return {
    dailyCap: client.dailyCandidateCap,
    usedToday,
    remainingToday: Math.max(0, client.dailyCandidateCap - usedToday),
  };
}

async function findSubmissionByKey(
  supabase: SupabaseClient,
  clientId: string,
  idempotencyKey: string,
): Promise<{ found: false } | { found: true; payloadHash: string | null; response: SubmitResponse | null } | { error: true }> {
  const { data, error } = await supabase
    .from('offer_batches')
    .select('id, mcp_payload_hash, meta')
    .eq('machine_client_id', clientId)
    .eq('mcp_idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) return { error: true };
  if (!data) return { found: false };
  const row = data as { id: string; mcp_payload_hash: string | null; meta: unknown };
  return { found: true, payloadHash: row.mcp_payload_hash, response: readMcpMeta(row.meta).response ?? null };
}

function replayOrConflict(
  existing: { payloadHash: string | null; response: SubmitResponse | null },
  payloadHash: string,
): McpOutcome<SubmitResponse> {
  if (existing.payloadHash !== payloadHash) {
    return fail('IDEMPOTENCY_CONFLICT', 'idempotencyKey ya se usó con un payload distinto.');
  }
  if (!existing.response) {
    return fail('INTERNAL_ERROR', 'El envío original sigue registrándose. Reintenta con la misma llave.');
  }
  return { ok: true, data: existing.response, replay: true };
}

export type SubmitInput = {
  idempotencyKey: unknown;
  runId?: unknown;
  candidates: unknown;
};

/**
 * submit_deal_candidates: valida, aplica idempotencia y cuota, y registra el lote.
 * Cada candidato aceptado nace como oferta pending en la cola de moderación.
 * El lote queda como historial de la importación, no como sala de espera.
 */
export async function submitDealCandidates(
  supabase: SupabaseClient,
  client: MachineClientContext,
  input: SubmitInput,
  now: Date = new Date(),
): Promise<McpOutcome<SubmitResponse>> {
  if (!isMcpIngestEnabled()) return fail('INGEST_PAUSED', 'La recepción de candidatos está pausada.');
  if (client.status !== 'active') return fail('CLIENT_PAUSED', 'Este cliente está pausado y no puede enviar candidatos.');
  if (!isValidIdempotencyKey(input.idempotencyKey)) {
    return fail('INVALID_INPUT', `idempotencyKey debe tener ${MCP_IDEMPOTENCY_KEY_MIN}-${MCP_IDEMPOTENCY_KEY_MAX} caracteres [A-Za-z0-9._:-].`);
  }
  if (input.runId !== undefined && input.runId !== null && !isValidRunId(input.runId)) {
    return fail('INVALID_INPUT', `runId debe tener 1-${MCP_RUN_ID_MAX} caracteres [A-Za-z0-9._:-].`);
  }
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
    return fail('INVALID_INPUT', 'candidates debe ser una lista con al menos un candidato.');
  }
  if (input.candidates.length > MCP_MAX_CANDIDATES_PER_CALL) {
    return fail('TOO_MANY_CANDIDATES', `Máximo ${MCP_MAX_CANDIDATES_PER_CALL} candidatos por llamada.`);
  }
  const idempotencyKey = input.idempotencyKey;
  const runId = typeof input.runId === 'string' ? input.runId : null;
  const payloadHash = canonicalSubmissionHash({ runId, candidates: input.candidates });

  const existing = await findSubmissionByKey(supabase, client.id, idempotencyKey);
  if ('error' in existing) return fail('INTERNAL_ERROR', 'No se pudo verificar la idempotencia.');
  if (existing.found) return replayOrConflict(existing, payloadHash);

  const validation = validateCandidates(input.candidates, now);
  const usedToday = await loadDailyUsage(supabase, client.id, now);
  if (usedToday == null) return fail('INTERNAL_ERROR', 'No se pudo verificar la cuota diaria.');
  if (usedToday + validation.valid.length > client.dailyCandidateCap) {
    return fail(
      'QUOTA_EXCEEDED',
      `Cuota diaria agotada: ${Math.max(0, client.dailyCandidateCap - usedToday)} candidatos restantes hoy (UTC).`,
    );
  }

  const structuredHintsByIdentityKey = Object.fromEntries(
    validation.valid.map((c) => [
      c.identityKey,
      { title: c.title, price: c.price, originalPrice: c.originalPrice, note: c.note },
    ]),
  );

  const created = await createOfferBatch({
    supabase,
    createdBy: client.authorProfileId,
    name: `MCP · ${client.name}`.slice(0, 120),
    text: '',
    urls: validation.valid.map((c) => ({ url: c.url, identityKey: c.identityKey })),
    structuredHintsByIdentityKey,
    machineOrigin: {
      machineClientId: client.id,
      idempotencyKey,
      payloadHash,
      runId,
      meta: { quota_units: validation.valid.length },
    },
  });

  if (!created.ok) {
    if (created.code === 'IDEMPOTENCY_KEY_TAKEN') {
      const raced = await findSubmissionByKey(supabase, client.id, idempotencyKey);
      if ('error' in raced || !raced.found) return fail('INTERNAL_ERROR', 'No se pudo resolver la idempotencia.');
      return replayOrConflict(raced, payloadHash);
    }
    return fail('INTERNAL_ERROR', 'No se pudo registrar el envío.');
  }
  if (!created.batch) return fail('INTERNAL_ERROR', 'No se pudo registrar el envío.');

  const conflicted = new Set(created.conflictIdentityKeys);
  const acceptedCandidates = validation.valid.filter((c) => !conflicted.has(c.identityKey));
  for (const candidate of acceptedCandidates) {
    await enqueueHunterOffer(supabase, {
      batchId: created.batch.id,
      createdBy: client.authorProfileId,
      machineClientId: client.id,
      candidate,
    });
  }
  const accepted = acceptedCandidates.map((c) => ({ index: c.index }));
  const rejected: CandidateRejection[] = [
    ...validation.rejected,
    ...validation.valid
      .filter((c) => conflicted.has(c.identityKey))
      .map((c) => ({ index: c.index, code: 'ALREADY_IN_REVIEW' as const })),
  ].sort((a, b) => a.index - b.index);

  const response: SubmitResponse = {
    submissionId: created.batch.id,
    accepted,
    rejected,
    duplicatesInRequest: validation.duplicatesInRequest,
    quota: quotaOf(client, usedToday + validation.valid.length),
  };

  const stored: StoredCandidate[] = [
    ...validation.valid.map((c) => ({
      index: c.index,
      identity_key: c.identityKey,
      outcome: conflicted.has(c.identityKey) ? ('already_in_review' as const) : ('queued' as const),
      code: conflicted.has(c.identityKey) ? ('ALREADY_IN_REVIEW' as const) : null,
    })),
    ...validation.rejected.map((r) => ({ index: r.index, identity_key: null, outcome: 'rejected' as const, code: r.code })),
    ...validation.duplicatesInRequest.map((d) => ({
      index: d.index,
      identity_key: null,
      outcome: 'duplicate_in_request' as const,
      code: 'DUPLICATE_IN_REQUEST' as const,
    })),
  ].sort((a, b) => a.index - b.index);

  const baseMeta = (created.batch.meta && typeof created.batch.meta === 'object' ? created.batch.meta : {}) as Record<
    string,
    unknown
  >;
  const { error: metaError } = await supabase
    .from('offer_batches')
    .update({
      meta: {
        ...baseMeta,
        mcp: { quota_units: validation.valid.length, candidates: stored, response },
      },
    })
    .eq('id', created.batch.id)
    .eq('machine_client_id', client.id);
  if (metaError) console.error('[mcp] storing submission response failed:', metaError.code ?? 'unknown');

  return { ok: true, data: response };
}

export type SubmissionStatus = {
  submissionId: string;
  createdAt: string;
  candidates: Array<{ index: number; state: SubmissionCandidateState; code?: CandidateRejectionCode }>;
};

/** get_submission_status: sólo envíos propios. Ajenos o inexistentes => NOT_FOUND sin distinguir. */
export async function getSubmissionStatus(
  supabase: SupabaseClient,
  client: MachineClientContext,
  submissionId: unknown,
): Promise<McpOutcome<SubmissionStatus>> {
  if (typeof submissionId !== 'string' || !UUID_RE.test(submissionId)) {
    return fail('NOT_FOUND', 'Envío no encontrado.');
  }
  const { data: batch, error } = await supabase
    .from('offer_batches')
    .select('id, created_at, meta, machine_client_id')
    .eq('id', submissionId)
    .eq('machine_client_id', client.id)
    .maybeSingle();
  if (error) return fail('INTERNAL_ERROR', 'No se pudo leer el envío.');
  const row = batch as { id: string; created_at: string; meta: unknown; machine_client_id: string | null } | null;
  if (!row || row.machine_client_id !== client.id) return fail('NOT_FOUND', 'Envío no encontrado.');

  const { data: items, error: itemsError } = await supabase
    .from('offer_batch_items')
    .select('identity_key, status, duplicate_status')
    .eq('batch_id', row.id);
  if (itemsError) return fail('INTERNAL_ERROR', 'No se pudo leer el envío.');
  const byIdentity = new Map(
    ((items ?? []) as Array<{ identity_key: string; status: string; duplicate_status: string | null }>).map((it) => [
      it.identity_key,
      it,
    ]),
  );

  const candidates = (readMcpMeta(row.meta).candidates ?? []).map((c) => {
    if (c.outcome === 'rejected') return { index: c.index, state: 'invalid' as const, ...(c.code ? { code: c.code } : {}) };
    if (c.outcome === 'duplicate_in_request' || c.outcome === 'already_in_review') {
      return { index: c.index, state: 'duplicate' as const, ...(c.code ? { code: c.code } : {}) };
    }
    const item = c.identity_key ? byIdentity.get(c.identity_key) : undefined;
    return { index: c.index, state: item ? mapBatchItemToCandidateState(item) : ('received' as const) };
  });

  return { ok: true, data: { submissionId: row.id, createdAt: row.created_at, candidates } };
}
