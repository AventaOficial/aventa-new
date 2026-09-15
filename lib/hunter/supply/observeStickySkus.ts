/**
 * Sticky observation — re-observa SKUs history-ready vía Price API.
 * Produce candidatos normalizados al pipeline Supply (DQE/Evidence/DealSignals).
 * Nunca inserta ofertas. Nunca aprueba. Nunca toca money.
 */

import { sleep } from '@/lib/bots/ingest/ingestHttp';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  computeMlPriceIntel,
  loadMlDailyHistory,
  normalizeMlProductId,
  recordMlDailySnapshots,
} from '@/lib/bots/ingest/mlPriceEngine';
import { fetchMlItemPriceQuote } from '@/lib/bots/ingest/mlPricesApi';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { ML_PRICE_TZ } from '@/lib/bots/ingest/mlPriceEngine';
import { createServerClient } from '@/lib/supabase/server';
import { toSupplyCandidate } from './candidate';
import { selectStickySkuTargets, type StickySkuTarget } from './stickySku';
import type { SupplyCandidate } from './types';

export type StickyObserveReport = {
  stickyCandidates: number;
  stickyObserved: number;
  stickyFailed: number;
  stickySkippedCooldown: number;
  candidates: SupplyCandidate[];
  targets: StickySkuTarget[];
};

function permalinkFromMlItemId(itemId: string): string {
  const compact = itemId.replace(/-/g, '').toUpperCase();
  const m = /^(ML[A-Z]{0,3})(\d+)$/i.exec(compact);
  if (!m) return `https://articulo.mercadolibre.com.mx/${compact}`;
  return `https://articulo.mercadolibre.com.mx/${m[1]!.toUpperCase()}-${m[2]}`;
}

async function lookupOfferMeta(
  productId: string,
  supabase: ReturnType<typeof createServerClient> | null,
): Promise<{ title: string; imageUrl: string } | null> {
  if (!supabase) return null;
  const needle = productId.replace(/-/g, '');
  try {
    const { data } = await supabase
      .from('offers')
      .select('title, image_url, url')
      .ilike('url', `%${needle.slice(-10)}%`)
      .order('created_at', { ascending: false })
      .limit(3);
    for (const row of data ?? []) {
      const url = String((row as { url?: string }).url ?? '');
      if (!url.toUpperCase().includes(needle.toUpperCase()) && !url.includes(productId)) continue;
      const title = String((row as { title?: string }).title ?? '').trim();
      if (title.length < 3) continue;
      return {
        title,
        imageUrl: String((row as { image_url?: string | null }).image_url ?? ''),
      };
    }
  } catch {
    /* optional enrichment */
  }
  return null;
}

/**
 * Observa sticky SKUs: snapshot + candidato con discoveryMode sticky.
 */
export async function observeStickySkus(opts: {
  config: BotIngestConfig;
  nicheId: string;
  persistSnapshots: boolean;
  maxTargets?: number;
  supabase?: ReturnType<typeof createServerClient> | null;
  now?: Date;
  /** Inyectable en tests. */
  selectTargets?: typeof selectStickySkuTargets;
  fetchQuote?: typeof fetchMlItemPriceQuote;
}): Promise<StickyObserveReport> {
  const empty: StickyObserveReport = {
    stickyCandidates: 0,
    stickyObserved: 0,
    stickyFailed: 0,
    stickySkippedCooldown: 0,
    candidates: [],
    targets: [],
  };

  let client = opts.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      client = null;
    }
  }

  const select = opts.selectTargets ?? selectStickySkuTargets;
  const fetchQuote = opts.fetchQuote ?? fetchMlItemPriceQuote;
  const maxTargets =
    opts.maxTargets ??
    Math.min(
      opts.config.mlMaxCollect,
      Number.parseInt(process.env.SUPPLY_STICKY_MAX_PER_WAVE ?? '12', 10) || 12,
    );

  const targets = await select({
    supabase: client,
    now: opts.now,
    config: { maxTargets },
  });

  if (targets.length === 0) return empty;

  const candidates: SupplyCandidate[] = [];
  let stickyObserved = 0;
  let stickyFailed = 0;

  for (const target of targets) {
    const productId = normalizeMlProductId(target.productId);
    if (!productId) {
      stickyFailed += 1;
      continue;
    }
    try {
      const fallbackCurrent = target.lastPrice && target.lastPrice > 0 ? target.lastPrice : 1;
      const quote = await fetchQuote(
        productId,
        {
          current: fallbackCurrent,
          listPrice: target.listPrice,
          regularPrice: null,
        },
        { url: permalinkFromMlItemId(productId) },
      );

      if (!Number.isFinite(quote.current) || quote.current <= 0) {
        stickyFailed += 1;
        continue;
      }

      if (opts.persistSnapshots) {
        await recordMlDailySnapshots([
          {
            productId,
            current: quote.current,
            listPrice: quote.listPrice,
            regularPrice: quote.regularPrice,
          },
        ]);
      }

      const history = await loadMlDailyHistory(productId);
      const today = formatYmdInTz(opts.now ?? new Date(), ML_PRICE_TZ);
      const intel = computeMlPriceIntel(
        {
          current: quote.current,
          listPrice: quote.listPrice,
          regularPrice: quote.regularPrice,
        },
        history,
        today,
      );

      const offerMeta = await lookupOfferMeta(productId, client);
      const original =
        quote.listPrice != null && quote.listPrice > quote.current
          ? quote.listPrice
          : quote.regularPrice != null && quote.regularPrice > quote.current
            ? quote.regularPrice
            : target.listPrice != null && target.listPrice > quote.current
              ? target.listPrice
              : null;
      const discountPercent =
        original != null && original > quote.current
          ? Math.round((1 - quote.current / original) * 100)
          : 0;

      let meta: ParsedOfferMetadata = {
        canonicalUrl: permalinkFromMlItemId(productId),
        title: offerMeta?.title ?? `Mercado Libre ${productId}`,
        store: 'Mercado Libre',
        imageUrl: offerMeta?.imageUrl ?? '',
        discountPrice: quote.current,
        originalPrice: original,
        discountPercent,
      };

      meta = applyMlPriceIntelToMeta(
        meta,
        { quote, intel },
        { preserveLabelDiscount: true },
      );

      const item = {
        url: meta.canonicalUrl,
        source: 'ml_api' as const,
        sourceDetail: `ml:sticky:${productId}|niche:${opts.nicheId}|mode:sticky`,
        precomputedMeta: meta,
      };

      candidates.push(
        toSupplyCandidate({
          item,
          hunterSourceId: 'ml_api_legacy',
          sourceId: 'ml_api_legacy',
          sourceFamily: 'official_api',
          sourceType: 'official_api',
        }),
      );
      stickyObserved += 1;
      await sleep(120);
    } catch {
      stickyFailed += 1;
    }
  }

  return {
    stickyCandidates: targets.length,
    stickyObserved,
    stickyFailed,
    stickySkippedCooldown: 0,
    candidates,
    targets,
  };
}
