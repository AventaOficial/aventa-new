/**
 * Mercado Libre price adapter — capability-gated, dry-run without live fetch.
 *
 * Reuses existing mlPricesApi quote path. Never inserts offers.
 */

import { fetchMlItemPriceQuote } from '@/lib/bots/ingest/mlPricesApi';
import { extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';
import { provenanceFromApiQuote } from '../priceProvenance';
import type { PriceProvenance } from '../types';
import type {
  FetchCurrentPriceInput,
  FetchCurrentPriceResult,
  FetchPriceHistoryInput,
  FetchPriceHistoryResult,
  PriceSourceAdapter,
} from './types';

export const MERCADOLIBRE_ADAPTER_ID = 'mercadolibre' as const;

function readMlLiveEnabled(): boolean {
  const explicit = (process.env.SUPPLY_INTELLIGENCE_ML_LIVE ?? '').trim().toLowerCase();
  if (explicit === '0' || explicit === 'false' || explicit === 'no') return false;
  if (explicit === '1' || explicit === 'true' || explicit === 'yes') return true;
  // Default: anonymous public API is allowed (same as ingest mlPricesApi fallback).
  return true;
}

function resolveItemId(url: string, canonicalUrl?: string | null): string | null {
  return (
    extractMercadoLibreItemId(canonicalUrl ?? url) ??
    extractMercadoLibreItemId(url)
  );
}

export function createMercadoLibrePriceAdapter(): PriceSourceAdapter {
  return {
    id: MERCADOLIBRE_ADAPTER_ID,
    displayName: 'Mercado Libre',
    capabilities: {
      currentPrice: true,
      historicalPrice: false, // history via mlPriceEngine — gated separately in S8+
      listPrice: true,
    },
    isLiveEnabled(): boolean {
      return readMlLiveEnabled();
    },
    async fetchCurrentPrice(input: FetchCurrentPriceInput): Promise<FetchCurrentPriceResult> {
      const t0 = Date.now();
      const itemId = resolveItemId(input.url, input.canonicalUrl);
      const fallbackSale = input.fallbackSalePrice ?? null;
      const fallbackList = input.fallbackListPrice ?? null;

      if (!readMlLiveEnabled()) {
        return {
          ok: false,
          dryRun: true,
          salePrice: fallbackSale != null
            ? {
                amount: fallbackSale,
                kind: 'candidate_declared',
                source: MERCADOLIBRE_ADAPTER_ID,
                observedAt: new Date().toISOString(),
                trusted: true,
              }
            : null,
          listPrice: null,
          errorCode: 'live_disabled',
          latencyMs: Date.now() - t0,
        };
      }

      if (!itemId) {
        return {
          ok: false,
          dryRun: true,
          salePrice: fallbackSale != null
            ? {
                amount: fallbackSale,
                kind: 'candidate_declared',
                source: MERCADOLIBRE_ADAPTER_ID,
                observedAt: new Date().toISOString(),
                trusted: true,
              }
            : null,
          listPrice: null,
          errorCode: 'missing_item_id',
          latencyMs: Date.now() - t0,
        };
      }

      try {
        const quote = await fetchMlItemPriceQuote(
          itemId,
          {
            current: fallbackSale ?? 0,
            listPrice: fallbackList,
            regularPrice: null,
          },
          { url: input.canonicalUrl ?? input.url },
        );

        const mapped = provenanceFromApiQuote({
          adapterId: MERCADOLIBRE_ADAPTER_ID,
          saleAmount: quote.current,
          listAmount: quote.listPrice,
        });

        return {
          ok: true,
          dryRun: false,
          salePrice: mapped.sale,
          listPrice: mapped.list,
          errorCode: null,
          latencyMs: Date.now() - t0,
        };
      } catch {
        const saleProv: PriceProvenance | null =
          fallbackSale != null
            ? {
                amount: fallbackSale,
                kind: 'candidate_declared',
                source: MERCADOLIBRE_ADAPTER_ID,
                observedAt: new Date().toISOString(),
                trusted: true,
              }
            : null;
        return {
          ok: false,
          dryRun: true,
          salePrice: saleProv,
          listPrice: null,
          errorCode: 'fetch_failed',
          latencyMs: Date.now() - t0,
        };
      }
    },
    async fetchPriceHistory(input: FetchPriceHistoryInput): Promise<FetchPriceHistoryResult> {
      void input;
      return {
        ok: false,
        dryRun: true,
        points: [],
        lowestInWindow: null,
        errorCode: 'capability_not_enabled',
        latencyMs: 0,
      };
    },
  };
}
