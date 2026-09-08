import type { DuplicateOfferKind } from '@/lib/offers/findDuplicateOffer';
import type { IngestSingleResult } from './types';

export type DuplicateKindCounts = Partial<Record<DuplicateOfferKind, number>>;

/**
 * Desglosa los duplicados de una corrida. Solo agregación de `results`:
 * no consulta DB, no escribe, no cambia la decisión de insert.
 *
 * Sirve para responder por qué el hunter reencuentra lo mismo:
 * `live` = la oferta está publicada y vigente (reencuentro esperado);
 * `pending_stale` = la cola de moderación no drena (problema operativo, no del hunter).
 */
export function countDuplicateKinds(results: readonly IngestSingleResult[]): DuplicateKindCounts {
  const counts: DuplicateKindCounts = {};
  for (const r of results) {
    if (r.status !== 'duplicate') continue;
    const kind = r.duplicateKind ?? 'unknown';
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

/**
 * Duplicados que venían MÁS BARATOS que la oferta que los bloqueó.
 * Es la medida de supply desperdiciada; no dispara ninguna acción.
 */
export function countSupplyOpportunities(results: readonly IngestSingleResult[]): number {
  let n = 0;
  for (const r of results) {
    if (r.status === 'duplicate' && r.supplyOpportunity) n += 1;
  }
  return n;
}
