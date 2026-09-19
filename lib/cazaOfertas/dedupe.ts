/**
 * CazaOfertasss — FASE 0. Deduplicación.
 *
 * Autoridad: esta capa decide si una detección CREA o ACTUALIZA un candidato.
 * No reescribe precios ni recalcula score: recibe el candidato ya construido.
 *
 * Invariante central: una oferta puede cambiar de precio, descuento, score o URL
 * afiliado sin convertirse en una oferta nueva.
 */

import type { DealCandidate } from './types';

export type DealUpsertAction = 'created' | 'updated' | 'unchanged';

export interface DealUpsertOutcome {
  readonly action: DealUpsertAction;
  readonly candidate: DealCandidate;
  /** Campos materialmente cambiados. Vacío ⇔ `unchanged`. */
  readonly changedFields: readonly string[];
}

/**
 * Campos cuyo cambio constituye una actualización observable. El título NO
 * está aquí: un retitulado de la tienda no es un evento comercial.
 */
const MATERIAL_FIELDS = [
  'currentPrice',
  'referencePrice',
  'discountPercent',
  'availability',
  'affiliateUrl',
  'status',
  'currency',
] as const;

function diffMaterialFields(existing: DealCandidate, incoming: DealCandidate): string[] {
  const changed: string[] = [];
  for (const field of MATERIAL_FIELDS) {
    if (existing[field] !== incoming[field]) changed.push(field);
  }
  if (existing.score.score !== incoming.score.score) changed.push('score');
  if (existing.score.grade !== incoming.score.grade) changed.push('grade');
  if (existing.evidence.capturedAt !== incoming.evidence.capturedAt) {
    changed.push('evidence.capturedAt');
  }
  if (existing.seller.trustClass !== incoming.seller.trustClass) changed.push('seller.trustClass');
  return changed;
}

/**
 * Fusiona una detección nueva sobre un candidato existente.
 *
 * Preserva la identidad: `id`, `identity` y `firstSeenAt` del existente ganan
 * siempre. `revision` sólo avanza cuando hay cambio material.
 */
export function mergeDealCandidate(
  existing: DealCandidate | null,
  incoming: DealCandidate
): DealUpsertOutcome {
  if (existing === null) {
    return { action: 'created', candidate: incoming, changedFields: [] };
  }

  if (existing.identity.key !== incoming.identity.key) {
    // Defensa: el llamador buscó por la clave equivocada. Nunca fusionar
    // productos distintos.
    return { action: 'created', candidate: incoming, changedFields: [] };
  }

  const changedFields = diffMaterialFields(existing, incoming);

  if (changedFields.length === 0) {
    return {
      action: 'unchanged',
      candidate: {
        ...existing,
        // La detección repetida sólo refresca el reloj de observación.
        updatedAt: incoming.updatedAt,
        detectedAt: incoming.detectedAt,
      },
      changedFields: [],
    };
  }

  return {
    action: 'updated',
    candidate: {
      ...incoming,
      id: existing.id,
      identity: existing.identity,
      firstSeenAt: existing.firstSeenAt,
      revision: existing.revision + 1,
    },
    changedFields,
  };
}

/**
 * Repositorio de candidatos. Interfaz deliberadamente puntual (get por clave)
 * para que la sustitución InMemory → PostgreSQL no requiera scans globales.
 *
 * Preferir `upsertAtomic` bajo concurrencia: el path find→merge→save no es
 * seguro ante escritores paralelos sobre la misma `identity_key`.
 */
export interface DealCandidateRepository {
  findByIdentityKey(identityKey: string): Promise<DealCandidate | null>;
  save(candidate: DealCandidate): Promise<void>;
  /**
   * Upsert atómico. PostgreSQL incrementa `revision` en el motor;
   * InMemory emula la misma semántica bajo un mutex por clave.
   */
  upsertAtomic(incoming: DealCandidate): Promise<DealUpsertOutcome>;
  /** Paginado obligatorio: no existe "traer todo". */
  listByStatus(
    status: DealCandidate['status'],
    limit: number,
    cursor?: string | null
  ): Promise<{ items: readonly DealCandidate[]; nextCursor: string | null }>;
}

/**
 * Punto de entrada canónico. Delega en `upsertAtomic` del repositorio para
 * que InMemory y Postgres compartan el mismo contrato de concurrencia.
 */
export async function upsertDealCandidate(
  repository: DealCandidateRepository,
  incoming: DealCandidate
): Promise<DealUpsertOutcome> {
  return repository.upsertAtomic(incoming);
}
