/**
 * Sticky observation — Price Memory + evidencia rica (reuse enrichParsedOffer).
 * Nunca inventa título/imagen/precio. Nunca inserta ofertas.
 */

import { sleep } from '@/lib/bots/ingest/ingestHttp';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  computeMlPriceIntel,
  loadMlDailyHistory,
  normalizeMlProductId,
  recordMlDailySnapshots,
  ML_PRICE_TZ,
} from '@/lib/bots/ingest/mlPriceEngine';
import { fetchMlItemPriceQuote } from '@/lib/bots/ingest/mlPricesApi';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { createServerClient } from '@/lib/supabase/server';
import { enrichParsedOfferMetadata } from '@/lib/hunter/enrichment/enrichParsedOffer';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';
import { toSupplyCandidate } from './candidate';
import { selectStickySkuTargets, type StickySkuTarget } from './stickySku';
import type { SupplyCandidate } from './types';

export type StickyFunnelCounters = {
  stickyCandidates: number;
  stickyObserved: number;
  stickyFailed: number;
  stickySkippedCooldown: number;
  pdpAttempted: number;
  pdpSuccess: number;
  evidenceRich: number;
  snapshotOnly: number;
};

export type StickyObserveReport = StickyFunnelCounters & {
  candidates: SupplyCandidate[];
  targets: StickySkuTarget[];
};

export function permalinkFromMlItemId(itemId: string): string {
  const compact = itemId.replace(/-/g, '').toUpperCase();
  const m = /^(ML[A-Z]{0,3})(\d+)$/i.exec(compact);
  if (!m) return `https://articulo.mercadolibre.com.mx/${compact}`;
  return `https://articulo.mercadolibre.com.mx/${m[1]!.toUpperCase()}-${m[2]}`;
}

export function isStickyEvidenceRich(meta: ParsedOfferMetadata): boolean {
  const title = (meta.title ?? '').trim();
  const titleOk = title.length >= 8 && !/^Mercado Libre ML/i.test(title);
  const imageOk = isValidOfferImage(meta.imageUrl);
  const priceOk = Number.isFinite(meta.discountPrice) && meta.discountPrice > 0;
  const originalOk =
    meta.originalPrice != null &&
    Number.isFinite(meta.originalPrice) &&
    meta.originalPrice > meta.discountPrice;
  return titleOk && imageOk && priceOk && originalOk;
}

function emptyReport(): StickyObserveReport {
  return {
    stickyCandidates: 0,
    stickyObserved: 0,
    stickyFailed: 0,
    stickySkippedCooldown: 0,
    pdpAttempted: 0,
    pdpSuccess: 0,
    evidenceRich: 0,
    snapshotOnly: 0,
    candidates: [],
    targets: [],
  };
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
    /* optional */
  }
  return null;
}

/**
 * Observa sticky SKUs: snapshot siempre; candidato solo con evidencia real (no inventada).
 */
export async function observeStickySkus(opts: {
  config: BotIngestConfig;
  nicheId: string;
  persistSnapshots: boolean;
  maxTargets?: number;
  supabase?: ReturnType<typeof createServerClient> | null;
  now?: Date;
  selectTargets?: typeof selectStickySkuTargets;
  fetchQuote?: typeof fetchMlItemPriceQuote;
  enrichMeta?: typeof enrichParsedOfferMetadata;
}): Promise<StickyObserveReport> {
  const report = emptyReport();

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
  const enrichMeta = opts.enrichMeta ?? enrichParsedOfferMetadata;
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
  report.targets = targets;
  report.stickyCandidates = targets.length;
  if (targets.length === 0) return report;

  for (const target of targets) {
    const productId = normalizeMlProductId(target.productId);
    if (!productId) {
      report.stickyFailed += 1;
      continue;
    }

    try {
      const permalink = permalinkFromMlItemId(productId);
      const resolved = resolveMercadoLibreItem(permalink);
      const canonicalUrl = resolved?.canonicalUrl || permalink;

      const fallbackCurrent = target.lastPrice && target.lastPrice > 0 ? target.lastPrice : 1;
      const quote = await fetchQuote(
        productId,
        {
          current: fallbackCurrent,
          listPrice: target.listPrice,
          regularPrice: null,
        },
        { url: canonicalUrl },
      );

      if (!Number.isFinite(quote.current) || quote.current <= 0) {
        report.stickyFailed += 1;
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
      report.stickyObserved += 1;

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
      const apiOriginal =
        quote.listPrice != null && quote.listPrice > quote.current
          ? quote.listPrice
          : quote.regularPrice != null && quote.regularPrice > quote.current
            ? quote.regularPrice
            : null;
      // No usar target.listPrice histórico como “original” de etiqueta — solo quote actual.
      const original = apiOriginal;
      const discountPercent =
        original != null && original > quote.current
          ? Math.round((1 - quote.current / original) * 100)
          : 0;

      // Título/imagen: solo evidencias reales (DB previa o enrichment). Nunca placeholder inventado.
      let meta: ParsedOfferMetadata = {
        canonicalUrl,
        title: offerMeta?.title?.trim() || '',
        store: 'Mercado Libre',
        imageUrl: offerMeta?.imageUrl ?? '',
        discountPrice: quote.current,
        originalPrice: original,
        discountPercent,
        signals: {
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance:
            original != null ? 'source_explicit' : 'unknown',
          discountPercentProvenance: discountPercent > 0 ? 'derived' : 'unknown',
          categoryId: null,
        },
      };

      meta = applyMlPriceIntelToMeta(meta, { quote, intel }, { preserveLabelDiscount: true });

      report.pdpAttempted += 1;
      const enriched = await enrichMeta(meta, {
        source: 'ml_api',
        sourceDetail: `ml:sticky:${productId}|niche:${opts.nicheId}|mode:sticky`,
        skipHtml: isValidOfferImage(meta.imageUrl) && (meta.title?.trim().length ?? 0) >= 10,
      });
      meta = enriched.meta;

      const titleOk = (meta.title ?? '').trim().length >= 8;
      const imageOk = isValidOfferImage(meta.imageUrl);
      if (titleOk || imageOk || (meta.originalPrice != null && meta.originalPrice > meta.discountPrice)) {
        report.pdpSuccess += 1;
      }

      // Sin título real → no candidato DQE (sí snapshot). Fail-closed, no inventar.
      if (!(meta.title ?? '').trim()) {
        report.snapshotOnly += 1;
        await sleep(120);
        continue;
      }

      if (isStickyEvidenceRich(meta)) {
        report.evidenceRich += 1;
      }

      const item = {
        url: meta.canonicalUrl,
        source: 'ml_api' as const,
        sourceDetail: `ml:sticky:${productId}|niche:${opts.nicheId}|mode:sticky`,
        precomputedMeta: meta,
      };

      report.candidates.push(
        toSupplyCandidate({
          item,
          hunterSourceId: 'ml_api_legacy',
          sourceId: 'ml_api_legacy',
          sourceFamily: 'official_api',
          sourceType: 'official_api',
        }),
      );
      await sleep(120);
    } catch {
      report.stickyFailed += 1;
    }
  }

  return report;
}
