/**
 * Price Memory–driven discovery source.
 * Discovers product candidates from near-ready sticky + evidence-backed PM products —
 * not manual URL paste.
 *
 * Does NOT invent list prices, discounts, or images. Enrichment is the pipeline's job.
 */

import type { IngestItem } from '@/lib/bots/ingest/types';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  selectNearReadyStickyTargets,
  type NearReadyStickyTarget,
} from '@/lib/hunter/supply/nearReadySticky';
import { createServerClient } from '@/lib/supabase/server';
import {
  ML_PRICE_MARKETPLACE,
  ML_PRICE_MIN_HISTORY_DAYS,
  ML_PRICE_TZ,
} from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { ingestItemToCandidate } from '@/lib/hunter/normalize';
import type {
  HunterCandidate,
  HunterCollectContext,
  HunterCollectResult,
  HunterSourceId,
} from '@/lib/hunter/types';
import { listDiscoveryEvidenceProductIds } from './censusSeedEnrichment';
import { selectHistoryReadyReactivationTargets } from './historyReadyReactivation';

export const STICKY_NEAR_READY_SOURCE_ID = 'sticky_near_ready' as const;
export const PM_EVIDENCE_SOURCE_ID = 'pm_evidence_backed' as const;
/** Day 11 — re-acquire SKUs that already meet historyReady. */
export const STICKY_HISTORY_READY_SOURCE_ID = 'sticky_history_ready' as const;

export type StickyNearReadySourceId = typeof STICKY_NEAR_READY_SOURCE_ID;

export type NearReadyBucket = '1d' | '2d' | '3d_plus';

export function nearReadyBucketForDays(daysUntilReady: number): NearReadyBucket {
  if (daysUntilReady === 1) return '1d';
  if (daysUntilReady === 2) return '2d';
  return '3d_plus';
}

function mlProductUrl(productId: string): string {
  const id = productId.trim().toUpperCase();
  if (/^MLM\d+$/i.test(id) && id.length > 12) {
    return `https://articulo.mercadolibre.com.mx/${id.replace(/^MLM/i, 'MLM-')}-_JM`;
  }
  return `https://www.mercadolibre.com.mx/p/${id}`;
}

function isHomepageOrNonProduct(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || path === '') return true;
    if (/^\/(ofertas|categorias?|ayuda|login|registration)(\/|$)/i.test(path)) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Discovery-only ingest item. Sale price is last observed tip for prioritization —
 * not a fabricated deal. originalPrice stays null until real enrichment.
 */
export function nearReadyTargetToIngestItem(
  target: NearReadyStickyTarget,
  detectedAt: string,
): IngestItem | null {
  if (!(target.lastPrice != null && target.lastPrice > 0)) return null;
  const url = mlProductUrl(target.productId);
  if (isHomepageOrNonProduct(url)) return null;

  const meta: ParsedOfferMetadata = {
    canonicalUrl: url,
    title: `Producto ${target.productId}`,
    store: 'Mercado Libre',
    imageUrl: '',
    discountPrice: target.lastPrice,
    originalPrice: null,
    discountPercent: 0,
    signals: {
      historyReady: false,
    },
  };

  return {
    url,
    source: 'ml_api',
    sourceDetail: `sticky_near_ready|priorDays:${target.priorDays}|daysUntilReady:${target.daysUntilReady}|detectedAt:${detectedAt}`,
    precomputedMeta: meta,
  };
}

function candidateFromProductId(
  productId: string,
  lastPrice: number,
  detectedAt: string,
  detail: string,
  extraMeta: Record<string, unknown>,
): HunterCandidate | null {
  const target: NearReadyStickyTarget = {
    productId,
    priorDays: ML_PRICE_MIN_HISTORY_DAYS,
    daysUntilReady: 0,
    lastObservedOn: detectedAt.slice(0, 10),
    lastPrice,
    hoursSinceObserved: 24,
    marketplace: ML_PRICE_MARKETPLACE,
  };
  const item = nearReadyTargetToIngestItem(target, detectedAt);
  if (!item) return null;
  item.sourceDetail = detail;
  const cand = ingestItemToCandidate(item, 'ml_api_legacy' as HunterSourceId, detectedAt);
  cand.rawMetadata = {
    ...cand.rawMetadata,
    ...extraMeta,
    productId,
    priceMemoryDriven: true,
  };
  return cand;
}

