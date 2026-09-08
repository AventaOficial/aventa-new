/**
 * Universos de métricas Hunter. No son intercambiables.
 *
 * No incrementar un contador para “cuadrar” el panel: cada nombre mide un paso distinto
 * y una persistencia distinta.
 */
export const HUNTER_METRIC_UNIVERSES = {
  sourceHealth: {
    persistence: 'supabase_hunter_source_health',
    itemsFound: 'Payload crudo del último batch (ml_worker: candidates.length). Antes de quality gates.',
    itemsInserted: 'Inserts OK de insertIngestedOffer en ese batch.',
    duplicates: 'Duplicados en insert (DB), no el duplicate shadow ni el dedupe intra-lote.',
    skipped: 'Saltados en results[] (quality / verifier reject / payload inválido).',
  },
  hunterEnrichment: {
    persistence: 'process_memory',
    candidatesFound: 'Llamadas a enrichParsedOfferMetadata en ESTE isolate. Tras toParsedMeta; antes de quality gates posteriores.',
  },
  dealVerifier: {
    persistence: 'process_memory',
    evaluated: 'evaluateDealSafe en ESTE isolate. Tras quality gates (precio original, descuento, título).',
  },
  autonomousShadow: {
    persistence: 'process_memory',
    evaluated:
      'observeIngestShadow tras evaluateDealSafe en ESTE isolate. No incluye payload inválido, dedupe intra-lote, ni skips de quality gates anteriores al verifier.',
  },
  autonomousShadowCycle: {
    persistence: 'supabase_hunter_shadow_cycles',
    evaluated:
      'Mismo universo que autonomousShadow, pero con alcance de UN ciclo y escrito al cerrarlo. Es lo único que el panel admin puede leer del isolate del worker. No es realtime.',
  },
} as const;

export type HunterMetricUniverses = typeof HUNTER_METRIC_UNIVERSES;
