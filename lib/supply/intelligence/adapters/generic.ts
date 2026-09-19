/**
 * Generic store adapter stub — candidate prices only, no live fetch.
 */

import type {
  FetchCurrentPriceInput,
  FetchCurrentPriceResult,
  PriceSourceAdapter,
} from './types';

export const GENERIC_ADAPTER_ID = 'generic' as const;

export function createGenericPriceAdapter(storeId?: string): PriceSourceAdapter {
  const id = storeId?.trim() || GENERIC_ADAPTER_ID;
  return {
    id,
    displayName: id,
    capabilities: {
      currentPrice: false,
      historicalPrice: false,
      listPrice: false,
    },
    isLiveEnabled(): boolean {
      return false;
    },
    async fetchCurrentPrice(input: FetchCurrentPriceInput): Promise<FetchCurrentPriceResult> {
      const t0 = Date.now();
      const sale = input.fallbackSalePrice;
      return {
        ok: sale != null,
        dryRun: true,
        salePrice:
          sale != null
            ? {
                amount: sale,
                kind: 'candidate_declared',
                source: id,
                observedAt: new Date().toISOString(),
                trusted: true,
              }
            : null,
        listPrice: null,
        errorCode: sale != null ? null : 'missing_fallback',
        latencyMs: Date.now() - t0,
      };
    },
  };
}
