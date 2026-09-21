/**
 * Source coverage for Mission Control — distinguishes NOT_CONFIGURED / DISABLED / NO_DATA / ERROR / HEALTHY.
 */

export type SourceCoverageStatus =
  | 'NOT_CONFIGURED'
  | 'DISABLED'
  | 'NO_DATA'
  | 'ERROR'
  | 'HEALTHY';

export type SourceCoverageRow = {
  source: string;
  configured: boolean;
  enabled: boolean;
  status: SourceCoverageStatus;
  healthy: boolean;
  events: number;
  unique_urls: number;
  unique_identities: number;
  repeat_rate: number | null;
  would_insert: number;
  error_rate: number | null;
  rate_403: number | null;
  fallback_rate: number | null;
  last_success: string | null;
  note: string;
};

export type SourceCoverageInput = {
  source: string;
  configured: boolean;
  enabled: boolean;
  events: number;
  unique_urls: number;
  unique_identities: number;
  would_insert: number;
  errors?: number;
  http403?: number;
  fallbacks?: number;
  last_success?: string | null;
};

export function classifySourceCoverage(input: SourceCoverageInput): SourceCoverageRow {
  const events = input.events;
  const errors = input.errors ?? 0;
  const http403 = input.http403 ?? 0;
  const fallbacks = input.fallbacks ?? 0;
  const denom = Math.max(events + errors, 1);
  const error_rate = events + errors > 0 ? errors / denom : null;
  const rate_403 = events + http403 > 0 ? http403 / Math.max(events + http403, 1) : null;
  const fallback_rate = events > 0 ? fallbacks / events : null;
  const repeat_rate =
    events > 0 && input.unique_identities >= 0
      ? 1 - input.unique_identities / Math.max(events, 1)
      : null;

  let status: SourceCoverageStatus;
  let note: string;
  if (!input.configured) {
    status = 'NOT_CONFIGURED';
    note = 'Source not configured in this environment.';
  } else if (!input.enabled) {
    status = 'DISABLED';
    note = 'Source configured but disabled.';
  } else if (events === 0 && errors > 0) {
    status = 'ERROR';
    note = 'Enabled but only errors in window.';
  } else if (events === 0) {
    status = 'NO_DATA';
    note = 'Enabled but zero events in window — not the same as missing.';
  } else if ((error_rate ?? 0) >= 0.5 || (rate_403 ?? 0) >= 0.5) {
    status = 'ERROR';
    note = 'High error/403 rate in window.';
  } else {
    status = 'HEALTHY';
    note = 'Source produced events with acceptable error rate.';
  }

  return {
    source: input.source,
    configured: input.configured,
    enabled: input.enabled,
    status,
    healthy: status === 'HEALTHY',
    events,
    unique_urls: input.unique_urls,
    unique_identities: input.unique_identities,
    repeat_rate,
    would_insert: input.would_insert,
    error_rate,
    rate_403,
    fallback_rate,
    last_success: input.last_success ?? null,
    note,
  };
}

/** Known Hunter ingest sources for coverage matrix. */
export const KNOWN_HUNTER_SOURCES = [
  'ml_api',
  'ml_worker',
  'amazon_asin',
  'amazon_paapi',
  'rss',
  'community',
  'day_to_day',
] as const;

export function buildSourceCoverageMatrix(input: {
  rowsBySource: Record<
    string,
    {
      events: number;
      unique_urls: number;
      unique_identities: number;
      would_insert: number;
      errors?: number;
      http403?: number;
      fallbacks?: number;
      last_success?: string | null;
    }
  >;
  configuredSources: ReadonlySet<string> | readonly string[];
  enabledSources: ReadonlySet<string> | readonly string[];
}): SourceCoverageRow[] {
  const configured = input.configuredSources instanceof Set
    ? input.configuredSources
    : new Set(input.configuredSources);
  const enabled = input.enabledSources instanceof Set
    ? input.enabledSources
    : new Set(input.enabledSources);
  const all = new Set<string>([
    ...KNOWN_HUNTER_SOURCES,
    ...Object.keys(input.rowsBySource),
    ...configured,
    ...enabled,
  ]);
  return [...all]
    .sort()
    .map((source) => {
      const row = input.rowsBySource[source];
      return classifySourceCoverage({
        source,
        configured: configured.has(source),
        enabled: enabled.has(source),
        events: row?.events ?? 0,
        unique_urls: row?.unique_urls ?? 0,
        unique_identities: row?.unique_identities ?? 0,
        would_insert: row?.would_insert ?? 0,
        errors: row?.errors,
        http403: row?.http403,
        fallbacks: row?.fallbacks,
        last_success: row?.last_success,
      });
    });
}
