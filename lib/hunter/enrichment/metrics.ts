export type HunterEnrichmentMetricsSnapshot = {
  candidatesFound: number;
  enriched: number;
  skippedNetwork: number;
  imageFound: number;
  imageMissing: number;
  titleFound: number;
  priceFound: number;
  enrichmentFailed: number;
  fullyComplete: number;
  completePct: number;
  fullyCompletePct: number;
  bySource: Record<
    string,
    {
      candidatesFound: number;
      enriched: number;
      imageFound: number;
      imageMissing: number;
      skippedNetwork: number;
      enrichmentFailed: number;
    }
  >;
  persistence: 'process_memory';
};

const emptySource = () => ({
  candidatesFound: 0,
  enriched: 0,
  imageFound: 0,
  imageMissing: 0,
  skippedNetwork: 0,
  enrichmentFailed: 0,
});

const totals = {
  candidatesFound: 0,
  enriched: 0,
  skippedNetwork: 0,
  imageFound: 0,
  imageMissing: 0,
  titleFound: 0,
  priceFound: 0,
  enrichmentFailed: 0,
  fullyComplete: 0,
};

const bySource = new Map<string, ReturnType<typeof emptySource>>();

function bucket(source: string) {
  const key = source.trim() || 'unknown';
  let row = bySource.get(key);
  if (!row) {
    row = emptySource();
    bySource.set(key, row);
  }
  return row;
}

/** Ingest source → hunter source id (misma convención que Autonomous Engine). */
export function enrichmentSourceLabel(source: string, sourceDetail?: string | null): string {
  const s = source.trim() || 'unknown';
  if (s === 'ml_api') return 'ml_api_legacy';
  if (s === 'amazon_paapi' || /paapi/i.test(sourceDetail ?? '')) return 'amazon_paapi';
  return s;
}

export type EnrichmentMetricEvent = {
  source: string;
  changed: boolean;
  skippedNetwork: boolean;
  imageFound: boolean;
  titleFound: boolean;
  priceFound: boolean;
  failed: boolean;
  fullyComplete: boolean;
};

export function recordHunterEnrichment(event: EnrichmentMetricEvent) {
  totals.candidatesFound += 1;
  const row = bucket(event.source);
  row.candidatesFound += 1;
  if (event.changed) {
    totals.enriched += 1;
    row.enriched += 1;
  }
  if (event.skippedNetwork) {
    totals.skippedNetwork += 1;
    row.skippedNetwork += 1;
  }
  if (event.imageFound) {
    totals.imageFound += 1;
    row.imageFound += 1;
  } else {
    totals.imageMissing += 1;
    row.imageMissing += 1;
  }
  if (event.titleFound) totals.titleFound += 1;
  if (event.priceFound) totals.priceFound += 1;
  if (event.failed) {
    totals.enrichmentFailed += 1;
    row.enrichmentFailed += 1;
  }
  if (event.fullyComplete) totals.fullyComplete += 1;
}

export function getHunterEnrichmentMetrics(): HunterEnrichmentMetricsSnapshot {
  const completePct =
    totals.candidatesFound > 0
      ? Math.round((totals.imageFound / totals.candidatesFound) * 1000) / 10
      : 0;
  const fullyCompletePct =
    totals.candidatesFound > 0
      ? Math.round((totals.fullyComplete / totals.candidatesFound) * 1000) / 10
      : 0;
  return {
    ...totals,
    completePct,
    fullyCompletePct,
    bySource: Object.fromEntries(bySource.entries()),
    persistence: 'process_memory',
  };
}

export function resetHunterEnrichmentMetrics() {
  totals.candidatesFound = 0;
  totals.enriched = 0;
  totals.skippedNetwork = 0;
  totals.imageFound = 0;
  totals.imageMissing = 0;
  totals.titleFound = 0;
  totals.priceFound = 0;
  totals.enrichmentFailed = 0;
  totals.fullyComplete = 0;
  bySource.clear();
}
