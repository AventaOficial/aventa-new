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
  type AttributionTruthSnapshot,
} from './buildAttributionTruth';
