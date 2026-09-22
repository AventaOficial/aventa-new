/**
 * Persist adaptive discovery cursors across processes.
 * Fail-soft: missing table / no client → memory only (still rotates via runSlot).
 * Never touches money / publish / rewards.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchedulerPersistedState } from './discoveryScheduler';

export const HUNTER_DISCOVERY_SCHEDULER_STATE_TABLE = 'hunter_discovery_scheduler_state';
export const DEFAULT_SCHEDULER_STATE_ID = 'default';

const memoryById = new Map<string, SchedulerPersistedState>();

export function resetSchedulerStateMemoryForTests(): void {
  memoryById.clear();
}

export function peekSchedulerStateMemory(id = DEFAULT_SCHEDULER_STATE_ID): SchedulerPersistedState | null {
  return memoryById.get(id) ?? null;
}

function rowToState(row: Record<string, unknown>): SchedulerPersistedState {
  const seenQ = row.seen_query_keys;
  const seenC = row.seen_category_keys;
  return {
    dayKey: String(row.day_key ?? ''),
    lastRunSlot: Number(row.last_run_slot ?? 0) || 0,
    lastQueryOffset: Number(row.last_query_offset ?? 0) || 0,
    lastCategoryOffset: Number(row.last_category_offset ?? 0) || 0,
    lastSeedOffset: Number(row.last_seed_offset ?? 0) || 0,
    seenQueryKeys: Array.isArray(seenQ) ? seenQ.map(String).slice(-200) : [],
    seenCategoryKeys: Array.isArray(seenC) ? seenC.map(String).slice(-200) : [],
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function loadSchedulerState(input: {
  supabase?: SupabaseClient | null;
  id?: string;
}): Promise<SchedulerPersistedState | null> {
  const id = input.id ?? DEFAULT_SCHEDULER_STATE_ID;
  const mem = memoryById.get(id);
  if (!input.supabase) return mem ?? null;

  try {
    const { data, error } = await input.supabase
      .from(HUNTER_DISCOVERY_SCHEDULER_STATE_TABLE)
      .select(
        'day_key, last_run_slot, last_query_offset, last_category_offset, last_seed_offset, seen_query_keys, seen_category_keys, updated_at',
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return mem ?? null;
    const state = rowToState(data as Record<string, unknown>);
    memoryById.set(id, state);
    return state;
  } catch {
    return mem ?? null;
  }
}

export async function saveSchedulerState(input: {
  supabase?: SupabaseClient | null;
  id?: string;
  state: SchedulerPersistedState;
  pagePolicy?: string;
}): Promise<{ ok: boolean; persisted: 'db' | 'memory' }> {
  const id = input.id ?? DEFAULT_SCHEDULER_STATE_ID;
  memoryById.set(id, input.state);

  if (!input.supabase) return { ok: true, persisted: 'memory' };

  try {
    const { error } = await input.supabase.from(HUNTER_DISCOVERY_SCHEDULER_STATE_TABLE).upsert(
      {
        id,
        day_key: input.state.dayKey,
        last_run_slot: input.state.lastRunSlot,
        last_query_offset: input.state.lastQueryOffset,
        last_category_offset: input.state.lastCategoryOffset,
        last_seed_offset: input.state.lastSeedOffset,
        seen_query_keys: input.state.seenQueryKeys,
        seen_category_keys: input.state.seenCategoryKeys,
        page_policy: input.pagePolicy ?? 'page_1_only',
        updated_at: input.state.updatedAt,
      },
      { onConflict: 'id' },
    );
    if (error) return { ok: true, persisted: 'memory' };
    return { ok: true, persisted: 'db' };
  } catch {
    return { ok: true, persisted: 'memory' };
  }
}
