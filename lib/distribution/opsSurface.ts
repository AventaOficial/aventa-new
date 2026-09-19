/**
 * Distribution C3 Ops Surface — operator listing + release bridge.
 * Thin layer over existing C3 authority. No providers. No offer mutations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DISTRIBUTION_OPERATOR_STATUS_LABELS,
  DISTRIBUTION_PUBLISHING_LEASE_MS,
  isDistributionEngineEnabled,
} from './constants';
import { releaseUnknownOutcomeToRetryable } from './reclaim';

export const DISTRIBUTION_OPS_LIST_STATUSES = [
  'publishing',
  'unknown_outcome',
  'retryable',
  'published',
] as const;

export type DistributionOpsStatusFilter =
  | 'all'
  | (typeof DISTRIBUTION_OPS_LIST_STATUSES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SECRET_KEY_RE =
  /(token|secret|password|credential|cookie|authorization|api[_-]?key|bearer)/i;

export function isValidPublicationId(raw: unknown): raw is string {
  return typeof raw === 'string' && UUID_RE.test(raw.trim());
}

export function parseOpsStatusFilter(raw: unknown): DistributionOpsStatusFilter | null {
  if (raw === undefined || raw === null || raw === '' || raw === 'all') return 'all';
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if ((DISTRIBUTION_OPS_LIST_STATUSES as readonly string[]).includes(v)) {
    return v as DistributionOpsStatusFilter;
  }
  return null;
}

/** Strip secret-like keys from event meta before returning to clients. */
export function sanitizeOpsMeta(
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!meta || typeof meta !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEY_RE.test(k)) continue;
    if (typeof v === 'string' && SECRET_KEY_RE.test(v)) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeOpsMeta(v as Record<string, unknown>);
    } else if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      v === null
    ) {
      out[k] = v;
    }
  }
  return out;
}

export type DistributionOpsLeaseView = {
  owner: string | null;
  acquiredAt: string | null;
  expiresAt: string | null;
};

export type DistributionOpsLastEvent = {
  eventType: string;
  createdAt: string;
  meta: Record<string, unknown>;
};

export type DistributionOpsPublicationRow = {
  id: string;
  offerId: string;
  destinationId: string;
  provider: string | null;
  status: string;
  operatorStatus: string;
  attemptCount: number;
  idempotencyKey: string;
  distributionVersion: number;
  externalMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  lease: DistributionOpsLeaseView | null;
  lastEvent: DistributionOpsLastEvent | null;
  requiresOperatorReconcile: boolean;
};

/** Operator-facing queue depth — no secrets, no credential refs. */
export type DistributionOpsStatusCounts = {
  /** Enqueued, awaiting drain (status=pending). */
  enqueued: number;
  /** Claimed in-flight (status=publishing). */
  claiming: number;
  published: number;
  retryable: number;
  failed: number;
  unknownOutcome: number;
  cancelled: number;
  total: number;
};

export type DistributionOpsListResult = {
  ok: true;
  filter: DistributionOpsStatusFilter;
  engineEnabled: boolean;
  count: number;
  statusCounts: DistributionOpsStatusCounts;
  publications: DistributionOpsPublicationRow[];
};

