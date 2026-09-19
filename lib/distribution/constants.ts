/**
 * Distribution Engine — fail-closed feature flag + hard boundaries.
 * Independent from Deal Intelligence publicationAllowed / autoPublish / autoApprove.
 */

/** Schema / contract version for distribution domain. */
export const DISTRIBUTION_ENGINE_SCHEMA_VERSION = 'distribution.v1' as const;

/**
 * DISTRIBUTION_ENGINE_ENABLED — default FALSE.
 * Meaning: engine may create/process external distribution publications
 * for already-approved live offers. Does not approve offers. Does not publish providers in P0-D1.
 */
export function isDistributionEngineEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = (env.DISTRIBUTION_ENGINE_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Hard invariants for moderation/money/Supply boundaries.
 * callsExternalProviders=false means enqueue/moderate-offer never call providers.
 * Drain may call adapters only when DISTRIBUTION_ENGINE_ENABLED is explicitly true.
 */
export const DISTRIBUTION_ENGINE_BOUNDARIES = {
  modifiesModerationState: false,
  approvesOffers: false,
  callsExternalProviders: false,
  writesConversions: false,
  writesCommissions: false,
  writesLedger: false,
  writesRewards: false,
  writesPayouts: false,
  settlementEnabled: false,
  modifiesSupplyWrite: false,
  modifiesDqe: false,
  modifiesVerifier: false,
  modifiesAttribution: false,
  secondClickPath: false,
  clonesOffers: false,
  note: 'Enqueue never calls Telegram. Drain is flag-gated. Publications ≠ conversions. Flag OFF by default.',
} as const;

export const DISTRIBUTION_PUBLICATION_STATUSES = [
  'pending',
  'publishing',
  'published',
  'retryable',
  'failed',
  'cancelled',
  /** C3: ambiguous external side effect — never auto-retry. */
  'unknown_outcome',
] as const;

export const DISTRIBUTION_PROVIDERS = ['telegram', 'whatsapp', 'web'] as const;

export const DISTRIBUTION_DESTINATION_KINDS = ['general', 'category', 'coupons'] as const;

export const DISTRIBUTION_EVENT_TYPES = [
  // C1
  'publication_created',
  'publication_attempted',
  'publication_published',
  'publication_failed',
  'publication_retryable',
  // C3 semantic observability
  'lease_acquired',
  'lease_expired',
  'reclaim_attempted',
  'reclaimed',
  'unknown_outcome',
  'released_to_retryable',
  'publish_success',
  'publish_failure',
  // Early WIP aliases (compat with prepared migration)
  'publication_unknown_outcome',
  'publication_reclaimed',
] as const;

/** C3 structured event names (no PII / secrets / tokens). */
export const DISTRIBUTION_C3_EVENTS = {
  lease_acquired: 'lease_acquired',
  lease_expired: 'lease_expired',
  reclaim_attempted: 'reclaim_attempted',
  reclaimed: 'reclaimed',
  unknown_outcome: 'unknown_outcome',
  released_to_retryable: 'released_to_retryable',
  publish_success: 'publish_success',
  publish_failure: 'publish_failure',
} as const;

/** Default publishing lease TTL while status=publishing (updated_at stamp). */
export const DISTRIBUTION_PUBLISHING_LEASE_MS = 5 * 60_000;

/** Operator-visible publication lifecycle labels (C3). */
export const DISTRIBUTION_OPERATOR_STATUS_LABELS = {
  publishing: 'PUBLISHING',
  unknown_outcome: 'UNKNOWN_OUTCOME',
  retryable: 'RETRYABLE',
  published: 'PUBLISHED',
} as const;

/** Default version for first fan-out of an offer×destination. */
export const DISTRIBUTION_DEFAULT_VERSION = 1;