export async function collectStickyNearReadyCandidates(
  ctx: HunterCollectContext,
  opts?: { maxTargets?: number; cooldownHours?: number },
): Promise<HunterCollectResult> {
  const detectedAt = (ctx.now ?? new Date()).toISOString();
  try {
    const report = await selectNearReadyStickyTargets({
      config: {
        maxTargets: opts?.maxTargets ?? 24,
        cooldownHours: opts?.cooldownHours ?? 1,
      },
    });

    const candidates: HunterCandidate[] = [];
    for (const t of report.targets) {
      const item = nearReadyTargetToIngestItem(t, detectedAt);
      if (!item) continue;
      const cand = ingestItemToCandidate(item, 'ml_api_legacy' as HunterSourceId, detectedAt);
      cand.rawMetadata = {
        ...cand.rawMetadata,
        discoverySource: STICKY_NEAR_READY_SOURCE_ID,
        productId: t.productId,
        priorDays: t.priorDays,
        daysUntilReady: t.daysUntilReady,
        nearReadyBucket: nearReadyBucketForDays(t.daysUntilReady),
        priceMemoryDriven: true,
      };
      candidates.push(cand);
    }

    return {
      ok: true,
      candidates,
      itemsFound: candidates.length,
      collectedCount: candidates.length,
      skipReasonCounts:
        report.poolNearReady === 0
          ? { empty_near_ready_pool: 1 }
          : {
              pool_one_day: report.poolOneDayAway,
              pool_two: report.poolTwoDaysAway,
              pool_three: report.poolThreeDaysAway,
              budget_limited: report.budgetLimited,
            },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      candidates: [],
      itemsFound: 0,
      errorCode: 'sticky_near_ready_error',
      errorMessageSafe: message.slice(0, 160),
    };
  }
}

/**
 * Discover PM products that intersect staging discovery evidence (by product_id).
 * URLs come from product_id already in Price Memory — not operator paste.
 */
export async function collectPmEvidenceBackedCandidates(
  ctx: HunterCollectContext,
  opts?: { maxTargets?: number },
): Promise<HunterCollectResult> {
  const detectedAt = (ctx.now ?? new Date()).toISOString();
  const maxTargets = opts?.maxTargets ?? 8;
  const evidenceIds = listDiscoveryEvidenceProductIds();
  if (evidenceIds.length === 0) {
    return {
      ok: true,
      candidates: [],
      itemsFound: 0,
      skipReasonCounts: { no_discovery_evidence: 1 },
    };
  }

  try {
    let client: ReturnType<typeof createServerClient>;
    try {
      client = createServerClient();
    } catch {
      return {
        ok: true,
        candidates: [],
        itemsFound: 0,
        skipReasonCounts: { no_supabase: 1 },
      };
    }

    const todayYmd = formatYmdInTz(ctx.now ?? new Date(), ML_PRICE_TZ);
    const { data, error } = await client
      .from('product_price_snapshots')
      .select('product_id, last_price, recorded_on')
      .eq('marketplace', ML_PRICE_MARKETPLACE)
      .in('product_id', evidenceIds)
      .lt('recorded_on', todayYmd)
      .order('recorded_on', { ascending: false })
      .limit(2000);

    if (error) {
      return {
        ok: false,
        candidates: [],
        itemsFound: 0,
        errorCode: 'pm_evidence_query_error',
        errorMessageSafe: error.message.slice(0, 160),
      };
    }

    const latest = new Map<string, number>();
    const dayCounts = new Map<string, Set<string>>();
    for (const row of data ?? []) {
      const id = String((row as { product_id: string }).product_id).toUpperCase();
      const price = Number((row as { last_price?: number }).last_price);
      const on = String((row as { recorded_on: string }).recorded_on).slice(0, 10);
      if (!dayCounts.has(id)) dayCounts.set(id, new Set());
      dayCounts.get(id)!.add(on);
      if (!latest.has(id) && Number.isFinite(price) && price > 0) {
        latest.set(id, price);
      }
    }

    const ranked = [...latest.entries()]
      .map(([productId, lastPrice]) => ({
        productId,
        lastPrice,
        priorDays: dayCounts.get(productId)?.size ?? 0,
      }))
      .sort((a, b) => b.priorDays - a.priorDays || a.productId.localeCompare(b.productId))
      .slice(0, maxTargets);

    const candidates: HunterCandidate[] = [];
    for (const row of ranked) {
      const cand = candidateFromProductId(
        row.productId,
        row.lastPrice,
        detectedAt,
        `pm_evidence_backed|priorDays:${row.priorDays}|detectedAt:${detectedAt}`,
        {
          discoverySource: PM_EVIDENCE_SOURCE_ID,
          priorDays: row.priorDays,
          daysUntilReady: Math.max(0, ML_PRICE_MIN_HISTORY_DAYS - row.priorDays),
        },
      );
      if (cand) candidates.push(cand);
    }

    return {
      ok: true,
      candidates,
      itemsFound: candidates.length,
      collectedCount: candidates.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      candidates: [],
      itemsFound: 0,
      errorCode: 'pm_evidence_error',
      errorMessageSafe: message.slice(0, 160),
    };
  }
}

