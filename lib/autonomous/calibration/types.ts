import type { AutonomousDecision } from '../types';
import type { ShadowReasonCode } from '../reasonCodes';

export const SHADOW_OUTCOME_TABLE = 'hunter_shadow_outcomes';
export const SHADOW_CALIBRATION_SCHEMA_VERSION = 2;

export const HUMAN_OUTCOMES = [
  'HUMAN_APPROVED',
  'HUMAN_REJECTED',
  'HUMAN_SNOOZED',
  'HUMAN_PENDING',
  'HUMAN_EXPIRED',
  'UNKNOWN',
] as const;

export type HumanOutcome = (typeof HUMAN_OUTCOMES)[number];

export const MATCH_CONFIDENCES = [
  'offer_id',
  'fingerprint_unique',
  'ambiguous',
  'unmatched',
] as const;

export type MatchConfidence = (typeof MATCH_CONFIDENCES)[number];

export const HUMAN_ACTOR_KINDS = [
  'human_moderator',
  'system_lifecycle',
  'legacy_auto',
  'unknown',
] as const;

export type HumanActorKind = (typeof HUMAN_ACTOR_KINDS)[number];

export const CALIBRATION_SAMPLE_THRESHOLDS = {
  insufficientBelow: 20,
  earlyBelow: 50,
  moderateBelow: 100,
} as const;

export type SufficiencyLevel = 'insufficient' | 'early' | 'moderate' | 'usable';

export const SCORE_BUCKETS = ['0-39', '40-54', '55-69', '70-77', '78-84', '85+', 'unknown'] as const;
export type ScoreBucket = (typeof SCORE_BUCKETS)[number];

export const CONFIDENCE_BUCKETS = ['0-0.49', '0.50-0.69', '0.70-0.84', '0.85+', 'unknown'] as const;
export type ConfidenceBucket = (typeof CONFIDENCE_BUCKETS)[number];

export const DISAGREEMENT_PAIRS = [
  'AUTO_APPROVE+HUMAN_REJECT',
  'AUTO_REJECT+HUMAN_APPROVE',
  'HUMAN_REVIEW+HUMAN_APPROVE',
  'HUMAN_REVIEW+HUMAN_REJECT',
] as const;

export type DisagreementPair = (typeof DISAGREEMENT_PAIRS)[number];

export type ShadowOutcomeRow = {
  offer_id: string;
  fingerprint: string | null;
  shadow_cycle_id: string | null;
  shadow_decision: AutonomousDecision;
  human_outcome: HumanOutcome;
  match_confidence: MatchConfidence;
  matched_at: string | null;
  human_action_at: string | null;
  human_actor_kind: HumanActorKind | null;
  source_id: string;
  source_family: string;
  score: number | null;
  confidence: number | null;
  qualification: string | null;
  reason_codes: ShadowReasonCode[];
  duplicate_status: string | null;
  seller_status: string | null;
  image_status: string | null;
  monetization_status: string | null;
  policy_version: string;
  creator_id: string | null;
};

export type RecordShadowOutcomeInput = {
  offerId?: string | null;
  fingerprint?: string | null;
  shadowCycleId?: string | null;
  shadowDecision?: AutonomousDecision | null;
  sourceId?: string | null;
  sourceFamily?: string | null;
  sourceDetail?: string | null;
  score?: number | null;
  confidence?: number | null;
  qualification?: string | null;
  reasonCodes?: string[] | null;
  duplicateStatus?: string | null;
  sellerStatus?: string | null;
  imageStatus?: string | null;
  monetizationStatus?: string | null;
  policyVersion?: string | null;
  creatorId?: string | null;
};

export type RecordShadowOutcomeResult =
  | { persisted: true; offerId: string; duplicate: boolean }
  | { persisted: false; reason: 'invalid' | 'no_client' | 'table_missing' | 'error' | 'test_skip' };

export type RecordHumanOutcomeInput = {
  offerId?: string | null;
  outcome?: HumanOutcome | null;
  actorKind?: HumanActorKind | null;
  at?: string | null;
};

export type RecordHumanOutcomeResult =
  | {
      applied: true;
      offerId: string;
      outcome: HumanOutcome;
      idempotent: boolean;
      matchConfidence: MatchConfidence;
    }
  | {
      applied: false;
      reason:
        | 'invalid'
        | 'no_client'
        | 'table_missing'
        | 'error'
        | 'test_skip'
        | 'unmatched'
        | 'ambiguous'
        | 'append_only';
    };

