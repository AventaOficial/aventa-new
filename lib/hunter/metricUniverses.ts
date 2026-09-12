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
  dayToDaySupply: {
    persistence: 'catalog_plus_hunter_source_health',
    note: 'Universo separado. No mezclar con autonomousPct ni autoApprovePct.',
    candidates: 'Suma de items_found de fuentes family=day_to_day. Cero si not_configured.',
    inserted: 'Suma de items_inserted de esas fuentes. No es shadow.',
  },
  mercadoLibreQuality: {
    persistence: 'process_memory',
    note: 'Parse-offer-url y enrichment ML en ESTE isolate. No mezclar con shadow ni day-to-day.',
    urlsResolved: 'URLs ML con item_id resuelto (query, hash o pdp_filters).',
    imagesApi: 'Fotos tomadas de API oficial del item consultado.',
  },
  autonomousShadowCycle: {
    persistence: 'supabase_hunter_shadow_cycles',
    evaluated:
      'Mismo universo que autonomousShadow, pero con alcance de UN ciclo y escrito al cerrarlo. Es lo único que el panel admin puede leer del isolate del worker. No es realtime.',
  },
  autonomousCalibration: {
    persistence: 'supabase_hunter_shadow_outcomes',
    note: 'FASE 11. Correlación shadow decision ↔ human outcome por offer_id. No mezclar con hunter_shadow_cycles ni offers.status. UNKNOWN si la identidad no es fiable.',
    shadowEvaluated: 'Filas persistidas tras insert con decisión Autonomous. No incluye candidatos nunca insertados.',
    shadowMatched: 'HUMAN_APPROVED + HUMAN_REJECTED desde moderation_logs / acciones staff. No bot-approved.',
    autoApprovePrecision: 'HUMAN_APPROVED / (HUMAN_APPROVED + HUMAN_REJECTED) entre AUTO_APPROVE. UNKNOWN no cuenta.',
    collection:
      'FASE 11.1 volumen de recolección. matchRate = matched / offersWithShadow. Awaiting = HUMAN_PENDING, no reject. Expire automático = UNKNOWN + system_lifecycle, no HUMAN_EXPIRED.',
  },
} as const;

export type HunterMetricUniverses = typeof HUNTER_METRIC_UNIVERSES;
