/**
 * Write path de Supply Truth. Nunca lanza. Un fallo de observabilidad
 * no puede tumbar collect / insert / community POST.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import type { SupplyFamily } from './types';
import {
  SUPPLY_FAMILIES,
  SUPPLY_RUN_STATUSES,
  SUPPLY_RUN_TABLE,
  type RecordSupplyRunOutcome,
  type SupplyLane,
  type SupplyRunInput,
  type SupplyRunRow,
  type SupplyRunStatus,
} from './truthTypes';

const COUNTER_MAX = 1_000_000;
const DURATION_MAX_MS = 24 * 60 * 60 * 1000;

export function supplyLaneForFamily(family: string): SupplyLane {
  return family === 'community' ? 'community' : 'machine';
}

export function clampSupplyCounter(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(COUNTER_MAX, Math.round(n)));
}

export function normalizeSupplyFamily(raw: string | null | undefined): SupplyFamily {
  const value = (raw ?? '').trim();
  return SUPPLY_FAMILIES.includes(value as SupplyFamily) ? (value as SupplyFamily) : 'core';
}

export function normalizeSupplyRunStatus(raw: string | null | undefined): SupplyRunStatus {
  const value = (raw ?? '').trim();
  return SUPPLY_RUN_STATUSES.includes(value as SupplyRunStatus) ? (value as SupplyRunStatus) : 'ok';
}

function sanitizeToken(raw: string, max: number): string {
  return raw.trim().slice(0, max).replace(/[^\w.:-]/g, '_');
}

export function inferSupplyRunStatus(input: {
  attempted?: boolean;
  ok?: boolean;
  isolatedFailure?: boolean;
  skippedReason?: string | null;
  candidates?: number;
  errors?: number;
}): SupplyRunStatus {
  if (input.isolatedFailure || input.ok === false) return 'failed';
  if (input.skippedReason && input.attempted === false) return 'skipped';
  if ((input.candidates ?? 0) <= 0 && (input.errors ?? 0) <= 0 && input.attempted) return 'zero';
  if ((input.errors ?? 0) > 0 || input.skippedReason === 'circuit_open') return 'degraded';
  return 'ok';
}

export function normalizeSupplyRunInput(input: SupplyRunInput): SupplyRunRow | null {
  const sourceId = sanitizeToken(input.sourceId ?? '', 64);
  if (!sourceId) return null;

  const startedMs = Date.parse(input.startedAt);
  const finishedMs = Date.parse(input.finishedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs)) return null;

  const startedAt = new Date(startedMs).toISOString();
  const finishedAt = new Date(Math.max(finishedMs, startedMs)).toISOString();
  const family = normalizeSupplyFamily(input.sourceFamily);
  const runId = sanitizeToken(input.runId?.trim() || crypto.randomUUID(), 80);
  const duration =
    input.durationMs != null
      ? clampSupplyCounter(Math.min(DURATION_MAX_MS, input.durationMs))
      : clampSupplyCounter(Math.min(DURATION_MAX_MS, Date.parse(finishedAt) - Date.parse(startedAt)));

  const shadow =
    typeof input.shadowCycleId === 'string' && input.shadowCycleId.trim()
      ? input.shadowCycleId.trim().slice(0, 64)
      : null;

  return {
    run_id: runId,
    source_id: sourceId,
    source_family: family,
    source_lane: supplyLaneForFamily(family),
    started_at: startedAt,
    finished_at: finishedAt,
    status: normalizeSupplyRunStatus(input.status),
    candidates_discovered: clampSupplyCounter(input.candidatesDiscovered),
    candidates_qualified: clampSupplyCounter(input.candidatesQualified),
    verified_deals: clampSupplyCounter(input.verifiedDeals),
    promotions: clampSupplyCounter(input.promotions),
    potential_deals: clampSupplyCounter(input.potentialDeals),
    catalog_only: clampSupplyCounter(input.catalogOnly),
    duplicates: clampSupplyCounter(input.duplicates),
    rejected: clampSupplyCounter(input.rejected),
    pending: clampSupplyCounter(input.pending),
    errors: clampSupplyCounter(input.errors),
    duration_ms: duration,
    shadow_cycle_id: shadow,
  };
}

function tableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes(SUPPLY_RUN_TABLE) && msg.includes('does not exist');
}

function uniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

function adminClient(): SupabaseClient | null {
  try {
    return createServerClient();
  } catch {
    return null;
  }
}

export function shouldSkipSupplyPersistInTests(opts?: { allowInTests?: boolean }): boolean {
  if (opts?.allowInTests) return false;
  return process.env.VITEST === 'true';
}

/**
 * Inserta exactamente una fila. Reintento con el mismo (run_id, source_id)
 * es idempotente. Nunca lanza.
 */
export async function recordSupplyRun(
  input: SupplyRunInput,
  opts?: { supabase?: SupabaseClient | null; allowInTests?: boolean },
): Promise<RecordSupplyRunOutcome> {
  if (shouldSkipSupplyPersistInTests(opts)) {
    return { persisted: false, reason: 'test_skip' };
  }

  const row = normalizeSupplyRunInput(input);
  if (!row) return { persisted: false, reason: 'invalid' };

  const supabase = opts && 'supabase' in opts ? opts.supabase : adminClient();
  if (!supabase) return { persisted: false, reason: 'no_client' };

  try {
    const { error } = await supabase.from(SUPPLY_RUN_TABLE).insert([row]);
    if (!error) {
      return { persisted: true, runId: row.run_id, sourceId: row.source_id, duplicate: false };
    }
    if (uniqueViolation(error)) {
      return { persisted: true, runId: row.run_id, sourceId: row.source_id, duplicate: true };
    }
    return { persisted: false, reason: tableMissing(error) ? 'table_missing' : 'error' };
  } catch {
    return { persisted: false, reason: 'error' };
  }
}

export async function recordSupplyRuns(
  inputs: SupplyRunInput[],
  opts?: { supabase?: SupabaseClient | null; allowInTests?: boolean },
): Promise<RecordSupplyRunOutcome[]> {
  const out: RecordSupplyRunOutcome[] = [];
  for (const input of inputs) {
    out.push(await recordSupplyRun(input, opts));
  }
  return out;
}
