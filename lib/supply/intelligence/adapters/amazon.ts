/**
 * Amazon price adapter — interface stub, not connected (S8).
 *
 * Capability gate returns dry-run only. No Keepa/PA-API wiring in this slice.
 */

import type {
  FetchCurrentPriceInput,
  FetchCurrentPriceResult,
  FetchPriceHistoryInput,
  FetchPriceHistoryResult,
  PriceSourceAdapter,
} from './types';

export const AMAZON_ADAPTER_ID = 'amazon' as const;

function readAmazonLiveEnabled(): boolean {
  const flag = (process.env.SUPPLY_INTELLIGENCE_AMAZON_LIVE ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function createAmazonPriceAdapter(): PriceSourceAdapter {
  return {
    id: AMAZON_ADAPTER_ID,
    displayName: 'Amazon',
    capabilities: {
      currentPrice: false,
      historicalPrice: false,
      listPrice: false,
    },
    isLiveEnabled(): boolean {
      return readAmazonLiveEnabled();
    },
    async fetchCurrentPrice(input: FetchCurrentPriceInput): Promise<FetchCurrentPriceResult> {
      const t0 = Date.now();
      const fallback = input.fallbackSalePrice;
      return {
        ok: false,
        dryRun: true,
        salePrice:
          fallback != null
            ? {
                amount: fallback,
                kind: 'candidate_declared',
                source: AMAZON_ADAPTER_ID,
                observedAt: new Date().toISOString(),
                trusted: true,
              }
            : null,
        listPrice: null,
        errorCode: 'not_connected',
        latencyMs: Date.now() - t0,
      };
    },
    async fetchPriceHistory(input: FetchPriceHistoryInput): Promise<FetchPriceHistoryResult> {
      void input;
      return {
        ok: false,
        dryRun: true,
        points: [],
        lowestInWindow: null,
        errorCode: 'not_connected',
        latencyMs: 0,
      };
    },
  };
}
