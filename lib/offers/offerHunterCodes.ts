import type { SupabaseClient } from '@supabase/supabase-js';
import { isBotUserId } from '@/lib/bots/ingest/isBotUserId';
import { isSupplyHunterCode } from '@/lib/product/hunters/identity';

type OfferRowRef = { id: string; created_by?: string | null };

/**
 * Lee `bot_meta.hunter_code` solo de ofertas de autores máquina.
 * Las vistas públicas no exponen bot_meta; si la lectura falla, el autor cae al hunter predeterminado.
 */
export async function loadOfferHunterCodes(
  supabase: Pick<SupabaseClient, 'from'>,
  rows: readonly OfferRowRef[],
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.filter((row) => row.id && isBotUserId(row.created_by)).map((row) => row.id))];
  const codes = new Map<string, string>();
  if (ids.length === 0) return codes;
  const { data, error } = await supabase
    .from('offers')
    .select('id, hunter_code:bot_meta->>hunter_code')
    .in('id', ids);
  if (error) {
    console.error('[offer-hunter-codes] lookup failed');
    return codes;
  }
  for (const row of (data ?? []) as { id: string; hunter_code: unknown }[]) {
    if (isSupplyHunterCode(row.hunter_code)) codes.set(row.id, row.hunter_code);
  }
  return codes;
}

/** Devuelve las filas con `hunter_code` para que la tarjeta presente al hunter correcto. */
export async function withOfferHunterCodes<T extends OfferRowRef>(
  supabase: Pick<SupabaseClient, 'from'>,
  rows: readonly T[],
): Promise<Array<T & { hunter_code: string | null }>> {
  const codes = await loadOfferHunterCodes(supabase, rows);
  return rows.map((row) => ({ ...row, hunter_code: codes.get(row.id) ?? null }));
}
