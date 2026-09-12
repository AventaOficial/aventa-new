import type { DiscoveryBudget } from './types';

/** Presupuesto conservador de evaluación. No crawl masivo. Concurrency 1. */
export const RETAILER_DISCOVERY_BUDGET: DiscoveryBudget = {
  maxRequests: 8,
  maxPages: 1,
  maxCandidates: 10,
  maxConcurrency: 1,
  timeoutMs: 12_000,
  crawlDelayMs: 0,
  maxPilotCandidates: 10,
  maxSitemaps: 3,
};

export function mergeDiscoveryBudget(over?: Partial<DiscoveryBudget>): DiscoveryBudget {
  return { ...RETAILER_DISCOVERY_BUDGET, ...over, maxConcurrency: 1 };
}

export function crawlWaitMs(lastFetchAt: number, delayMs: number, now: number): number {
  if (delayMs <= 0 || lastFetchAt <= 0) return 0;
  return Math.max(0, Math.min(delayMs - (now - lastFetchAt), 15_000));
}
