import type { GlobalSupplyStatus, SupplyFamily } from './types';

export const SUPPLY_RUN_TABLE = 'hunter_supply_runs';
export const SUPPLY_TRUTH_SCHEMA_VERSION = 1;

export const SUPPLY_LANES = ['community', 'machine'] as const;
export type SupplyLane = (typeof SUPPLY_LANES)[number];

export const SUPPLY_RUN_STATUSES = ['ok', 'degraded', 'failed', 'skipped', 'zero'] as const;
export type SupplyRunStatus = (typeof SUPPLY_RUN_STATUSES)[number];

export const SUPPLY_TRUTH_WINDOWS = ['today', 'h24', 'd7', 'd30'] as const;
export type SupplyTruthWindowId = (typeof SUPPLY_TRUTH_WINDOWS)[number];

export const SUPPLY_FAMILIES: SupplyFamily[] = [
  'community',
  'retailer_public',
  'official_api',
  'affiliate_feed',
  'external_worker',
  'partner',
  'core',
];

export type SupplyRunInput = {
  runId?: string | null;
  sourceId: string;
  sourceFamily: SupplyFamily | string;
  startedAt: string;
  finishedAt: string;
  status?: SupplyRunStatus | string | null;
  candidatesDiscovered?: number | null;
  candidatesQualified?: number | null;
  verifiedDeals?: number | null;
  promotions?: number | null;
  potentialDeals?: number | null;
  catalogOnly?: number | null;
  duplicates?: number | null;
  rejected?: number | null;
  pending?: number | null;
  errors?: number | null;
  durationMs?: number | null;
  shadowCycleId?: string | null;
};

export type SupplyRunRow = {
  run_id: string;
  source_id: string;
  source_family: string;
  source_lane: SupplyLane;
  started_at: string;
  finished_at: string;
  status: SupplyRunStatus;
  candidates_discovered: number;
  candidates_qualified: number;
  verified_deals: number;
  promotions: number;
  potential_deals: number;
  catalog_only: number;
  duplicates: number;
  rejected: number;
  pending: number;
  errors: number;
  duration_ms: number;
  shadow_cycle_id: string | null;
};

export type RecordSupplyRunOutcome =
  | { persisted: true; runId: string; sourceId: string; duplicate: boolean }
  | {
      persisted: false;
      reason: 'invalid' | 'no_client' | 'table_missing' | 'error' | 'test_skip';
    };

export type SupplyAggregateRow = {
  sourceId: string;
  family: string;
  lane: SupplyLane;
  runs: number;
  candidates: number;
  qualified: number;
  verifiedDeals: number;
  promotions: number;
  potentialDeals: number;
  catalogOnly: number;
  duplicates: number;
  rejected: number;
  pending: number;
  errors: number;
  contributionPct: number;
};

export type SupplyTruthWindow = {
  id: SupplyTruthWindowId;
  since: string;
  runs: number;
  candidates: number;
  verifiedDeals: number;
  promotions: number;
  potentialDeals: number;
  catalogOnly: number;
  duplicates: number;
  rejected: number;
  pending: number;
  errors: number;
  communityVerified: number;
  machineVerified: number;
  communityPct: number;
  machinePct: number;
  contribution: SupplyAggregateRow[];
};

export type SupplyTruthAlertConditions = {
  noVerifiedDealsForHours: boolean;
  allMachineSourcesDown: boolean;
  communitySupplyCollapse: boolean;
  sourceZeroUnexpected: string[];
  duplicateRateSpike: boolean;
};

export type SupplySourceQualityRow = {
  sourceId: string;
  family: string;
  hunterStatus: string | null;
  producingCandidates: boolean;
  producingVerified: boolean;
};

export type SupplyTruthSnapshot = {
  globalStatus: GlobalSupplyStatus;
  recommendedAction: string;
  lastFinishedAt: string | null;
  lastOkAt: string | null;
  lastSourceId: string | null;
  lastRunId: string | null;
  stale: boolean;
  hoursSinceLastActivity: number | null;
  expectedIntervalMinutes: number;
  windows: Record<SupplyTruthWindowId, SupplyTruthWindow>;
  sourceQuality: SupplySourceQualityRow[];
  alerts: SupplyTruthAlertConditions;
};
