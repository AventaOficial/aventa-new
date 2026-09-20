/**
 * Deal Alerts S6.1 — contract versioning + structural caps.
 * No persistence. No delivery. No scorer.
 */

export const DEAL_ALERTS_CONTRACT_VERSION = 'deal-alerts.v1' as const;

/** Detection window version for global DealDetected idempotency (not user-scoped). */
export const DEAL_ALERTS_DETECTION_WINDOW_VERSION = 'dw.v1' as const;

/**
 * Default max age for deal observations entering alertability (24h).
 * Decision Layer may tighten; contract documents the baseline.
 */
export const DEAL_ALERTS_DEFAULT_MAX_AGE_SECONDS = 86_400;

/**
 * Structural abuse / storm caps — enforced in app + DB CHECK (S6.4).
 * A subscription never implies per-user scraping.
 */
export const DEAL_ALERTS_SUBSCRIPTION_CAPS = {
  maxStoresPerSubscription: 8,
  maxCategoriesPerSubscription: 12,
  minDiscountPercent: 20,
  maxDiscountPercent: 95,
  maxSubscriptionsPerUser: 10,
  maxNotificationsPerUserPerDay: 20,
  minCooldownSeconds: 3_600,
  maxCooldownSeconds: 7 * 86_400,
  defaultCooldownSeconds: 21_600,
} as const;

/**
 * Max candidates returned per opportunity (coarse retrieval).
 * RPC returns limit+1 to detect overflow without silent truncate.
 */
export const DEAL_ALERTS_CANDIDATE_LIMIT_DEFAULT = 1_000;
export const DEAL_ALERTS_CANDIDATE_LIMIT_HARD_MAX = 5_000;

/** Canonical table — S6.4 persistence. */
export const DEAL_ALERT_SUBSCRIPTIONS_TABLE = 'deal_alert_subscriptions' as const;
export const DEAL_ALERT_FIND_CANDIDATES_RPC = 'deal_alert_find_candidates' as const;

/**
 * Hard money-path isolation — Deal Alerts must never depend on these modules.
 * Mirrored in tests via source-guard (no runtime money writes).
 */
export const DEAL_ALERTS_ECONOMY_BOUNDARY = {
  writesConversions: false,
  writesCommissions: false,
  writesLedger: false,
  writesRewards: false,
  writesPayouts: false,
  writesAttribution: false,
  settlementEnabled: false,
  moneyPathRequired: false,
  note: 'Deal Alerts operate with MONEY_PATH_FROZEN=true. No economic authority.',
} as const;

/** Modules Deal Alerts must never import (path substrings for source guards). */
export const DEAL_ALERTS_FORBIDDEN_IMPORT_PATTERNS = [
  'lib/rewards/payoutIntent',
  'lib/rewards/rewardsEngine',
  'lib/rewards/availablePayoutIntent',
  'lib/rewards/providerConfirmationAutomation',
  'lib/economy/settlement',
  'lib/economy/recordCommission',
  'lib/economy/recordConversion',
  'lib/attribution/recordAttributedClick',
  'lib/commissions/',
] as const;
