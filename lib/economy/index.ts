export {
  AFFILIATE_NETWORKS,
  ECONOMIC_INGEST_SOURCES,
  CONVERSION_STATUSES,
  COMMISSION_STATUSES,
  ATTRIBUTION_LINK_STATUSES,
  CONVERSION_TRANSITIONS,
  COMMISSION_TRANSITIONS,
  ECONOMIC_LEDGER_BOUNDARY,
  canTransitionConversion,
  canTransitionCommission,
  isAffiliateNetwork,
  isEconomicIngestSource,
  type AffiliateNetwork,
  type EconomicIngestSource,
  type ConversionStatus,
  type CommissionStatus,
  type AttributionLinkStatus,
} from './types';
export {
  recordConversion,
  resolveConversionAttribution,
  transitionConversionStatus,
  type ConversionRecord,
} from './recordConversion';
export {
  recordCommission,
  transitionCommissionStatus,
  type CommissionRecord,
} from './recordCommission';
export {
  buildConversionCommissionTruth,
  type ConversionCommissionTruth,
} from './buildConversionCommissionTruth';
export { appendEconomicEvent } from './appendEconomicEvent';
export {
  createNotConnectedAdapter,
  DEFAULT_NOT_CONNECTED_ADAPTER,
} from './adapter/notConnectedAdapter';
export {
  registerAffiliateNetworkAdapter,
  unregisterAffiliateNetworkAdapter,
  clearAffiliateNetworkAdapters,
  getAffiliateNetworkAdapter,
  listConnectedAffiliateNetworks,
  isAnyAffiliateNetworkConnected,
  resolveNetworkConnectionStatus,
} from './adapter/registry';
export {
  verifyNetworkSignature,
  assertSignatureVerified,
  networkFromHeaderHints,
} from './adapter/verifyNetworkSignature';
export {
  ingestNetworkHttpEvent,
  persistNormalizedBatch,
  type IngestNetworkEventResult,
} from './adapter/ingestNetworkEvent';
export {
  recordCommissionRevision,
  transitionRevisionStatus,
  type CommissionRevisionRecord,
} from './revisions/recordCommissionRevision';
export {
  applyRevisionsToGross,
  computeEffectiveCommissionCents,
  getEffectiveCommissionSnapshot,
} from './revisions/effectiveCommission';
export {
  runAffiliateReconciliation,
  compareCommissionSnapshot,
  type ExternalReconciliationSnapshot,
} from './reconciliation/runAffiliateReconciliation';
export {
  snapshotMoneyFoundationFreeze,
  assertMoneyShadowAllowed,
  type MoneyFoundationFreezeSnapshot,
} from './shadow/assertMoneyFoundationFreeze';
export {
  runMoneyShadowPipeline,
  projectShadowAllocations,
  MONEY_SHADOW_MODE,
  MONEY_EVENT_KINDS,
  type MoneyEventKind,
  type MoneyShadowEvidence,
  type MoneyShadowAllocationProjection,
  type MoneyShadowPipelineInput,
} from './shadow/moneyShadowPipeline';
export {
  MONEY_SYSTEM_AUTHORITIES,
  MONEY_SYSTEM_CHAIN,
} from './shadow/authorities';
export {
  MONEY_SYSTEM_PRESENT_INVARIANTS,
  MONEY_SYSTEM_MISSING_INVARIANTS,
  checkCurrencyMatch,
  assertNonNegativeIntegerCents,
} from './shadow/invariants';
export {
  settleCommission,
  isSettlementBridgeEnabled,
  SETTLEMENT_BRIDGE_ENV_KEY,
  buildSettlementExternalRef,
  parseSettlementCommissionId,
  buildSettlementDiagnostics,
  buildSettlementOpsSnapshot,
  assertSettlementStagingCanaryEnv,
  runSettlementStagingCanary,
  SETTLEMENT_STAGING_CANARY_ACTOR,
  SETTLEMENT_STAGING_CANARY_BOUNDARY,
  buildSettlementReversalContract,
  emitSettlementReversalRequired,
  SETTLEMENT_EVENT_TYPES,
  SETTLEMENT_REJECT_REASONS,
  SETTLEMENT_EXTERNAL_REF_PREFIX,
  type SettleCommissionInput,
  type SettlementBridgeResult,
  type SettlementDiagnostics,
  type SettlementOpsSnapshot,
  type SettlementStagingCanaryResult,
  type SettlementStagingCanaryGuardsResult,
  type SettlementStagingCanaryMode,
  type SettlementStagingCanaryRejectReason,
  type SettlementAllocation,
  type SettlementEventType,
  type SettlementRejectReason,
  type SettlementReversalContract,
} from './settlement';

export {
  canTransitionRevision,
  REVISION_STATUSES,
  REVISION_TRANSITIONS,
  type AffiliateNetworkAdapter,
  type NetworkConnectionStatus,
  type NormalizedNetworkBatch,
  type ReconciliationFindingType,
  type ReconciliationRunResult,
  type CommissionRevisionKind,
  type RevisionStatus,
} from './adapter/types';
export {
  MERCADOLIBRE_AFFILIATE_CAPABILITY_MATRIX,
  MERCADOLIBRE_AFFILIATE_ECONOMIC_INGEST_SUPPORTED,
  MERCADOLIBRE_AFFILIATE_ADAPTER,
  createMercadoLibreAffiliateAdapter,
  getMercadoLibreAffiliateConfig,
  buildMercadoLibreAffiliateHealth,
  summarizeMercadoLibreAffiliateCapabilities,
  resetMercadoLibreAffiliateMetricsForTests,
  assertSellerOauthIsNotAffiliateAuthority,
  ML_AFFILIATE_ERROR_CODES,
} from './providers/mercadolibre';
