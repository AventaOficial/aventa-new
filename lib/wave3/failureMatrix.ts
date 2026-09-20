/**
 * WAVE 3 Failure Matrix — scenario catalog (adversarial).
 * Evidence is produced by tests/integration/wave3/*.
 */

export type FailureScenarioId =
  | 'duplicate_candidate'
  | 'duplicate_s9_execution'
  | 'concurrent_s9_execution'
  | 'crash_before_s7_write'
  | 'stale_retry'
  | 'pending_bypass'
  | 'rejected_bypass'
  | 'duplicate_distribution_enqueue'
  | 'concurrent_distribution_claim'
  | 'provider_retryable_failure'
  | 'provider_definite_failure'
  | 'provider_timeout'
  | 'provider_publish_lost_ack'
  | 'unknown_outcome_recovery'
  | 'duplicate_click'
  | 'click_offer_identity_conflict'
  | 'missing_click'
  | 'unresolved_attribution'
  | 'conversion_replay'
  | 'commission_replay'
  | 'concurrent_commission_creation'
  | 'settlement_replay'
  | 'ledger_then_link_failure'
  | 'production_target'
  | 'rewards_accidentally_enabled'
  | 'settlement_accidentally_enabled'
  | 'distribution_accidentally_enabled';

export type FailureScenarioSpec = {
  id: FailureScenarioId;
  setup: string;
  action: string;
  expected: string;
  forbidden: string[];
};

