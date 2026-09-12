import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { DuplicateOfferKind } from '@/lib/offers/findDuplicateOffer';
import type { DealQualificationResult } from '@/lib/hunter/dealQualification/types';

export type IngestSourceId =
  | 'env_urls'
  | 'rss'
  | 'ml_api'
  | 'amazon_asin'
  | 'ml_worker'
  | 'walmart_mx'
  | 'bodega_aurrera_mx'
  | 'chedraui_mx';

export type IngestProfileId = 'standard' | 'mega';

export type IngestSourceStats = {
  collected: number;
  evaluated: number;
  inserted: number;
  duplicate: number;
  skipped: number;
  errors: number;
  skipReasonCounts?: Record<string, number>;
};

const ZERO_STATS = (): IngestSourceStats => ({
  collected: 0,
  evaluated: 0,
  inserted: 0,
  duplicate: 0,
  skipped: 0,
  errors: 0,
});

/** Conteos por fuente en cero. Una clave nueva aquí evita olvidarla en dos sitios. */
export function emptyIngestSourceStats(): Record<IngestSourceId, IngestSourceStats> {
  return {
    env_urls: ZERO_STATS(),
    rss: ZERO_STATS(),
    ml_api: ZERO_STATS(),
    amazon_asin: ZERO_STATS(),
    ml_worker: ZERO_STATS(),
    walmart_mx: ZERO_STATS(),
    bodega_aurrera_mx: ZERO_STATS(),
    chedraui_mx: ZERO_STATS(),
  };
}

/** Resultado de UNA superficie de descubrimiento del worker externo. */
export type WorkerSeedStat = {
  id: string;
  /** `zero_results` NO es un fallo: la superficie respondió y no traía ofertas. */
  status: 'ok' | 'zero_results' | 'failed';
  rawLinks: number;
  accepted: number;
};

/**
 * Diversidad de supply de un ciclo del worker. Universo de DESCUBRIMIENTO:
 * anterior a normalización, dedupe y verifier. No se mezcla con `stageCounts`.
 */
export type WorkerDiscoveryStats = {
  cycleIndex: number;
  seedsAvailable: number;
  seedsAttempted: number;
  seedsSuccessful: number;
  seedsZeroResults: number;
  seedsFailed: number;
  bySeed: WorkerSeedStat[];
};

export type IngestItem = {
  url: string;
  source: IngestSourceId;
  /** Metadatos ya resueltos (p. ej. API de Mercado Libre); evita fetch HTML. */
  precomputedMeta?: ParsedOfferMetadata;
  sourceDetail?: string | null;
  /** Evidencia de oferta (Day-to-Day). No sustituye al Deal Verifier. */
  qualification?: DealQualificationResult;
};

export type IngestSingleResult =
  | { url: string; source?: IngestSourceId; status: 'inserted'; offerId: string }
  | {
      url: string;
      source?: IngestSourceId;
      status: 'duplicate';
      duplicateKind?: DuplicateOfferKind;
      supplyOpportunity?: boolean;
    }
  | { url: string; source?: IngestSourceId; status: 'skipped'; reason: string }
  | { url: string; source?: IngestSourceId; status: 'error'; message: string };

export type IngestRunMode =
  | 'normal'
  | 'boost'
  | 'morning_sustained'
  | 'daily_cap'
  | 'skipped'
  | 'off'
  | 'error';

export type IngestCycleReport = {
  ok: boolean;
  enabled: boolean;
  pausedByOwner?: boolean;
  envIngestEnabled?: boolean;
  profile: IngestProfileId;
  startedAt: string;
  finishedAt: string;
  /** Objetivo de inserciones exitosas en esta corrida (acotado por tope diario). */
  maxPerRun: number;
  runMode: IngestRunMode;
  /** Ofertas del bot hoy (local) tras esta corrida — aproximado (lectura al inicio + insertadas). */
  dailyInsertedApprox: number | null;
  dailyCap: number;
  rotationWave: number | null;
  results: IngestSingleResult[];
  summary: {
    inserted: number;
    duplicate: number;
    skipped: number;
    errors: number;
    rejected: number;
    autoApproved: number;
    /** Conteos por `reason` cuando status === skipped (diagnóstico en panel / logs). */
    skipReasonCounts?: Record<string, number>;
    /** Duplicados desglosados: `pending_stale` alto = cola sin drenar, no hunter roto. */
    duplicateKindCounts?: Partial<Record<DuplicateOfferKind, number>>;
    /** Duplicados que venían más baratos que la oferta viva. Métrica, no acción. */
    supplyOpportunities?: number;
    /** Superficies visitadas por el worker externo. Solo en el camino ml_worker. */
    discovery?: WorkerDiscoveryStats;
    /** Telemetría por fuente para ver salud y rendimiento del bot. */
    sourceStats?: Partial<Record<IngestSourceId, IngestSourceStats>>;
    /** Conteos de etapas principales dentro de la corrida. */
    stageCounts?: {
      collected: number;
      evaluated: number;
      resolved: number;
      insertedAttempted: number;
    };
  };
};
