import { createServerClient } from '@/lib/supabase/server';
import type {
  HunterBreakerState,
  HunterHealthStatus,
  HunterSourceHealth,
  HunterSourceId,
} from './types';

const TABLE = 'hunter_source_health';

/** Memoria de proceso (tests / fallback si la tabla aún no existe). */
const memoryStore = new Map<string, HunterSourceHealth>();

export function resetHunterHealthMemoryForTests(): void {
  memoryStore.clear();
}

/** Lectura síncrona de memoria de proceso. No toca DB. */
export function peekHunterHealthMemory(
  sourceId: HunterSourceId
): HunterSourceHealth | undefined {
  return memoryStore.get(sourceId);
}

export function defaultHealthRow(
  sourceId: HunterSourceId,
  opts?: Partial<HunterSourceHealth>
): HunterSourceHealth {
  const now = new Date().toISOString();
  return {
    sourceId,
    enabled: opts?.enabled ?? true,
    status: opts?.status ?? 'degraded',
    breakerState: opts?.breakerState ?? 'closed',
    lastRunAt: opts?.lastRunAt ?? null,
    lastSuccessAt: opts?.lastSuccessAt ?? null,
    lastFailureAt: opts?.lastFailureAt ?? null,
    consecutiveFailures: opts?.consecutiveFailures ?? 0,
    itemsFound: opts?.itemsFound ?? 0,
    itemsInserted: opts?.itemsInserted ?? 0,
    duplicates: opts?.duplicates ?? 0,
    skipped: opts?.skipped ?? 0,
    errors: opts?.errors ?? 0,
    latencyMs: opts?.latencyMs ?? null,
    lastErrorCode: opts?.lastErrorCode ?? null,
    lastErrorMessageSafe: opts?.lastErrorMessageSafe ?? null,
    updatedAt: opts?.updatedAt ?? now,
    cooldownUntil: opts?.cooldownUntil ?? null,
    expectedIntervalMs: opts?.expectedIntervalMs ?? 15 * 60 * 1000,
  };
}

function rowFromDb(raw: Record<string, unknown>): HunterSourceHealth {
  return {
    sourceId: String(raw.source_id) as HunterSourceId,
    enabled: Boolean(raw.enabled),
    status: String(raw.status) as HunterHealthStatus,
    breakerState: String(raw.breaker_state) as HunterBreakerState,
    lastRunAt: (raw.last_run_at as string | null) ?? null,
    lastSuccessAt: (raw.last_success_at as string | null) ?? null,
    lastFailureAt: (raw.last_failure_at as string | null) ?? null,
    consecutiveFailures: Number(raw.consecutive_failures ?? 0),
    itemsFound: Number(raw.items_found ?? 0),
    itemsInserted: Number(raw.items_inserted ?? 0),
    duplicates: Number(raw.duplicates ?? 0),
    skipped: Number(raw.skipped ?? 0),
    errors: Number(raw.errors ?? 0),
    latencyMs: raw.latency_ms == null ? null : Number(raw.latency_ms),
    lastErrorCode: (raw.last_error_code as string | null) ?? null,
    lastErrorMessageSafe: (raw.last_error_message_safe as string | null) ?? null,
    updatedAt: String(raw.updated_at ?? new Date().toISOString()),
    cooldownUntil: (raw.cooldown_until as string | null) ?? null,
    expectedIntervalMs: Number(raw.expected_interval_ms ?? 15 * 60 * 1000),
  };
}

function toDb(row: HunterSourceHealth): Record<string, unknown> {
  return {
    source_id: row.sourceId,
    enabled: row.enabled,
    status: row.status,
    breaker_state: row.breakerState,
    last_run_at: row.lastRunAt,
    last_success_at: row.lastSuccessAt,
    last_failure_at: row.lastFailureAt,
    consecutive_failures: row.consecutiveFailures,
    items_found: row.itemsFound,
    items_inserted: row.itemsInserted,
    duplicates: row.duplicates,
    skipped: row.skipped,
    errors: row.errors,
    latency_ms: row.latencyMs,
    last_error_code: row.lastErrorCode,
    last_error_message_safe: row.lastErrorMessageSafe,
    updated_at: row.updatedAt,
    cooldown_until: row.cooldownUntil,
    expected_interval_ms: row.expectedIntervalMs,
  };
}

let tableMissingLogged = false;

