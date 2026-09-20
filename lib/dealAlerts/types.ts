/**
 * Deal Alerts S6.1 — domain types (contract only).
 */

import type { DealDetectedEvent, DealIdentity } from '@/lib/dealIntelligence/types';
import type {
  OpportunityDecision,
  OpportunityEvidenceLevel,
} from '@/lib/supply/intelligence/types';
import type { DealEvidenceStrength } from '@/lib/hunter/dealEvidence/contract';
import type { DEAL_ALERTS_CONTRACT_VERSION } from './constants';

/** Authority stack for alertability — not a new score. */
export type AlertabilityAuthority = {
  opportunityDecision: OpportunityDecision;
  evidenceLevel: OpportunityEvidenceLevel;
  historyReady: boolean;
  /** From Evidence Contract when known; null if not evaluated. */
  evidenceStrength: DealEvidenceStrength | null;
  /** DQE passed / not reject when known; null if not evaluated. */
  dqeEligible: boolean | null;
};

/**
 * Evidence snapshot for "may enter Deal Alerts".
 * Derived from S8 / PM / Evidence / DQE — never invents prices or scores.
 */
export type AlertabilityEvidence = {
  contractVersion: typeof DEAL_ALERTS_CONTRACT_VERSION;
  authority: AlertabilityAuthority;
  fingerprint: string | null;
  identityStatus: DealIdentity['identityStatus'];
  merchant: string | null;
  store: string | null;
  salePrice: number | null;
  discountPercent: number | null;
  currency: string | null;
  historyReady: boolean;
  evidenceLevel: OpportunityEvidenceLevel;
  /** True when observation exceeds max age. */
  stale: boolean;
  observedAt: string;
  evaluatedAt: string;
  sourceId: string;
  /** Pass gates → eligible for Alert Decision MATCH path. */
  alertable: boolean;
  /** Fail-closed reason when not alertable. */
  blockReason:
    | 'not_opportunity'
    | 'partial_opportunity'
    | 'insufficient_evidence'
    | 'stale'
    | 'missing_fingerprint'
    | 'missing_identity'
    | 'weak_evidence'
    | 'dqe_ineligible'
    | null;
};

export type AlertDecisionResult =
  | 'MATCH'
  | 'SUPPRESS'
  | 'DUPLICATE'
  | 'STALE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NOT_RELEVANT'
  | 'RATE_LIMITED';

/**
 * Alert Decision output contract.
 * S6.2 implements Decision Layer algorithm; S6.1 freezes the shape.
 */
export type AlertDecision = {
  contractVersion: typeof DEAL_ALERTS_CONTRACT_VERSION;
  result: AlertDecisionResult;
  reason: string;
  dealFingerprint: string | null;
  /** Idempotency key of the DealDetected event (global, no userId). */
  dealDetectedIdempotencyKey: string | null;
  evidenceReference: {
    evidenceLevel: OpportunityEvidenceLevel;
    historyReady: boolean;
    opportunityDecision: OpportunityDecision;
  };
  detectedAt: string;
  evaluatedAt: string;
};

export type AlertNotificationChannel = 'in_app' | 'email_digest';

/**
 * Conceptual subscription — typed only. No table / DDL / persistence in S6.1.
 * Never implies per-user scraping.
 */
export type AlertSubscription = {
  contractVersion: typeof DEAL_ALERTS_CONTRACT_VERSION;
  userId: string;
  stores: string[];
  categories: string[];
  minimumDiscountPercent: number;
  notificationChannels: AlertNotificationChannel[];
  enabled: boolean;
  /** Seconds between repeat alerts for same fingerprint. */
  cooldownSeconds: number;
  /** Soft daily cap for this subscription (≤ global user cap). */
  dailyCap: number;
};

export type AlertSubscriptionCapsViolation =
  | 'too_many_stores'
  | 'too_many_categories'
  | 'discount_below_minimum'
  | 'discount_above_maximum'
  | 'cooldown_out_of_range'
  | 'daily_cap_exceeded'
  | 'empty_channels'
  | 'too_many_subscriptions';

/**
 * DealDetected for Deal Alerts — reuses DI DealDetectedEvent + alertability snapshot.
 * Backwards-compatible extension (intersection type; DI event unchanged).
 */
export type DealAlertsDealDetected = DealDetectedEvent & {
  dealAlertsContractVersion: typeof DEAL_ALERTS_CONTRACT_VERSION;
  alertability: AlertabilityEvidence;
  /** Explicit: global deal identity — never includes userId. */
  userScoped: false;
};
