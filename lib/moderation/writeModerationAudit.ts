/**
 * Escritura canónica a moderation_logs.
 * Fail-soft: la auditoría no tumba la acción principal.
 * Nunca almacena secretos ni tokens.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ModerationAuditAction =
  | 'approved'
  | 'rejected'
  | 'edited'
  | 'snoozed'
  | 'expired'
  | 'claim'
  | 'lock_reclaimed_stale'
  | 'lock_released';

export type WriteModerationAuditInput = {
  offerId: string;
  /** null = sistema / cron (sin usuario humano). */
  userId: string | null;
  action: ModerationAuditAction | string;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type WriteModerationAuditResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Inserta una fila de auditoría. Nunca lanza.
 */
export async function writeModerationAudit(
  supabase: SupabaseClient,
  input: WriteModerationAuditInput,
): Promise<WriteModerationAuditResult> {
  const offerId = input.offerId?.trim();
  if (!offerId) return { ok: false, error: 'offerId required' };

  const row = {
    offer_id: offerId,
    user_id: input.userId,
    action: String(input.action).slice(0, 64),
    previous_status: input.previousStatus ?? null,
    new_status: input.newStatus ?? null,
    reason: input.reason?.trim().slice(0, 500) || null,
    metadata: input.metadata ?? null,
  };

  const { error } = await supabase.from('moderation_logs').insert(row);
  if (error) {
    console.error('[moderation-audit]', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Batch fail-soft. Continúa aunque alguna fila falle.
 */
export async function writeModerationAuditBatch(
  supabase: SupabaseClient,
  rows: WriteModerationAuditInput[],
): Promise<{ written: number; failed: number }> {
  if (rows.length === 0) return { written: 0, failed: 0 };
  let written = 0;
  let failed = 0;
  // Chunk pequeño para no saturar; reclaim suele ser <200.
  for (const input of rows) {
    const r = await writeModerationAudit(supabase, input);
    if (r.ok) written += 1;
    else failed += 1;
  }
  return { written, failed };
}
