/**
 * Supply Intelligence — S4 SourceAdapter dry-run surface.
 * Does not publish, insert offers, or touch Distribution.
 */

export * from './sourceAdapter';
export * from './dryRunPipeline';
export {
  createMlWorkerListingAdapter,
  normalizeMlWorkerListing,
  normalizedListingToRawObservation,
  buildMlWorkerSourceEventId,
  ML_WORKER_ADAPTER_SOURCE_ID,
  ML_WORKER_ADAPTER_PARSER_VERSION,
} from './adapters/mlWorkerListingAdapter';
