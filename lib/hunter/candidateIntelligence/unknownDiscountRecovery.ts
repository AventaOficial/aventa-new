/**
 * UNKNOWN discount recovery — observation / shadow only.
 *
 * Tries Price Memory (product_price_snapshots) for a historical reference price.
 * NEVER invents original_price for productive gates.
 * NEVER changes the 25% business threshold.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCanonicalDiscount } from '@/lib/bots/ingest/canonicalDiscount';
import type { DiscountClass } from './discountClass';

export type UnknownRecoveryResult = {
  recovered: boolean;
  historicalPrice: number | null;
  shadowDiscountPercentage: number | null;
  shadowDiscountClass: DiscountClass | null;
  reason:
    | 'not_unknown'
    | 'no_sale_price'
    | 'no_item_id'
    | 'no_client'
    | 'no_history'
    | 'history_not_above_sale'
    | 'recovered_shadow';
  samples: number;
};

function extractMlItemId(input: {
  itemId?: string | null;
  canonicalUrl?: string | null;
}): string | null {
  const direct = (input.itemId ?? '').trim().toUpperCase();
  if (/^MLM\d{8,}$/i.test(direct)) return direct;
  const url = (input.canonicalUrl ?? '').trim();
  const m =
    /(?:MLM-?)(\d{8,})/i.exec(url) ??
    /mercadolibre\.com\.mx\/.*?\/(MLM\d{8,})/i.exec(url);
  if (!m) return null;
  const digits = m[1]!.replace(/\D/g, '');
  return digits ? `MLM${digits}` : null;
}

/**
 * Look up max observed list/last price for an ML item (90d window).
 * Shadow reference only — does not write offers or pass productive gates.
 */
export async function recoverUnknownDiscountShadow(input: {
  supabase?: SupabaseClient | null;
  salePrice: number | null | undefined;
  originalPrice?: number | null | undefined;
  itemId?: string | null;
  canonicalUrl?: string | null;
  lookbackDays?: number;
  realGoodMinPercent?: number;
}): Promise<UnknownRecoveryResult> {
  const sale =
    typeof input.salePrice === 'number' && Number.isFinite(input.salePrice) && input.salePrice > 0
      ? input.salePrice
      : null;
  const original =
    typeof input.originalPrice === 'number' &&
    Number.isFinite(input.originalPrice) &&
    input.originalPrice > 0
      ? input.originalPrice
      : null;

  if (original != null && sale != null && original > sale) {
    return {
      recovered: false,
      historicalPrice: null,
      shadowDiscountPercentage: null,
      shadowDiscountClass: null,
      reason: 'not_unknown',
      samples: 0,
    };
  }
  if (sale == null) {
    return {
      recovered: false,
      historicalPrice: null,
      shadowDiscountPercentage: null,
      shadowDiscountClass: null,
      reason: 'no_sale_price',
      samples: 0,
    };
  }

  const productId = extractMlItemId(input);
  if (!productId) {
    return {
      recovered: false,
      historicalPrice: null,
      shadowDiscountPercentage: null,
      shadowDiscountClass: null,
      reason: 'no_item_id',
      samples: 0,
    };
  }
  if (!input.supabase) {
    return {
      recovered: false,
      historicalPrice: null,
      shadowDiscountPercentage: null,
      shadowDiscountClass: null,
      reason: 'no_client',
      samples: 0,
    };
  }

  const lookbackDays = Math.min(180, Math.max(7, input.lookbackDays ?? 90));
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);

  try {
    const { data, error } = await input.supabase
      .from('product_price_snapshots')
      .select('last_price, list_price, regular_price, recorded_on')
      .eq('product_id', productId)
      .gte('recorded_on', since)
      .limit(120);

    if (error || !data || data.length === 0) {
      return {
        recovered: false,
        historicalPrice: null,
        shadowDiscountPercentage: null,
        shadowDiscountClass: null,
        reason: 'no_history',
        samples: 0,
      };
    }

    let maxRef = 0;
    for (const row of data as Array<{
      last_price?: number | null;
      list_price?: number | null;
      regular_price?: number | null;
    }>) {
      for (const raw of [row.list_price, row.regular_price, row.last_price]) {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (Number.isFinite(n) && n > maxRef) maxRef = n;
      }
    }

    if (!(maxRef > sale)) {
      return {
        recovered: false,
        historicalPrice: maxRef > 0 ? maxRef : null,
        shadowDiscountPercentage: null,
        shadowDiscountClass: null,
        reason: 'history_not_above_sale',
        samples: data.length,
      };
    }

    // Shadow-only: use Price Memory max as reference original. Never written to listing.
    const canonical = resolveCanonicalDiscount({
      salePrice: sale,
      originalPrice: maxRef,
      historicalPrice: maxRef,
      realGoodMinPercent: input.realGoodMinPercent ?? 25,
    });

    return {
      recovered: true,
      historicalPrice: maxRef,
      shadowDiscountPercentage: canonical.discountPercentage,
      shadowDiscountClass: canonical.discountClass,
      reason: 'recovered_shadow',
      samples: data.length,
    };
  } catch {
    return {
      recovered: false,
      historicalPrice: null,
      shadowDiscountPercentage: null,
      shadowDiscountClass: null,
      reason: 'no_history',
      samples: 0,
    };
  }
}
