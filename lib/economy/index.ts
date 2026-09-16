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
