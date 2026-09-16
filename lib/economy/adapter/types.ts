/**
 * Normalized affiliate network event model (provider-agnostic).
 * External payload ≠ domain ≠ persisted row.
 * NO settlement / rewards / payouts.
 */

import type {
  AffiliateNetwork,
  AttributionLinkStatus,
  CommissionStatus,
  ConversionStatus,
  EconomicIngestSource,
} from '../types';

export type NetworkEventKind = 'conversion' | 'commission' | 'commission_revision';

/** Identity of an external network event — never timestamp+random. */
export type NetworkEventIdentity = {
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  /** Provider-stable event id (order id, commission id, revision id). */
  externalEventId: string;
};

export type AttributionReference = {
  clickId?: string | null;
  offerId?: string | null;
  /** Opaque tracking tokens from network — never invent clicks from these alone. */
  trackingHints?: Record<string, string>;
};

export type ExternalConversionEvent = {
  identity: NetworkEventIdentity;
  occurredAt: string;
  status?: ConversionStatus;
  orderAmountCents?: number | null;
  currency?: string | null;
  attribution?: AttributionReference;
  /** Bounded audit evidence — not domain SoT. */
  rawReference?: Record<string, unknown>;
};

export type ExternalCommissionEvent = {
  identity: NetworkEventIdentity;
  /** Must resolve to an internal or external conversion identity. */
  externalConversionId: string;
  occurredAt: string;
  /** Authority: network-reported gross. Never sale×%. */
  grossCommissionCents: number;
  currency: string;
  status?: CommissionStatus;
  attribution?: AttributionReference;
  rawReference?: Record<string, unknown>;
};

export type CommissionRevisionKind =
  | 'positive_adjustment'
  | 'negative_adjustment'
  | 'correction'
  | 'reversal';

export type CommissionRevisionSemantics = 'delta' | 'replacement';

export type ExternalCommissionRevisionEvent = {
  identity: NetworkEventIdentity;
  externalCommissionId: string;
  occurredAt: string;
  revisionKind: CommissionRevisionKind;
  semantics: CommissionRevisionSemantics;
  /** Required when semantics=delta (may be negative). */
  amountDeltaCents?: number | null;
  /** Required when semantics=replacement (>=0). */
  absoluteAmountCents?: number | null;
  currency: string;
  reason?: string | null;
  rawReference?: Record<string, unknown>;
};

export type NormalizedConversion = {
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  externalConversionId: string;
  occurredAt: string;
  status: ConversionStatus;
  clickId: string | null;
  offerId: string | null;
  orderAmountCents: number | null;
  currency: string | null;
  rawReference: Record<string, unknown>;
};

export type NormalizedCommission = {
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  externalCommissionId: string;
  externalConversionId: string;
  occurredAt: string;
  status: CommissionStatus;
  grossCommissionCents: number;
  currency: string;
  rawReference: Record<string, unknown>;
};

export type NormalizedCommissionRevision = {
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  externalRevisionId: string;
  externalCommissionId: string;
  occurredAt: string;
  revisionKind: CommissionRevisionKind;
  semantics: CommissionRevisionSemantics;
  amountDeltaCents: number | null;
  absoluteAmountCents: number | null;
  currency: string;
  reason: string | null;
  rawReference: Record<string, unknown>;
};

export type NormalizedNetworkBatch = {
  network: AffiliateNetwork;
  source: EconomicIngestSource;
  conversions: NormalizedConversion[];
  commissions: NormalizedCommission[];
  revisions: NormalizedCommissionRevision[];
};

export type AdapterParseResult =
  | { ok: true; batch: NormalizedNetworkBatch }
  | { ok: false; error: string; code: string };

export type SignatureVerificationInput = {
  network: AffiliateNetwork;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string | Uint8Array;
};

export type SignatureVerificationResult =
  | { ok: true }
  | { ok: false; reason: string; code: string };

/**
 * Provider-agnostic adapter.
 * Transforms EXTERNAL → NORMALIZED only. Never settles money.
 */
export type AffiliateNetworkAdapter = {
  readonly network: AffiliateNetwork;
  readonly providerId: string;
  readonly connected: boolean;
  verifySignature(input: SignatureVerificationInput): Promise<SignatureVerificationResult>;
  parsePayload(payload: unknown): AdapterParseResult;
};

export type NetworkConnectionStatus =
  | 'not_connected'
  | 'connected_zero'
  | 'connected_with_data';

export type ReconciliationFindingType =
  | 'MATCHED'
  | 'MISSING_INTERNAL'
  | 'MISSING_EXTERNAL'
  | 'AMOUNT_MISMATCH'
  | 'STATUS_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'DUPLICATE'
  | 'ORPHAN';

export type ReconciliationEntityKind = 'conversion' | 'commission' | 'revision';

export type ReconciliationFinding = {
  findingType: ReconciliationFindingType;
  entityKind: ReconciliationEntityKind;
  externalId: string | null;
  internalId: string | null;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  difference: Record<string, unknown>;
  source: EconomicIngestSource;
  network: AffiliateNetwork;
};

export type ReconciliationRunResult = {
  runId: string;
  reused: boolean;
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  windowStart: string;
  windowEnd: string;
  status: 'completed' | 'failed' | 'partial';
  summary: {
    matched: number;
    missingInternal: number;
    missingExternal: number;
    amountMismatch: number;
    statusMismatch: number;
    currencyMismatch: number;
    duplicate: number;
    orphan: number;
    totalFindings: number;
  };
  findings: ReconciliationFinding[];
};

/** Revision row lifecycle — immutable once recorded; rare admin supersede. */
export const REVISION_STATUSES = ['recorded', 'superseded', 'reversed'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const REVISION_TRANSITIONS: Record<RevisionStatus, readonly RevisionStatus[]> = {
  recorded: ['superseded', 'reversed'],
  superseded: [],
  reversed: [],
};

export function canTransitionRevision(from: RevisionStatus, to: RevisionStatus): boolean {
  if (from === to) return false;
  return REVISION_TRANSITIONS[from].includes(to);
}

export type AttributionLinkSnapshot = {
  attributionStatus: AttributionLinkStatus;
  clickId: string | null;
  offerId: string | null;
};
