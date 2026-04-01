import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

export type IngestSourceId = 'env_urls' | 'rss' | 'ml_api' | 'amazon_asin';

export type IngestItem = {
  url: string;
  source: IngestSourceId;
  /** Metadatos ya resueltos (p. ej. API de Mercado Libre); evita fetch HTML. */
  precomputedMeta?: ParsedOfferMetadata;
};

export type IngestSingleResult =
  | { url: string; status: 'inserted'; offerId: string }
  | { url: string; status: 'duplicate' }
  | { url: string; status: 'skipped'; reason: string }
  | { url: string; status: 'error'; message: string };

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
  };
};
