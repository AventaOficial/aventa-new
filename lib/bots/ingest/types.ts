import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

export type IngestSourceId = 'env_urls' | 'rss' | 'ml_api' | 'amazon_asin';
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

export type IngestItem = {
  url: string;
  source: IngestSourceId;
  /** Metadatos ya resueltos (p. ej. API de Mercado Libre); evita fetch HTML. */
  precomputedMeta?: ParsedOfferMetadata;
  sourceDetail?: string | null;
};

export type IngestSingleResult =
  | { url: string; source?: IngestSourceId; status: 'inserted'; offerId: string }
  | { url: string; source?: IngestSourceId; status: 'duplicate' }
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
