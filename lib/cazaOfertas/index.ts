/**
 * CazaOfertasss — FASE 0. Barrel público.
 *
 * Unidad de negocio independiente: Deal Intelligence + Affiliate Commerce.
 * Frontera con Aventa documentada en
 * `docs/SYSTEMS/ARCHITECTURE_cazaofertasss_phase0.md`.
 */

export * from './constants';
export * from './types';
export * from './price';
export * from './evidence';
export * from './identity';
export * from './scoring';
export * from './affiliate';
export * from './validation';
export * from './candidate';
export * from './dedupe';
export * from './safety';

export * from './stores/adapter';
export * from './stores/amazonMx';
export * from './stores/mercadoLibreMx';
export * from './stores/registry';

export * from './telegram/card';
export * from './telegram/botPort';
export * from './telegram/botAdapter';
export * from './telegram/credentials';
export * from './telegram/canary';
export * from './telegram/stagingChannel';
export * from './publication/eligibility';
export * from './publication/cardSnapshot';
export * from './publication/outbox';
export * from './tracking/publication';
export * from './revenue/ledger';
export * from './adapters/inMemory';
export * from './persistence';
