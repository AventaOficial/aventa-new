import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * external_conversion_id es único por fuente. Webhook y CSV pueden usar
 * identificadores distintos para la misma compra, y el mismo texto puede
 * significar cosas distintas. No se deduce una orden por parecido.
 *
 * Solo una clave entregada por el canal, en explicitOrderKey, se registra.
 * Registrar no fusiona ni bloquea la conversión.
 */

export function normalizeExplicitOrderKey(value: string | null | undefined): string | null {
  const key = value?.trim() ?? '';
  return key.length > 0 ? key : null;
}

export type CrossSourceDecision =
  | { action: 'ignore'; cause: 'ambiguous' | 'separate' | 'same_row' }
  | {
      action: 'candidate';
      network: string;
      canonicalOrderKey: string;
      conversionIds: [string, string];
    };

export function decideCrossSourceOrder(input: {
  network: string;
  incoming: { conversionId: string; explicitOrderKey?: string | null };
  existing: { conversionId: string; explicitOrderKey?: string | null };
}): CrossSourceDecision {
  const left = normalizeExplicitOrderKey(input.incoming.explicitOrderKey);
  const right = normalizeExplicitOrderKey(input.existing.explicitOrderKey);
  if (!left || !right) return { action: 'ignore', cause: 'ambiguous' };
  if (left !== right) return { action: 'ignore', cause: 'separate' };
  if (input.incoming.conversionId === input.existing.conversionId) {
    return { action: 'ignore', cause: 'same_row' };
  }
  const conversionIds = [input.incoming.conversionId, input.existing.conversionId].sort() as [
    string,
    string,
  ];
  return {
    action: 'candidate',
    network: input.network,
    canonicalOrderKey: left,
    conversionIds,
  };
}

export type ObserveOrderResult =
  | { ok: true; recorded: false; cause: 'missing_key' | 'already_recorded' }
  | { ok: true; recorded: true }
  | { ok: false; reason: string };

/**
 * Guarda la identidad explícita de esta conversión.
 * Una segunda conversión con la misma clave queda como otro candidato.
 * No modifica affiliate_conversions.
 */
export async function observeExplicitOrderIdentity(
  supabase: SupabaseClient,
  input: {
    network: string;
    source: string;
    conversionId: string;
    explicitOrderKey?: string | null;
  },
): Promise<ObserveOrderResult> {
  const key = normalizeExplicitOrderKey(input.explicitOrderKey);
  if (!key) return { ok: true, recorded: false, cause: 'missing_key' };

  const { data: existing, error: readError } = await supabase
    .from('economic_order_reconciliation_candidates')
    .select('id')
    .eq('network', input.network)
    .eq('canonical_order_key', key)
    .eq('conversion_id', input.conversionId)
    .maybeSingle();
  if (readError) return { ok: false, reason: 'candidate_read_failed' };
  if (existing?.id) return { ok: true, recorded: false, cause: 'already_recorded' };

  const { error } = await supabase.from('economic_order_reconciliation_candidates').insert({
    network: input.network,
    canonical_order_key: key,
    conversion_id: input.conversionId,
    source: input.source,
  });
  if (error) {
    const message = (error.message ?? '').toLowerCase();
    if (error.code === '23505' || message.includes('duplicate')) {
      return { ok: true, recorded: false, cause: 'already_recorded' };
    }
    return { ok: false, reason: 'candidate_write_failed' };
  }
  return { ok: true, recorded: true };
}
