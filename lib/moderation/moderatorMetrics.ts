/**
 * Métricas de throughput por moderador (reutiliza moderation_logs).
 * Read-only. No inventa analytics paralelo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ModeratorThroughputRow = {
  moderatorId: string;
  approved: number;
  rejected: number;
  edited: number;
  claimed: number;
  reclaimed: number;
  decisions: number;
  approvalRate: number | null;
};

export type ModeratorThroughputSnapshot = {
  sinceIso: string;
  untilIso: string;
  byModerator: ModeratorThroughputRow[];
  totals: {
    approved: number;
    rejected: number;
    edited: number;
    claimed: number;
    reclaimed: number;
    decisions: number;
  };
};

function emptyTotals() {
  return { approved: 0, rejected: 0, edited: 0, claimed: 0, reclaimed: 0, decisions: 0 };
}

/**
 * Agrega acciones de moderation_logs por user_id en una ventana.
 */
export async function buildModeratorThroughput(
  supabase: SupabaseClient,
  opts?: { sinceMs?: number; untilMs?: number; limit?: number },
): Promise<ModeratorThroughputSnapshot> {
  const untilMs = opts?.untilMs ?? Date.now();
  const sinceMs = opts?.sinceMs ?? untilMs - 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const untilIso = new Date(untilMs).toISOString();
  const limit = Math.max(1, Math.min(5000, opts?.limit ?? 2000));

  const { data, error } = await supabase
    .from('moderation_logs')
    .select('user_id, action')
    .gte('created_at', sinceIso)
    .lte('created_at', untilIso)
    .limit(limit);

  const totals = emptyTotals();
  if (error || !data) {
    return { sinceIso, untilIso, byModerator: [], totals };
  }

  const map = new Map<string, ModeratorThroughputRow>();

  for (const raw of data) {
    const userId = (raw as { user_id?: string | null }).user_id ?? 'system';
    const action = String((raw as { action?: string }).action ?? '').toLowerCase();
    let row = map.get(userId);
    if (!row) {
      row = {
        moderatorId: userId,
        approved: 0,
        rejected: 0,
        edited: 0,
        claimed: 0,
        reclaimed: 0,
        decisions: 0,
        approvalRate: null,
      };
      map.set(userId, row);
    }

    if (action === 'approved') {
      row.approved += 1;
      row.decisions += 1;
      totals.approved += 1;
      totals.decisions += 1;
    } else if (action === 'rejected') {
      row.rejected += 1;
      row.decisions += 1;
      totals.rejected += 1;
      totals.decisions += 1;
    } else if (action === 'edited' || action === 'updated') {
      row.edited += 1;
      totals.edited += 1;
    } else if (action === 'claim' || action === 'claimed') {
      row.claimed += 1;
      totals.claimed += 1;
    } else if (action === 'lock_reclaimed_stale') {
      row.reclaimed += 1;
      totals.reclaimed += 1;
    }
  }

  const byModerator = [...map.values()]
    .map((r) => ({
      ...r,
      approvalRate:
        r.decisions > 0 ? Math.round((r.approved / r.decisions) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.decisions - a.decisions || b.approved - a.approved);

  return { sinceIso, untilIso, byModerator, totals };
}