type PubRow = {
  id: string;
  offer_id: string;
  destination_id: string;
  provider: string | null;
  status: string;
  attempt_count: number;
  idempotency_key: string;
  distribution_version: number;
  external_message_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type EventRow = {
  publication_id: string;
  event_type: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

function operatorLabel(status: string): string {
  const key = status as keyof typeof DISTRIBUTION_OPERATOR_STATUS_LABELS;
  return DISTRIBUTION_OPERATOR_STATUS_LABELS[key] ?? status.toUpperCase();
}

const OPS_COUNT_STATUSES = [
  'pending',
  'publishing',
  'published',
  'retryable',
  'failed',
  'unknown_outcome',
  'cancelled',
] as const;

async function countPublicationsByStatus(
  supabase: SupabaseClient,
  status: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('distribution_publications')
    .select('id', { count: 'exact', head: true })
    .eq('status', status);

  if (error) {
    console.error(`[distribution-ops] count ${status} failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Aggregate publication counts by lifecycle status. Never returns secrets.
 */
export async function fetchDistributionOpsStatusCounts(
  supabase: SupabaseClient,
): Promise<DistributionOpsStatusCounts> {
  const [
    enqueued,
    claiming,
    published,
    retryable,
    failed,
    unknownOutcome,
    cancelled,
  ] = await Promise.all(
    OPS_COUNT_STATUSES.map((status) => countPublicationsByStatus(supabase, status)),
  );

  return {
    enqueued,
    claiming,
    published,
    retryable,
    failed,
    unknownOutcome,
    cancelled,
    total:
      enqueued +
      claiming +
      published +
      retryable +
      failed +
      unknownOutcome +
      cancelled,
  };
}

function deriveLeaseFromRow(
  row: PubRow,
  leaseEvent: EventRow | undefined,
): DistributionOpsLeaseView | null {
  if (leaseEvent) {
    const meta = sanitizeOpsMeta(leaseEvent.meta ?? {});
    return {
      owner: typeof meta.lease_owner === 'string' ? meta.lease_owner : null,
      acquiredAt:
        typeof meta.lease_acquired_at === 'string'
          ? meta.lease_acquired_at
          : leaseEvent.created_at,
      expiresAt:
        typeof meta.lease_expires_at === 'string' ? meta.lease_expires_at : null,
    };
  }
  if (String(row.status).toLowerCase() !== 'publishing') return null;
  const acquired = row.updated_at;
  const started = Date.parse(acquired);
  if (!Number.isFinite(started)) {
    return { owner: null, acquiredAt: acquired, expiresAt: null };
  }
  return {
    owner: null,
    acquiredAt: acquired,
    expiresAt: new Date(started + DISTRIBUTION_PUBLISHING_LEASE_MS).toISOString(),
  };
}

export async function listDistributionOpsPublications(
  supabase: SupabaseClient,
  options?: {
    filter?: DistributionOpsStatusFilter;
    limit?: number;
    env?: NodeJS.ProcessEnv;
  },
): Promise<DistributionOpsListResult> {
  const filter = options?.filter ?? 'all';
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100));
  const statuses =
    filter === 'all'
      ? [...DISTRIBUTION_OPS_LIST_STATUSES]
      : [filter];

  const { data, error } = await supabase
    .from('distribution_publications')
    .select(
      'id, offer_id, destination_id, provider, status, attempt_count, idempotency_key, distribution_version, external_message_id, last_error_code, last_error_message, created_at, updated_at, published_at',
    )
    .in('status', statuses)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const pubs = (data ?? []) as PubRow[];
  const statusCounts = await fetchDistributionOpsStatusCounts(supabase);
  const ids = pubs.map((p) => p.id);

  const lastByPub = new Map<string, EventRow>();
  const leaseByPub = new Map<string, EventRow>();

  if (ids.length > 0) {
    const { data: events, error: evErr } = await supabase
      .from('distribution_events')
      .select('publication_id, event_type, meta, created_at')
      .in('publication_id', ids)
      .order('created_at', { ascending: false })
      .limit(Math.min(ids.length * 20, 500));

    if (evErr) {
      console.error('[distribution-ops] events load failed:', evErr.message);
    } else {
      for (const raw of events ?? []) {
        const ev = raw as EventRow;
        if (!lastByPub.has(ev.publication_id)) {
          lastByPub.set(ev.publication_id, ev);
        }
        if (
          ev.event_type === 'lease_acquired' &&
          !leaseByPub.has(ev.publication_id)
        ) {
          leaseByPub.set(ev.publication_id, ev);
        }
      }
    }
  }

  const publications: DistributionOpsPublicationRow[] = pubs.map((row) => {
    const status = String(row.status).toLowerCase();
    const last = lastByPub.get(row.id);
    return {
      id: row.id,
      offerId: row.offer_id,
      destinationId: row.destination_id,
      provider: row.provider,
      status,
      operatorStatus: operatorLabel(status),
      attemptCount: Number(row.attempt_count ?? 0),
      idempotencyKey: row.idempotency_key,
      distributionVersion: Number(row.distribution_version ?? 1),
      externalMessageId: row.external_message_id,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message
        ? String(row.last_error_message).slice(0, 500)
        : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      lease: deriveLeaseFromRow(row, leaseByPub.get(row.id)),
      lastEvent: last
        ? {
            eventType: last.event_type,
            createdAt: last.created_at,
            meta: sanitizeOpsMeta(last.meta ?? {}),
          }
        : null,
      requiresOperatorReconcile: status === 'unknown_outcome',
    };
  });

  return {
    ok: true,
    filter,
    engineEnabled: isDistributionEngineEnabled(options?.env ?? process.env),
    count: publications.length,
    statusCounts,
    publications,
  };
}

export type ReleaseUnknownOpsResult =
  | {
      ok: true;
      publicationId: string;
      previousStatus: 'unknown_outcome';
      status: 'retryable';
      idempotencyKey: string | null;
    }
  | {
      ok: false;
      reason: string;
      publicationId?: string;
      currentStatus?: string | null;
    };

/**
 * Operator release: re-read publication from DB, then C3 CAS authority.
 * Never trusts client status. Never calls providers.
 */
export async function releaseUnknownOutcomeForOps(
  supabase: SupabaseClient,
  publicationIdRaw: unknown,
  options?: { reason?: string; nowMs?: number },
): Promise<ReleaseUnknownOpsResult> {
  if (!isValidPublicationId(publicationIdRaw)) {
    return { ok: false, reason: 'invalid_publication_id' };
  }
  const publicationId = publicationIdRaw.trim();

  const { data: row, error } = await supabase
    .from('distribution_publications')
    .select('id, status, idempotency_key')
    .eq('id', publicationId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: error.message, publicationId };
  }
  if (!row) {
    return { ok: false, reason: 'publication_not_found', publicationId };
  }

  const currentStatus = String((row as { status?: string }).status ?? '').toLowerCase();
  if (currentStatus !== 'unknown_outcome') {
    return {
      ok: false,
      reason: 'not_unknown_outcome',
      publicationId,
      currentStatus,
    };
  }

  const released = await releaseUnknownOutcomeToRetryable(supabase, publicationId, {
    nowMs: options?.nowMs,
    reason: options?.reason,
  });

  if (!released.ok) {
    // Re-read for CAS lost visibility
    const { data: again } = await supabase
      .from('distribution_publications')
      .select('status')
      .eq('id', publicationId)
      .maybeSingle();
    return {
      ok: false,
      reason: released.reason,
      publicationId,
      currentStatus: again
        ? String((again as { status?: string }).status ?? '').toLowerCase()
        : currentStatus,
    };
  }

  return {
    ok: true,
    publicationId,
    previousStatus: 'unknown_outcome',
    status: 'retryable',
    idempotencyKey: (row as { idempotency_key?: string }).idempotency_key ?? null,
  };
}
