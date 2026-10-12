import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cupo de candidatos aceptados por corrida (`runId`) de un cliente MCP.
 *
 * Cada candidato aceptado ocupa un slot numerado 1..cap. Un slot es una fila de
 * `ingest_cycle_locks` (PK `lock_key`): el INSERT de una PK es atómico en Postgres,
 * así que dos llamadas concurrentes nunca ocupan el mismo slot y nunca hay más de
 * `cap` slots vivos por corrida. Un slot ocupado no caduca; liberarlo (candidato que
 * al final no entró) adelanta `expires_at` y sólo entonces otro envío puede retomarlo
 * con un UPDATE condicional de una sola sentencia.
 *
 * Fail-closed: cualquier error que no sea "slot ocupado" corta el envío.
 */

export const MCP_RUN_SLOT_TABLE = 'ingest_cycle_locks';
const HELD_UNTIL = '9999-12-31T23:59:59.000Z';

export function runSlotKey(clientId: string, runId: string, slot: number): string {
  return `mcp:run-slot:${clientId}:${slot}:${runId}`;
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key value violates unique constraint/i.test(error.message ?? '');
}

export type RunSlotClaim = { ok: true; slots: number[] } | { ok: false; slots: number[] };

/** Ocupa hasta `wanted` slots libres de 1..cap. Devuelve los ocupados por esta llamada. */
export async function claimRunSlots(
  supabase: SupabaseClient,
  params: { clientId: string; runId: string; wanted: number; cap: number; holder: string; now: Date },
): Promise<RunSlotClaim> {
  const slots: number[] = [];
  const nowIso = params.now.toISOString();
  for (let slot = 1; slot <= params.cap && slots.length < params.wanted; slot++) {
    const lockKey = runSlotKey(params.clientId, params.runId, slot);
    const { error: insertError } = await supabase
      .from(MCP_RUN_SLOT_TABLE)
      .insert({ lock_key: lockKey, holder: params.holder, acquired_at: nowIso, expires_at: HELD_UNTIL });
    if (!insertError) {
      slots.push(slot);
      continue;
    }
    if (!isUniqueViolation(insertError)) return { ok: false, slots };
    const { data: retaken, error: retakeError } = await supabase
      .from(MCP_RUN_SLOT_TABLE)
      .update({ holder: params.holder, acquired_at: nowIso, expires_at: HELD_UNTIL, updated_at: nowIso })
      .eq('lock_key', lockKey)
      .lte('expires_at', nowIso)
      .select('lock_key');
    if (retakeError) return { ok: false, slots };
    if (Array.isArray(retaken) && retaken.length > 0) slots.push(slot);
  }
  return { ok: true, slots };
}

/**
 * Libera slots propios. Mejor esfuerzo: si falla, el slot queda ocupado y la corrida
 * acepta menos, nunca más.
 */
export async function releaseRunSlots(
  supabase: SupabaseClient,
  params: { clientId: string; runId: string; slots: readonly number[]; holder: string; now: Date },
): Promise<void> {
  const nowIso = params.now.toISOString();
  for (const slot of params.slots) {
    const { error } = await supabase
      .from(MCP_RUN_SLOT_TABLE)
      .update({ expires_at: nowIso, updated_at: nowIso })
      .eq('lock_key', runSlotKey(params.clientId, params.runId, slot))
      .eq('holder', params.holder);
    if (error) console.error('[mcp] run slot release failed:', error.code ?? 'unknown');
  }
}