/**
 * Day 11 — reacquire historyReady SKUs (priorDays ≥ ML_PRICE_MIN_HISTORY_DAYS).
 * Prefer approx-activated-today. Still must pass DQE/S6.1 unchanged.
 */
export async function collectHistoryReadyReactivationCandidates(
  ctx: HunterCollectContext,
  opts?: { maxTargets?: number; cooldownHours?: number },
): Promise<HunterCollectResult> {
  const detectedAt = (ctx.now ?? new Date()).toISOString();
  try {
    const report = await selectHistoryReadyReactivationTargets({
      maxTargets: opts?.maxTargets ?? 8,
      cooldownHours: opts?.cooldownHours ?? 1,
      now: ctx.now,
    });

    const candidates: HunterCandidate[] = [];
    for (const t of report.targets) {
      if (t.lastPrice == null || !(t.lastPrice > 0)) continue;
      const cand = candidateFromProductId(
        t.productId,
        t.lastPrice,
        detectedAt,
        `sticky_history_ready|priorDays:${t.priorDays}|activated:${t.activatedToday}|detectedAt:${detectedAt}`,
        {
          discoverySource: STICKY_HISTORY_READY_SOURCE_ID,
          priorDays: t.priorDays,
          daysUntilReady: 0,
          historyReadyActivated: t.activatedToday,
          priceMemoryDriven: true,
        },
      );
      if (cand) {
        cand.rawMetadata = {
          ...cand.rawMetadata,
          discoverySource: STICKY_HISTORY_READY_SOURCE_ID,
          productId: t.productId,
          priorDays: t.priorDays,
          daysUntilReady: 0,
          historyReadyActivated: t.activatedToday,
          priceMemoryDriven: true,
        };
        candidates.push(cand);
      }
    }

    return {
      ok: true,
      candidates,
      itemsFound: candidates.length,
      collectedCount: candidates.length,
      skipReasonCounts: {
        pool_history_ready: report.poolHistoryReady,
        pool_activated_today: report.poolActivatedToday,
        cooldown_skipped: report.cooldownSkipped,
        observed_today_skipped: report.observedTodaySkipped,
        budget_limited: report.budgetLimited,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      candidates: [],
      itemsFound: 0,
      errorCode: 'sticky_history_ready_error',
      errorMessageSafe: message.slice(0, 160),
    };
  }
}