export const WAVE3_FAILURE_MATRIX: FailureScenarioSpec[] = [
  {
    id: 'duplicate_candidate',
    setup: 'Same URL twice in one S9 run',
    action: 'runSupplyAutomation dry_run',
    expected: 'First ELIGIBLE, second DUPLICATE',
    forbidden: ['second_write', 'second_offer'],
  },
  {
    id: 'duplicate_s9_execution',
    setup: 'Offer already pending for URL',
    action: 'Second execute same candidate',
    expected: 'DUPLICATE / pending_fresh; write_success=0',
    forbidden: ['second_offer_row'],
  },
  {
    id: 'concurrent_s9_execution',
    setup: 'Two parallel execute with same URL',
    action: 'Promise.all runSupplyAutomation',
    expected: 'At most one write_success',
    forbidden: ['two_offer_ids'],
  },
  {
    id: 'crash_before_s7_write',
    setup: 'Eligible decision then throw before write',
    action: 'Inject write that throws',
    expected: 'No offer row; retry can proceed',
    forbidden: ['partial_approved_status'],
  },
  {
    id: 'stale_retry',
    setup: 'Prior success then retry',
    action: 'Re-execute same fingerprint',
    expected: 'DUPLICATE; rowsForFingerprint=1',
    forbidden: ['second_insert'],
  },
  {
    id: 'pending_bypass',
    setup: 'Offer status=pending',
    action: 'enqueueDistributionForApprovedOffer',
    expected: 'skipped not_distributable',
    forbidden: ['publication_created'],
  },
  {
    id: 'rejected_bypass',
    setup: 'Offer status=rejected',
    action: 'enqueueDistribution',
    expected: 'skipped not_distributable',
    forbidden: ['publication_created'],
  },
  {
    id: 'duplicate_distribution_enqueue',
    setup: 'Approved offer already enqueued',
    action: 'enqueue twice',
    expected: 'reused≥1; unique publication',
    forbidden: ['duplicate_external_message'],
  },
  {
    id: 'concurrent_distribution_claim',
    setup: 'One pending publication',
    action: 'Concurrent claim',
    expected: 'Exactly one winner',
    forbidden: ['double_publishing'],
  },
  {
    id: 'provider_retryable_failure',
    setup: 'Controlled provider retryable',
    action: 'drain',
    expected: 'status retryable; attempt++',
    forbidden: ['offer_status_mutation', 'telegram_prod'],
  },
  {
    id: 'provider_definite_failure',
    setup: 'Controlled provider definite fail',
    action: 'drain',
    expected: 'status failed',
    forbidden: ['published'],
  },
  {
    id: 'provider_timeout',
    setup: 'Controlled provider timeout',
    action: 'drain',
    expected: 'retryable or unknown_outcome path',
    forbidden: ['silent_success'],
  },
  {
    id: 'provider_publish_lost_ack',
    setup: 'Publish success locally + lost ACK',
    action: 'markPublishingUnknownOutcome',
    expected: 'unknown_outcome; offer untouched',
    forbidden: ['duplicate_external_without_recovery'],
  },
  {
    id: 'unknown_outcome_recovery',
    setup: 'Publication in unknown_outcome',
    action: 'releaseUnknownOutcomeToRetryable + drain',
    expected: 'Recover without second message if idempotent',
    forbidden: ['C3_semantic_change'],
  },
  {
    id: 'duplicate_click',
    setup: 'Same actor+offer within window',
    action: 'recordAttributedClick ×2',
    expected: 'Same clickId / reuse',
    forbidden: ['two_click_rows_same_key'],
  },
  {
    id: 'click_offer_identity_conflict',
    setup: 'Click for offer A; client claims offer B',
    action: 'resolveConversionAttributionStrict',
    expected: 'Click offer wins; conflict recorded',
    forbidden: ['client_offer_overrides_click'],
  },
  {
    id: 'missing_click',
    setup: 'Conversion without clickId',
    action: 'recordConversion',
    expected: 'unattributed persisted OR fail per policy',
    forbidden: ['invented_click'],
  },
  {
    id: 'unresolved_attribution',
    setup: 'Expired/missing click',
    action: 'resolveConversionAttributionStrict',
    expected: 'unresolved/unattributed',
    forbidden: ['forced_attributed'],
  },
  {
    id: 'conversion_replay',
    setup: 'Same external_conversion_id',
    action: 'recordConversion ×2',
    expected: 'reused=true; one row',
    forbidden: ['second_conversion'],
  },
  {
    id: 'commission_replay',
    setup: 'Same external_commission_id',
    action: 'recordCommission ×2',
    expected: 'reused=true; one row',
    forbidden: ['second_commission'],
  },
  {
    id: 'concurrent_commission_creation',
    setup: 'Same conversion_id parallel',
    action: 'Promise.all recordCommission',
    expected: 'At most one row (UNIQUE conversion_id)',
    forbidden: ['double_credit'],
  },
  {
    id: 'settlement_replay',
    setup: 'Approved commission already settled',
    action: 'settleCommission ×2',
    expected: 'reused ledger; one ledger entry',
    forbidden: ['second_ledger', 'creator_reward'],
  },
  {
    id: 'ledger_then_link_failure',
    setup: 'Ledger insert ok; CAS link conflict',
    action: 'Concurrent settle',
    expected: 'Fail-closed / single link winner',
    forbidden: ['orphan_double_ledger_linked'],
  },
  {
    id: 'production_target',
    setup: 'AVENTA_SUPABASE_TARGET=production or prod ref',
    action: 'assertWave3StagingOnly',
    expected: 'ABORT',
    forbidden: ['any_write'],
  },
  {
    id: 'rewards_accidentally_enabled',
    setup: 'REWARDS_PROGRAM_ACTIVE=true during seam',
    action: 'seam Mod→Dist / Conv→Comm / Settle',
    expected: 'REWARDS_ENABLED_FORBIDDEN or no reward create',
    forbidden: ['creator_rewards_insert'],
  },
  {
    id: 'settlement_accidentally_enabled',
    setup: 'SETTLEMENT_BRIDGE_ENABLED during E2E (should stay off)',
    action: 'Wave3 E2E path',
    expected: 'E2E does not settle; canary separate',
    forbidden: ['ledger_from_e2e'],
  },
  {
    id: 'distribution_accidentally_enabled',
    setup: 'DISTRIBUTION_ENGINE_ENABLED left ON after canary',
    action: 'restoreWave3FailClosedFlags',
    expected: 'distributionOff=true',
    forbidden: ['persistent_flag_on'],
  },
];

export function failureMatrixIds(): FailureScenarioId[] {
  return WAVE3_FAILURE_MATRIX.map((s) => s.id);
}
