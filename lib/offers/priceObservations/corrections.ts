import type { SupabaseClient } from '@supabase/supabase-js';
import type { ValidationStatus } from './policy';

export type SupersedeResult =
  | { ok: true; snapshotId: string; status: Extract<ValidationStatus, 'superseded' | 'invalid' | 'valid'> }
  | { ok: false; reason: 'not_found' | 'not_capture' | 'already_final' | 'db_error' };

/**
 * Marca una observación capturada como reemplazada, inválida o (tras revisar una cuarentena)
 * válida. Nunca borra la fila ni cambia su evidencia: solo el estado de validación y sus motivos.
 * `correctedBy` enlaza la observación que reveló el error, si existe.
 */
export async function reviewCapturedObservation(
  supabase: SupabaseClient,
  args: {
    snapshotId: string;
    status: 'superseded' | 'invalid' | 'valid';
    reason: string;
    correctedBy?: string | null;
    now: Date;
  },
): Promise<SupersedeResult> {
  const { data, error } = await supabase
    .from('offer_price_snapshots')
    .select('id, source, validation_status, validation_reasons')
    .eq('id', args.snapshotId)
    .maybeSingle();
  if (error) return { ok: false, reason: 'db_error' };
  if (!data) return { ok: false, reason: 'not_found' };
  const row = data as { id: string; source: string | null; validation_status: ValidationStatus | null; validation_reasons: string[] | null };
  if (row.source !== 'capture') return { ok: false, reason: 'not_capture' };
  if (row.validation_status === 'superseded' || row.validation_status === 'invalid') return { ok: false, reason: 'already_final' };
  if (args.status === 'valid' && row.validation_status !== 'quarantined') return { ok: false, reason: 'already_final' };

  const reasons = [...(row.validation_reasons ?? []), `review:${args.status}:${args.reason}`.slice(0, 120)];
  const update = await supabase
    .from('offer_price_snapshots')
    .update({ validation_status: args.status, validation_reasons: reasons, validated_at: args.now.toISOString() })
    .eq('id', row.id)
    .eq('source', 'capture');
  if (update.error) return { ok: false, reason: 'db_error' };

  if (args.correctedBy) {
    await supabase
      .from('offer_price_snapshots')
      .update({ corrects_snapshot_id: row.id })
      .eq('id', args.correctedBy)
      .is('corrects_snapshot_id', null);
  }
  return { ok: true, snapshotId: row.id, status: args.status };
}
