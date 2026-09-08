import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getShadowCycleReport } from './metrics';
import {
  buildShadowCycleRow,
  shadowCycleRowToReport,
  SHADOW_CYCLE_TABLE,
  type ShadowCycleReport,
} from './shadowCycle';

export type PersistShadowCycleOutcome =
  | { persisted: true; cycleId: string }
  | { persisted: false; reason: 'empty_cycle' | 'no_client' | 'table_missing' | 'error' };

const SELECT_COLUMNS =
  'cycle_id, started_at, finished_at, evaluated, auto_approve, human_review, auto_reject, ' +
  'auto_approve_pct, human_review_pct, auto_reject_pct, autonomous_pct, avg_confidence, avg_score, ' +
  'duplicate_pass, duplicate_fail, duplicate_unknown, image_found, image_missing, ' +
  'top_reasons, by_source, policy_version, schema_version';

function tableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes(SHADOW_CYCLE_TABLE) && msg.includes('does not exist');
}

function adminClient(): SupabaseClient | null {
  try {
    return createServerClient();
  } catch {
    return null;
  }
}

/**
 * Escribe el snapshot del ciclo shadow. Append-only: un INSERT por ciclo, sin update
 * ni delete, para que el ciclo anterior siga siendo consultable.
 *
 * Nunca lanza: la observabilidad no puede tumbar una corrida de ingest.
 * Un ciclo sin candidatos evaluados no se persiste (no hay nada que comparar).
 */
export async function persistShadowCycleSnapshot(opts?: {
  supabase?: SupabaseClient | null;
  report?: ShadowCycleReport;
  now?: Date;
}): Promise<PersistShadowCycleOutcome> {
  const report = opts?.report ?? getShadowCycleReport(opts?.now ?? new Date());
  if (report.evaluated <= 0) return { persisted: false, reason: 'empty_cycle' };

  const supabase = opts?.supabase !== undefined ? opts.supabase : adminClient();
  if (!supabase) return { persisted: false, reason: 'no_client' };

  try {
    const { error } = await supabase.from(SHADOW_CYCLE_TABLE).insert([buildShadowCycleRow(report)]);
    if (error) {
      return { persisted: false, reason: tableMissing(error) ? 'table_missing' : 'error' };
    }
    return { persisted: true, cycleId: report.cycleId };
  } catch {
    return { persisted: false, reason: 'error' };
  }
}

/** Últimos ciclos persistidos, más reciente primero. Solo lectura para el panel admin. */
export async function readRecentShadowCycles(
  supabase: SupabaseClient | null,
  limit = 2
): Promise<ShadowCycleReport[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(SHADOW_CYCLE_TABLE)
      .select(SELECT_COLUMNS)
      .order('finished_at', { ascending: false })
      .limit(Math.max(1, Math.min(20, limit)));
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => shadowCycleRowToReport(row as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}