async function trySupabase<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function getHunterHealth(
  sourceIds?: HunterSourceId[]
): Promise<HunterSourceHealth[]> {
  const fromMemory = () => {
    const all = [...memoryStore.values()];
    if (!sourceIds?.length) return all;
    return sourceIds.map((id) => memoryStore.get(id) ?? defaultHealthRow(id));
  };

  return trySupabase(async () => {
    const supabase = createServerClient();
    let q = supabase.from(TABLE).select('*');
    if (sourceIds?.length) q = q.in('source_id', sourceIds);
    const { data, error } = await q;
    if (error) {
      if (!tableMissingLogged) {
        tableMissingLogged = true;
        console.warn('[hunter:health] table unavailable, using memory fallback');
      }
      return fromMemory();
    }
    const rows = (data ?? []).map((r) => rowFromDb(r as Record<string, unknown>));
    for (const row of rows) memoryStore.set(row.sourceId, row);
    if (sourceIds?.length) {
      return sourceIds.map((id) => rows.find((r) => r.sourceId === id) ?? memoryStore.get(id) ?? defaultHealthRow(id));
    }
    return rows.length ? rows : fromMemory();
  }, fromMemory());
}

export async function upsertHunterHealth(row: HunterSourceHealth): Promise<void> {
  const next = { ...row, updatedAt: new Date().toISOString() };
  memoryStore.set(next.sourceId, next);

  await trySupabase(async () => {
    const supabase = createServerClient();
    const { error } = await supabase.from(TABLE).upsert(toDb(next), { onConflict: 'source_id' });
    if (error && !tableMissingLogged) {
      tableMissingLogged = true;
      console.warn('[hunter:health] upsert skipped:', error.message);
    }
  }, undefined);
}

export async function recordHunterRun(
  patch: Partial<HunterSourceHealth> & { sourceId: HunterSourceId }
): Promise<HunterSourceHealth> {
  const [prev] = await getHunterHealth([patch.sourceId]);
  const merged: HunterSourceHealth = {
    ...defaultHealthRow(patch.sourceId, prev),
    ...prev,
    ...patch,
    sourceId: patch.sourceId,
    updatedAt: new Date().toISOString(),
  };
  await upsertHunterHealth(merged);
  return merged;
}

export async function recordHunterSuccess(
  sourceId: HunterSourceId,
  metrics: {
    itemsFound: number;
    itemsInserted?: number;
    duplicates?: number;
    skipped?: number;
    errors?: number;
    latencyMs: number;
    enabled?: boolean;
    expectedIntervalMs?: number;
    status?: HunterHealthStatus;
    breakerState?: HunterBreakerState;
    consecutiveFailures?: number;
    cooldownUntil?: string | null;
  }
): Promise<HunterSourceHealth> {
  const now = new Date().toISOString();
  return recordHunterRun({
    sourceId,
    enabled: metrics.enabled ?? true,
    status: metrics.status ?? 'healthy',
    breakerState: metrics.breakerState ?? 'closed',
    consecutiveFailures: metrics.consecutiveFailures ?? 0,
    cooldownUntil: metrics.cooldownUntil ?? null,
    lastRunAt: now,
    lastSuccessAt: now,
    itemsFound: metrics.itemsFound,
    itemsInserted: metrics.itemsInserted ?? 0,
    duplicates: metrics.duplicates ?? 0,
    skipped: metrics.skipped ?? 0,
    errors: metrics.errors ?? 0,
    latencyMs: metrics.latencyMs,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    expectedIntervalMs: metrics.expectedIntervalMs,
  });
}

export async function recordHunterFailure(
  sourceId: HunterSourceId,
  metrics: {
    errorCode?: string | null;
    errorMessageSafe?: string | null;
    itemsFound?: number;
    latencyMs: number;
    enabled?: boolean;
    expectedIntervalMs?: number;
    status: HunterHealthStatus;
    breakerState: HunterBreakerState;
    consecutiveFailures: number;
    cooldownUntil: string | null;
  }
): Promise<HunterSourceHealth> {
  const now = new Date().toISOString();
  return recordHunterRun({
    sourceId,
    enabled: metrics.enabled ?? true,
    status: metrics.status,
    breakerState: metrics.breakerState,
    consecutiveFailures: metrics.consecutiveFailures,
    cooldownUntil: metrics.cooldownUntil,
    lastRunAt: now,
    lastFailureAt: now,
    itemsFound: metrics.itemsFound ?? 0,
    latencyMs: metrics.latencyMs,
    lastErrorCode: metrics.errorCode ?? null,
    lastErrorMessageSafe: metrics.errorMessageSafe ?? null,
    errors: 1,
    expectedIntervalMs: metrics.expectedIntervalMs,
  });
}

/** Sanitiza mensajes antes de persistir (sin tokens). */
export function safeErrorMessage(raw: unknown, maxLen = 180): string {
  const s = raw instanceof Error ? raw.message : String(raw ?? 'error');
  return s
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/access_token[=:]\s*\S+/gi, 'access_token=[redacted]')
    .slice(0, maxLen);
}
