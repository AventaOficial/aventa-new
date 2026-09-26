/**
 * Day 13.2 — HTTP request counters (OBSERVABILITY ONLY). Runtime-neutral: no Node
 * imports, so modules shared with client bundles (e.g. fetchWithTimeout) stay safe.
 * The async-scoped provider lives in `requestProgressScope.ts` (server only).
 */

export type RequestProgressCounters = {
  requests_started: number;
  requests_completed: number;
  requests_http_error: number;
  requests_failed: number;
  /** Includes aborts (timeout or caller signal), per `isTimeoutAbortError`. */
  requests_timed_out: number;
};

export function emptyRequestProgressCounters(): RequestProgressCounters {
  return {
    requests_started: 0,
    requests_completed: 0,
    requests_http_error: 0,
    requests_failed: 0,
    requests_timed_out: 0,
  };
}

export const REQUEST_PROGRESS_REGISTRY_KEY = Symbol.for('aventa.requestProgress.v1');

type Registry = { current: () => RequestProgressCounters | null };

/** Counters of the active scope; null when no server scope provider is loaded. */
export function currentRequestProgress(): RequestProgressCounters | null {
  const registry = (globalThis as Record<symbol, unknown>)[REQUEST_PROGRESS_REGISTRY_KEY] as
    | Registry
    | undefined;
  if (!registry) return null;
  try {
    return registry.current();
  } catch {
    return null;
  }
}
