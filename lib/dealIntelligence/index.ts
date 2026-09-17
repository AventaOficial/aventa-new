/**
 * Deal Intelligence Engine — P0.1 foundation exports.
 * Reuses Supply/DQE/dealSignals. Does not publish or settle money.
 */

export * from './constants';
export * from './types';
export * from './identity';
export * from './priceObservation';
export * from './promotion';
export * from './dealScore';
export * from './dealDetectedEvent';
export * from './sourceCapabilities';
export * from './truth';
export * from './safety';
export * from './telemetry';
export * from './mappers/offerPriceSnapshot';
export * from './mappers/priceMemorySnapshot';
export * from './mappers/rawRows';
export * from './readers/canonicalRead';
