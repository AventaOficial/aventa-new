import type { PriceProvenance } from '@/lib/hunter/dealQualification/types';

/** External benchmark hunters — interchangeable, never Aventa infrastructure. */
export type BenchmarkHunterSourceId =
  | 'chatgpt_scheduled'
  | 'grok'
  | 'aventa_supply'
  | (string & {});

export type HunterBenchmarkSchemaVersion = 'hunter_benchmark.v1';

export type HunterPriceQuote = {
  amount: number;
  currency: string;
  provenance: PriceProvenance;
  observedAt: string;
};

export type HunterIdentitySignalKind =
  | 'url'
  | 'canonical_url'
  | 'sku'
  | 'asin'
  | 'external_id'
  | 'fingerprint'
  | 'title';

export type HunterIdentitySignal = {
  kind: HunterIdentitySignalKind;
  value: string;
  confidence: number;
};

export type HunterBenchmarkCandidate = {
  candidateId: string;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  title: string | null;
  currentPrice: HunterPriceQuote | null;
  originalPrice: HunterPriceQuote | null;
  identitySignals: HunterIdentitySignal[];
  discoveredAt: string;
  /** Sanitized diagnostic metadata — never raw HTML. */
  metadata: Record<string, unknown>;
};

export type HunterResult = {
  schemaVersion: HunterBenchmarkSchemaVersion;
  hunterId: string;
  runId: string;
  sourceId: BenchmarkHunterSourceId;
  collectedAt: string;
  completedAt: string;
  ok: boolean;
  candidates: HunterBenchmarkCandidate[];
  errorCode: string | null;
  errorMessageSafe: string | null;
};

export type HunterCollectContext = {
  runId: string;
  maxCandidates: number;
  now?: Date;
};

/**
 * External hunter adapter. Returns an opaque payload normalized by
 * `normalizeHunterResult` — Aventa never depends on the hunter's LLM/runtime.
 */
export type HunterSource = {
  id: BenchmarkHunterSourceId;
  displayName: string;
  kind: 'external_llm' | 'external_api' | 'aventa_native';
  collect: (ctx: HunterCollectContext) => Promise<unknown>;
};

/** Ground-truth evaluation from Aventa Supply Intelligence (S8). */
export type AventaOpportunityEvaluation = {
  evaluationId: string;
  candidateKey: string;
  sourceUrl: string | null;
  title: string | null;
  isOpportunity: boolean;
  verified: boolean;
  currentPrice: number | null;
  originalPrice: number | null;
  currency: string | null;
  evaluatedAt: string;
  reasonCodes: string[];
};

export type HunterBenchmarkMetrics = {
  candidatesFound: number;
  verifiedOpportunities: number;
  falsePositives: number;
  duplicates: number;
  priceAccuracy: number | null;
  detectionLatencyMs: number | null;
  precision: number | null;
  truePositives: number;
  falseNegatives: number;
};

export type BenchmarkComparison = {
  hunterId: string;
  runId: string;
  sourceId: BenchmarkHunterSourceId;
  comparedAt: string;
  metrics: HunterBenchmarkMetrics;
  matchedCandidates: number;
  unmatchedCandidates: number;
};

export type BenchmarkRunRecord = {
  schemaVersion: HunterBenchmarkSchemaVersion;
  runId: string;
  sourceId: BenchmarkHunterSourceId;
  hunterId: string;
  savedAt: string;
  result: HunterResult;
  comparison: BenchmarkComparison | null;
};

export type NormalizeHunterResultInput = {
  hunterId: string;
  runId: string;
  sourceId: BenchmarkHunterSourceId;
  collectedAt: string;
  completedAt: string;
  payload: unknown;
};

export type NormalizeHunterResultOutcome =
  | { ok: true; result: HunterResult }
  | { ok: false; errors: string[] };
