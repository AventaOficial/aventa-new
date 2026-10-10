import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_FEED_PRESENTATION, feedPresentationSchema, type ControlDomain } from '@/lib/control/schema';

export type StoredControl = {
  domain: ControlDomain;
  recordKey: string;
  payload: unknown;
  updatedAt: string | null;
};

type ControlRow = {
  domain: ControlDomain;
  record_key: string;
  payload: unknown;
  updated_at: string | null;
};

/** Solo ausencia de relación. Un permiso o una caída de red no se disfrazan de tabla faltante. */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205';
}

export type ControlWriteOutcome =
  | { status: 'missing' }
  | { status: 'saved' }
  | { status: 'audit_failed' };

export async function listOperationalControls(
  supabase: SupabaseClient,
): Promise<{ rows: StoredControl[]; storage: 'ready' | 'missing' }> {
  const { data, error } = await supabase
    .from('operational_controls')
    .select('domain, record_key, payload, updated_at')
    .order('domain')
    .order('record_key');
  if (error) {
    if (isMissingTable(error)) return { rows: [], storage: 'missing' };
    throw new Error('No se pudo leer la configuración');
  }
  const rows = ((data ?? []) as ControlRow[]).map((row) => ({
    domain: row.domain,
    recordKey: row.record_key,
    payload: row.payload,
    updatedAt: row.updated_at,
  }));
  return { rows, storage: 'ready' };
}

/**
 * Upsert y auditoría son dos escrituras. No hay RPC transaccional en el esquema
 * disponible y esta pasada no añade una migración. Si la auditoría falla, el
 * resultado es `audit_failed`: la fila puede haber quedado escrita y el guardado
 * no se confirma.
 */
export async function writeOperationalControl(
  supabase: SupabaseClient,
  input: { domain: ControlDomain; recordKey: string; payload: unknown; actorId: string },
): Promise<ControlWriteOutcome> {
  const { data: previous, error: readError } = await supabase
    .from('operational_controls')
    .select('payload')
    .eq('domain', input.domain)
    .eq('record_key', input.recordKey)
    .maybeSingle();
  if (readError) {
    if (isMissingTable(readError)) return { status: 'missing' };
    throw new Error('No se pudo leer el valor anterior');
  }

  const { error } = await supabase.from('operational_controls').upsert(
    {
      domain: input.domain,
      record_key: input.recordKey,
      payload: input.payload,
      updated_by: input.actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'domain,record_key' },
  );
  if (error) {
    if (isMissingTable(error)) return { status: 'missing' };
    throw new Error('No se pudo guardar la configuración');
  }

  const { error: auditError } = await supabase.from('operational_control_audit').insert({
    actor_id: input.actorId,
    domain: input.domain,
    record_key: input.recordKey,
    action: 'upsert',
    before_payload: previous?.payload ?? null,
    after_payload: input.payload,
    result: 'saved',
  });
  if (auditError) return { status: 'audit_failed' };
  return { status: 'saved' };
}

export async function readFeedPresentation(supabase: SupabaseClient): Promise<typeof DEFAULT_FEED_PRESENTATION> {
  const { data, error } = await supabase
    .from('operational_controls')
    .select('payload')
    .eq('domain', 'feed_presentation')
    .eq('record_key', 'home_vitales')
    .maybeSingle();
  if (error || !data) return DEFAULT_FEED_PRESENTATION;
  const parsed = feedPresentationSchema.safeParse(data.payload);
  return parsed.success ? parsed.data : DEFAULT_FEED_PRESENTATION;
}
