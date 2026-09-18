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
] as const;

export const DISTRIBUTION_PROVIDERS = ['telegram', 'whatsapp', 'web'] as const;

export const DISTRIBUTION_DESTINATION_KINDS = ['general', 'category', 'coupons'] as const;

export const DISTRIBUTION_EVENT_TYPES = [
  'publication_created',
  'publication_attempted',
  'publication_published',
  'publication_failed',
  'publication_retryable',
] as const;

/** Default version for first fan-out of an offer×destination. */
export const DISTRIBUTION_DEFAULT_VERSION = 1;
