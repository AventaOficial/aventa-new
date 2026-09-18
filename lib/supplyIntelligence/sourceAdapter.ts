/**
 * SourceAdapter contract — S4 Supply Intelligence.
 *
 * Adapters discover listings and emit RawObservation.
 * They never insert offers, never moderate, never distribute.
 *
 * Prefer wrapping existing source shapes (e.g. ExternalWorkerCandidate)
 * over rewriting scrapers.
 */

import type { CaptureMethod } from '@/lib/dealIntelligence';
import type { RawObservation } from '@/lib/dealIntelligence/rawObservation';
import type { SupplySourceId } from '@/lib/hunter/supply/types';

export const SOURCE_ADAPTER_SCHEMA_VERSION = 'source_adapter.v1' as const;

export type SourceAdapterId = SupplySourceId;

export type SourceDiscoverContext = {
  /** Hard cap — S4 samples are small (contract validation, not max data). */
  maxItems: number;
  now?: Date;
  /** Optional run correlation (not part of source-event identity). */
  runId?: string | null;
};

export type SourceDiscoverItemOutcome =
  | {
      status: 'discovered';
      observation: RawObservation;
    }
  | {
      status: 'rejected';
      reason: string;
      /** Partial fields for diagnostics — never an offer row. */
      inputSummary?: Record<string, unknown>;
    };

export type SourceDiscoverResult = {
  sourceId: SourceAdapterId;
  ok: boolean;
  items: SourceDiscoverItemOutcome[];
  errorCode: string | null;
  errorMessageSafe: string | null;
  latencyMs: number;
};

/**
 * Stable adapter surface. Implementations must be side-effect free
 * regarding offers / moderation / distribution.
 */
export type SourceAdapter = {
  readonly id: SourceAdapterId;
  readonly displayName: string;
  readonly schemaVersion: typeof SOURCE_ADAPTER_SCHEMA_VERSION;
  readonly captureMethod: CaptureMethod;
  /** Never true in S4 dry-run adapters. */
  readonly canInsertOffers: false;
  readonly canPublish: false;
  readonly canModifyRewards: false;
  discover(ctx: SourceDiscoverContext): Promise<SourceDiscoverResult>;
};

export type SourceAdapterSafety = {
  distributionEngineEnabled: boolean;
  adapterCanInsertOffers: false;
  dryRunForced: true;
};
