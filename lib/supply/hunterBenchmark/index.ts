/**
 * Hunter Benchmark — S8.1
 *
 * Compares external hunters (ChatGPT, Grok, etc.) against Aventa Supply Intelligence.
 * Evidence is staging-only: never writes production supply tables or offer pending.
 *
 * ## S8 handoff — evaluateOpportunity consumes HunterResult candidates
 *
 * 1. External hunter runs via `HunterSource.collect()` → opaque payload.
 * 2. `normalizeHunterResult()` → `HunterResult` (fail-closed).
 * 3. For each `HunterBenchmarkCandidate`, map with `hunterCandidateToS8Input()`.
 * 4. S8 `evaluateOpportunity(input)` returns `AventaOpportunityEvaluation`.
 * 5. `compareHunterRun({ hunterResult, aventaEvaluations })` produces metrics.
 * 6. `saveBenchmarkRun()` persists JSON under `scripts/_hunter_benchmark_reports/`.
 *
 * S8 must treat hunter candidates as untrusted observations:
 * - Require `currentPriceProvenance` in trusted set for opportunity claims.
 * - Match identity via `candidateIdentityKey` (URL canonical, ASIN, fingerprint).
 * - Never auto-insert offers from benchmark runs.
 */

export * from './types';
export * from './identity';
export {
  normalizeHunterResult,
  hunterCandidateToS8Input,
} from './normalizeHunterResult';
export * from './metrics';
export * from './compareRuns';
export * from './store';
export {
  createChatGptScheduledHunterSource,
  chatGptScheduledSamplePayload,
  CHATGPT_SCHEDULED_HUNTER_ID,
} from './adapters/chatgptScheduled';
export {
  createGrokHunterSource,
  grokSamplePayload,
  GROK_HUNTER_ID,
} from './adapters/grok';
