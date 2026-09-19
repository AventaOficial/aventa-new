/**
 * Supply Intelligence Engine — S8 foundation.
 *
 * Evaluates opportunity evidence without replacing S6/S7 ingest authority.
 * No offers.pending writes. No Distribution / Rewards / Settlement.
 */

export * from './types';
export * from './priceProvenance';
export * from './opportunityScore';
export * from './evaluateOpportunity';
export * from './observeOpportunity';
export * from './fromHunterHandoff';
export * from './adapters/types';
export { createMercadoLibrePriceAdapter, MERCADOLIBRE_ADAPTER_ID } from './adapters/mercadolibre';
export { createAmazonPriceAdapter, AMAZON_ADAPTER_ID } from './adapters/amazon';
export { createGenericPriceAdapter, GENERIC_ADAPTER_ID } from './adapters/generic';
