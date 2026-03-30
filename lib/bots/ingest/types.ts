export type IngestSourceId = 'env_urls' | 'rss';

export type IngestItem = {
  url: string;
  source: IngestSourceId;
};

export type IngestSingleResult =
  | { url: string; status: 'inserted'; offerId: string }
  | { url: string; status: 'duplicate' }
  | { url: string; status: 'skipped'; reason: string }
  | { url: string; status: 'error'; message: string };

export type IngestCycleReport = {
  ok: boolean;
  enabled: boolean;
  startedAt: string;
  finishedAt: string;
  maxPerRun: number;
  results: IngestSingleResult[];
  summary: {
    inserted: number;
    duplicate: number;
    skipped: number;
    errors: number;
  };
};
