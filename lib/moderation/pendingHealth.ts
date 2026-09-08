import type { SupabaseClient } from '@supabase/supabase-js';
import {
  summarizePendingLifecycle,
  type PendingHealthSummary,
  type PendingLifecycleRow,
} from './pendingLifecycle';

/** Solo lo que necesita la clasificación. Nada editorial, ninguna URL. */
const SELECT_CORE = 'id, status, created_at, expires_at, snoozed_until, moderator_comment';
const SELECT_WITH_OPTIONAL = `${SELECT_CORE}, deleted_at, product_fingerprint, bot_meta`;

const MAX_ROWS = 1000;

function hasMissingColumn(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('column');
}

export function emptyPendingHealth(): PendingHealthSummary {
  return summarizePendingLifecycle([]);
}

/**
 * Lee la cola pending y la clasifica. SOLO LECTURA: ningún UPDATE, ningún DELETE,
 * ninguna acción ejecutada. Nunca lanza; si la lectura falla devuelve la cola vacía
 * para no tumbar el panel.
 */
export async function getPendingHealth(
  supabase: SupabaseClient | null,
  opts: { now?: Date; limit?: number } = {}
): Promise<PendingHealthSummary> {
  if (!supabase) return emptyPendingHealth();

  const limit = Math.max(1, Math.min(MAX_ROWS, opts.limit ?? MAX_ROWS));

  try {
    let rows: PendingLifecycleRow[] = [];
    const first = await supabase
      .from('offers')
      .select(SELECT_WITH_OPTIONAL)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (first.error && hasMissingColumn(first.error)) {
      const fallback = await supabase
        .from('offers')
        .select(SELECT_CORE)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);
      if (fallback.error) return emptyPendingHealth();
      rows = (fallback.data ?? []) as unknown as PendingLifecycleRow[];
    } else if (first.error) {
      return emptyPendingHealth();
    } else {
      rows = (first.data ?? []) as unknown as PendingLifecycleRow[];
    }

    return summarizePendingLifecycle(rows, { now: opts.now });
  } catch {
    return emptyPendingHealth();
  }
}
