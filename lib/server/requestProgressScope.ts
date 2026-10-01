/**
 * Day 13.2 — async-scoped request counters provider (OBSERVABILITY ONLY, server only).
 *
 * `fetchWithTimeout` increments the counters of the active async scope, if any.
 * Scopes are async-context bound so work that keeps running after a deadline
 * (e.g. an abandoned hunter source) never pollutes counters of other stages.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  REQUEST_PROGRESS_REGISTRY_KEY,
  type RequestProgressCounters,
} from './requestProgressCounters';

const scope = new AsyncLocalStorage<RequestProgressCounters>();

(globalThis as Record<symbol, unknown>)[REQUEST_PROGRESS_REGISTRY_KEY] = {
  current: () => scope.getStore() ?? null,
};

export function runWithRequestProgress<T>(counters: RequestProgressCounters, fn: () => T): T {
  return scope.run(counters, fn);
}
