/**
 * Semántica canónica de oferta. Owner Command y Supply Intelligence
 * cuentan aprobadas y rechazadas con esta misma consulta.
 *
 * SUPPLY_CREATED: offers.created_at dentro de [inicio, fin).
 * SUPPLY_APPROVED: moderation_logs.action = approved, moderation_logs.created_at dentro de [inicio, fin).
 * SUPPLY_REJECTED: moderation_logs.action = rejected, moderation_logs.created_at dentro de [inicio, fin).
 * SUPPLY_PENDING: snapshot actual de offers.status = pending y deleted_at nulo. No es un evento del período.
 *
 * moderation_outcomes es observabilidad fail-soft. Su source_lane no clasifica actores
 * y no define cuántas ofertas se aprobaron o rechazaron.
 *
 * TODAY: día calendario America/Mexico_City, inclusive desde 00:00 (06:00Z) y exclusivo hasta ahora.
 * 7D y 30D: ventanas rodantes de 7×24h y 30×24h, inclusive en el inicio y exclusivas en ahora.
 * La frontera sale de resolveOwnerRange para no duplicar el calendario del command center.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOwnerRange, type OwnerRangeKey } from '@/lib/owner/ownerRange';

export const SUPPLY_DECISION_TABLE = 'moderation_logs' as const;
export const SUPPLY_DECISION_TIME_COLUMN = 'created_at' as const;
export const SUPPLY_APPROVED_ACTION = 'approved' as const;
export const SUPPLY_REJECTED_ACTION = 'rejected' as const;

export type SupplyDecisionAction = typeof SUPPLY_APPROVED_ACTION | typeof SUPPLY_REJECTED_ACTION;

const WINDOW_KEYS = {
  today: 'today',
  d7: '7d',
  d30: '30d',
} as const satisfies Record<string, OwnerRangeKey>;

export type SupplyWindowId = keyof typeof WINDOW_KEYS;

export function supplyWindows(now: Date): Record<SupplyWindowId, { startMs: number; endMs: number }> {
  const windows = {} as Record<SupplyWindowId, { startMs: number; endMs: number }>;
  for (const id of Object.keys(WINDOW_KEYS) as SupplyWindowId[]) {
    const range = resolveOwnerRange(WINDOW_KEYS[id], now);
    windows[id] = { startMs: Date.parse(range.start), endMs: Date.parse(range.end) };
  }
  return windows;
}

/** Conteo de decisiones aplicadas. La misma forma la usa el command center y la oferta. */
export function supplyDecisionCount(
  supabase: SupabaseClient,
  action: SupplyDecisionAction,
  startIso: string,
  endIso: string,
) {
  return supabase
    .from(SUPPLY_DECISION_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('action', action)
    .gte(SUPPLY_DECISION_TIME_COLUMN, startIso)
    .lt(SUPPLY_DECISION_TIME_COLUMN, endIso);
}