export type MetricWithSample = {
  value: number | null;
  pct: number | null;
  sampleSize: number;
  sufficiency: SufficiencyLevel;
  display: string;
};

export type CalibrationCounts = {
  shadowEvaluated: number;
  shadowMatched: number;
  shadowUnknown: number;
  autoApprove: number;
  autoApproveHumanApproved: number;
  autoApproveHumanRejected: number;
  autoReject: number;
  autoRejectHumanApproved: number;
  autoRejectHumanRejected: number;
  humanReview: number;
  humanReviewApproved: number;
  humanReviewRejected: number;
  agreement: number;
  disagreement: number;
};

export type SourceCalibrationRow = CalibrationCounts & {
  sourceId: string;
  sourceFamily: string;
  autoApprovePrecision: MetricWithSample;
  autoRejectPrecision: MetricWithSample;
  reviewApprovalRate: MetricWithSample;
  agreementRate: MetricWithSample;
};

export type CreatorCalibrationRow = {
  creatorId: string;
  submissions: number;
  matched: number;
  agreement: number;
  autoApprove: number;
  humanReview: number;
  autoReject: number;
  humanApproved: number;
  humanRejected: number;
  agreementRate: MetricWithSample;
};

export type ReasonCalibrationRow = {
  pair: DisagreementPair;
  reasonCode: string;
  count: number;
};

export type BucketCalibrationRow = {
  bucket: string;
  evaluated: number;
  matched: number;
  agreement: number;
  disagreement: number;
  agreementRate: MetricWithSample;
};

export type CalibrationCollectionStatus = 'COLLECTING' | 'LOW_DATA' | 'NO_DATA' | 'ERROR';

export type DecisionCollectionRow = {
  decision: string;
  snapshots: number;
  matched: number;
  approved: number;
  rejected: number;
  pending: number;
  unknown: number;
  snoozed: number;
  expired: number;
};

export type SourceCollectionRow = {
  sourceId: string;
  sourceFamily: string;
  sourceLane: string;
  snapshots: number;
  matched: number;
  approved: number;
  rejected: number;
  pending: number;
  snoozed: number;
  expired: number;
  matchRate: MetricWithSample;
};

export type ReasonOutcomeRow = {
  reasonCode: string;
  count: number;
  approved: number;
  rejected: number;
  unknown: number;
};

export type CalibrationCollectionHealth = {
  status: CalibrationCollectionStatus;
  since: string;
  shadowSnapshots: number;
  offersWithShadow: number;
  offersWithHumanOutcome: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  unknown: number;
  awaitingOutcomes: number;
  approvedOutcomes: number;
  rejectedOutcomes: number;
  snoozedOutcomes: number;
  expiredOutcomes: number;
  matchRate: MetricWithSample;
  lastShadowSnapshotAt: string | null;
  lastHumanOutcomeAt: string | null;
  avgTimeToDecisionSeconds: number | null;
  sufficiency: SufficiencyLevel;
  byDecision: DecisionCollectionRow[];
  bySource: SourceCollectionRow[];
  reasonOutcomes: ReasonOutcomeRow[];
  alerts: {
    noNewShadowSnapshots: boolean;
    noHumanOutcomes: boolean;
    matchRateCollapse: boolean;
    dbWriteFailures: boolean;
  };
};

export type CalibrationSnapshot = {
  persistence: 'supabase_hunter_shadow_outcomes';
  schemaVersion: number;
  policyVersion: string;
  since: string;
  recommendedAction: string;
  counts: CalibrationCounts;
  agreementRate: MetricWithSample;
  disagreementRate: MetricWithSample;
  autoApprovePrecision: MetricWithSample;
  autoRejectPrecision: MetricWithSample;
  reviewApprovalRate: MetricWithSample;
  reviewRejectRate: MetricWithSample;
  bySource: SourceCalibrationRow[];
  byCreator: CreatorCalibrationRow[];
  disagreementReasons: ReasonCalibrationRow[];
  scoreBuckets: BucketCalibrationRow[];
  confidenceBuckets: BucketCalibrationRow[];
  collection: CalibrationCollectionHealth;
  definitions: {
    autoApprovePrecision: string;
    autoRejectPrecision: string;
    reviewApprovalRate: string;
    agreementRate: string;
    sufficiency: string;
  };
};
