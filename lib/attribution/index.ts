export {
  ATTRIBUTION_CHANNELS,
  isAttributionChannel,
  resolveAttributionChannel,
  resolveCampaignKey,
  type AttributionChannel,
} from './channels';
export {
  ATTRIBUTION_CLICK_IDEMPOTENCY_WINDOW_MS,
  actorKeyFromSignals,
  buildAttributionIdentityChain,
  buildClickIdempotencyKey,
  type AttributionIdentityChain,
} from './clickIdentity';
export { buildDestinationPair, type DestinationPair } from './destination';
export {
  resolveServerAttributionContext,
  type ClientAttributionHints,
  type ServerAttributionContext,
} from './resolveContext';
export {
  recordAttributedClick,
  type AttributedClickRecord,
} from './recordAttributedClick';
export {
  buildAttributionTruth,
  aggregateAttributionWindow,
  isPersistedClickAttributionComplete,
  ATTRIBUTION_TRUTH_ROW_CAP,
  type AttributionTruthSnapshot,
  type AttributionWindowTruth,
  type AttributionClickRow,
  type AttributionNotConnected,
} from './buildAttributionTruth';
export {
  getAttributionWindowDays,
  getAttributionWindowMs,
  getAttributionWindowSinceIso,
  isClickWithinAttributionWindow,
  isAttributionWindowExpired,
  parseAttributionTimestamp,
} from './attributionWindow';
export {
  ATTRIBUTION_FRAUD_SIGNALS,
  evaluateClickFraudSignals,
  evaluateConversionAttributionFraudSignals,
  isAttributionFraudSignal,
  isAuthenticatedClickEvidence,
  type AttributionFraudSignal,
} from './fraudSignals';
export {
  resolveConversionAttribution,
  resolveConversionAttributionStrict,
  type ConversionAttributionConflict,
  type ConversionAttributionStrictResult,
} from './resolveConversionAttribution';
