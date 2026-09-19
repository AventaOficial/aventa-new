/**
 * Price-source adapters for Supply Intelligence — read-only, no offer writes.
 */

import type { PriceProvenance } from '../types';

export type PriceAdapterCapability =
  | 'current_price'
  | 'historical_price'
  | 'list_price';

export type PriceAdapterCapabilities = {
  currentPrice: boolean;
  historicalPrice: boolean;
  listPrice: boolean;
};

export type FetchCurrentPriceInput = {
  url: string;
  canonicalUrl?: string | null;
  /** Known sale price from discovery (fallback when API unavailable). */
  fallbackSalePrice?: number | null;
  fallbackListPrice?: number | null;
};

export type FetchCurrentPriceResult = {
  ok: boolean;
  dryRun: boolean;
  salePrice: PriceProvenance | null;
  listPrice: PriceProvenance | null;
  errorCode: string | null;
  latencyMs: number;
};

export type FetchPriceHistoryInput = {
  url: string;
  canonicalUrl?: string | null;
  productId?: string | null;
  days?: number;
};

export type PriceHistoryPoint = {
  recordedOn: string;
  price: number;
};

export type FetchPriceHistoryResult = {
  ok: boolean;
  dryRun: boolean;
  points: PriceHistoryPoint[];
  lowestInWindow: number | null;
  errorCode: string | null;
  latencyMs: number;
};

/**
 * Read-only price adapter. Implementations must not insert offers or mutate ingest state.
 */
export type PriceSourceAdapter = {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: PriceAdapterCapabilities;
  /** Whether live fetch is possible in this process (creds, flags). */
  isLiveEnabled(): boolean;
  fetchCurrentPrice(input: FetchCurrentPriceInput): Promise<FetchCurrentPriceResult>;
  /** Only called when capabilities.historicalPrice === true. */
  fetchPriceHistory?(input: FetchPriceHistoryInput): Promise<FetchPriceHistoryResult>;
};

export function adapterSupports(
  adapter: PriceSourceAdapter,
  cap: PriceAdapterCapability,
): boolean {
  switch (cap) {
    case 'current_price':
      return adapter.capabilities.currentPrice;
    case 'historical_price':
      return adapter.capabilities.historicalPrice;
    case 'list_price':
      return adapter.capabilities.listPrice;
    default:
      return false;
  }
}
