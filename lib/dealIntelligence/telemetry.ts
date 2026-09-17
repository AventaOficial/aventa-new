/**
 * Process-local DI read telemetry — no PII, no full URLs, no secrets.
 */

export type DealIntelligenceReadTelemetry = {
  observations_read: number;
  observations_valid: number;
  observations_invalid: number;
  identity_exact: number;
  identity_probable: number;
  identity_unknown: number;
  stale_observations: number;
  currency_unknown: number;
  variant_unknown: number;
  reader_errors: number;
  read_latency_ms_sum: number;
  read_latency_samples: number;
  source_distribution: Record<string, number>;
  invalid_reasons: Record<string, number>;
};

function empty(): DealIntelligenceReadTelemetry {
  return {
    observations_read: 0,
    observations_valid: 0,
    observations_invalid: 0,
    identity_exact: 0,
    identity_probable: 0,
    identity_unknown: 0,
    stale_observations: 0,
    currency_unknown: 0,
    variant_unknown: 0,
    reader_errors: 0,
    read_latency_ms_sum: 0,
    read_latency_samples: 0,
    source_distribution: {},
    invalid_reasons: {},
  };
}

let state = empty();

export function resetDealIntelligenceTelemetry(): void {
  state = empty();
}

export function getDealIntelligenceTelemetry(): DealIntelligenceReadTelemetry {
  return {
    ...state,
    source_distribution: { ...state.source_distribution },
    invalid_reasons: { ...state.invalid_reasons },
  };
}

export function recordReadLatency(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  state.read_latency_ms_sum += ms;
  state.read_latency_samples += 1;
}

export function recordReaderError(): void {
  state.reader_errors += 1;
}

export function recordMappedObservation(input: {
  ok: boolean;
  reason?: string | null;
  sourceId?: string | null;
  identityStatus?: 'exact' | 'probable' | 'unknown' | null;
  stale?: boolean;
  variantUnknown?: boolean;
}): void {
  state.observations_read += 1;
  if (input.ok) {
    state.observations_valid += 1;
    const src = input.sourceId ?? 'unknown';
    state.source_distribution[src] = (state.source_distribution[src] ?? 0) + 1;
    if (input.identityStatus === 'exact') state.identity_exact += 1;
    else if (input.identityStatus === 'probable') state.identity_probable += 1;
    else state.identity_unknown += 1;
    if (input.stale) state.stale_observations += 1;
    if (input.variantUnknown) state.variant_unknown += 1;
  } else {
    state.observations_invalid += 1;
    const reason = input.reason ?? 'unknown';
    state.invalid_reasons[reason] = (state.invalid_reasons[reason] ?? 0) + 1;
    if (reason === 'currency_unknown') state.currency_unknown += 1;
  }
}

export function medianLatencyMsFromTelemetry(
  t: DealIntelligenceReadTelemetry = state,
): number | null {
  if (t.read_latency_samples <= 0) return null;
  return Math.round(t.read_latency_ms_sum / t.read_latency_samples);
}

/** Redact URL-like strings from telemetry payloads (defense in depth). */
export function redactTelemetryValue(raw: string): string {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return `${u.hostname}/…`;
    } catch {
      return '[redacted_url]';
    }
  }
  if (s.includes('@')) return '[redacted]';
  if (s.length > 64) return `${s.slice(0, 24)}…`;
  return s;
}

export function assertTelemetryHasNoPii(
  t: DealIntelligenceReadTelemetry,
): { ok: boolean; offenders: string[] } {
  const offenders: string[] = [];
  const scan = (label: string, v: string) => {
    if (/https?:\/\//i.test(v) || v.includes('@') || /bearer|api[_-]?key|secret/i.test(v)) {
      offenders.push(label);
    }
  };
  for (const [k, n] of Object.entries(t.source_distribution)) {
    scan(`source:${k}`, k);
    void n;
  }
  for (const [k] of Object.entries(t.invalid_reasons)) {
    scan(`reason:${k}`, k);
  }
  return { ok: offenders.length === 0, offenders };
}
