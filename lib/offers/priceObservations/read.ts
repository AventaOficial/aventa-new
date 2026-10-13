import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMissingColumnError,
  LEGACY_SNAPSHOT_SELECT,
  OBSERVATION_SELECT,
  PRICE_OBSERVATION_POLICY as P,
  type StoredObservationRow,
} from './policy';

export type OfferObservationHistory = {
  rows: StoredObservationRow[];
  /** false si la consulta de su lote falló o llegó recortada. */
  complete: boolean;
};

export type ObservationReadResult = {
  byOffer: Map<string, OfferObservationHistory>;
  /** La base todavía no tiene las columnas del motor: todo se lee como legado. */
  schema: 'observations' | 'legacy';
  failedChunks: number;
  truncatedChunks: number;
};

type ChunkOutcome = { rows: StoredObservationRow[]; ok: boolean; truncated: boolean; missingColumns: boolean };

/**
 * Historial de varias ofertas en lotes de 8 (8 × 120 filas < 1000 de PostgREST).
 * Un lote que falla o llega recortado deja a sus ofertas como historial incompleto:
 * un historial parcial podría fabricar una mediana o un mínimo falsos.
 */
export async function readOfferObservations(
  supabase: SupabaseClient,
  offerIds: readonly string[],
  opts: { now: Date; onlyCapture?: boolean },
): Promise<ObservationReadResult> {
  const byOffer = new Map<string, OfferObservationHistory>();
  const ids = [...new Set(offerIds.filter(Boolean))];
  if (ids.length === 0) return { byOffer, schema: 'observations', failedChunks: 0, truncatedChunks: 0 };

  const since = new Date(opts.now.getTime() - P.windowDays * 86_400_000).toISOString();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += P.offersPerQuery) chunks.push(ids.slice(i, i + P.offersPerQuery));

  const runChunk = async (chunk: string[], columns: string): Promise<ChunkOutcome> => {
    let q = supabase
      .from('offer_price_snapshots')
      .select(columns, { count: 'exact' })
      .in('offer_id', chunk)
      .gte('recorded_at', since);
    if (opts.onlyCapture) q = q.eq('source', 'capture');
    const { data, error, count } = await q.order('recorded_at', { ascending: false }).limit(chunk.length * P.maxRowsPerOffer);
    if (error) return { rows: [], ok: false, truncated: false, missingColumns: isMissingColumnError(error) };
    const rows = (data ?? []) as unknown as StoredObservationRow[];
    const truncated = count == null || count > rows.length;
    return { rows, ok: !truncated, truncated, missingColumns: false };
  };

  let schema: ObservationReadResult['schema'] = 'observations';
  let outcomes = await Promise.all(chunks.map((c) => runChunk(c, OBSERVATION_SELECT)));
  if (outcomes.some((o) => o.missingColumns)) {
    schema = 'legacy';
    outcomes = opts.onlyCapture
      ? outcomes.map(() => ({ rows: [], ok: true, truncated: false, missingColumns: true }))
      : await Promise.all(chunks.map((c) => runChunk(c, LEGACY_SNAPSHOT_SELECT)));
  }

  let failedChunks = 0;
  let truncatedChunks = 0;
  chunks.forEach((chunk, i) => {
    const o = outcomes[i];
    if (o.truncated) truncatedChunks += 1;
    else if (!o.ok) failedChunks += 1;
    for (const id of chunk) byOffer.set(id, { rows: [], complete: o.ok });
    if (!o.ok) return;
    for (const row of o.rows) byOffer.get(row.offer_id)?.rows.push(row);
  });
  return { byOffer, schema, failedChunks, truncatedChunks };
}
