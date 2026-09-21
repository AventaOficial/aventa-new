/**

 * Public experiment surface for ingest wiring.

 * Intentionally excludes any mint/insert path.

 */

export {

  isHunterDiscoveryExperimentEnabled,

  getDiscoveryExperimentVariant,

  getDiscoveryExperimentCaps,

  HUNTER_DISCOVERY_EXPERIMENT_ENV,

  HUNTER_DISCOVERY_EXPERIMENT_ID,

  HUNTER_DISCOVERY_EXPERIMENT_ID_V1,

} from './discoveryExperiment';

export { earlyPersistDiscoverySightings, applyWouldCutAnnotations } from './earlyPersist';

export {

  classifyDiscountClass,

  classifyDiscountClassV1,

  classifyDiscountEvidence,

} from './discountClass';

export {

  auditDiscountGateReason,

  simulateWithoutDiscountGate,

  deriveFunnelDecision,

  aggregateDiscountPathStats,

} from './discountAudit';

export { summarizeOpportunities } from './opportunityMetrics';

export {

  computeNovelProductRate,

  jaccardOverlap,

  productIdentityKey,

  repeatRate,

} from './discoveryMetrics';

export { buildRotationPlan, rotateSubset } from './discoveryRotation';

export { persistDiscoveryEvents, HUNTER_DISCOVERY_EVENTS_TABLE } from './persistDiscoveryEvents';


