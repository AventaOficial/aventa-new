/**
 * Demand features from already-aggregated counts.
 * Raw events are not ranking inputs. User ids never enter this layer.
 */

import { recordDemandWindow } from '@/lib/intelligence/telemetry';

export const DEMAND_WINDOW_MAX_HOURS = 24 * 7;
export const DEMAND_OFFER_LIMIT = 100;

export type OfferDemandCounts = {
  offerId: string;
  category: string | null;
  retailer: string | null;
  views: number;
  outbound: number;
  votes: number;
  saves: number;
  comments: number;
};

export type DemandSlice = {
  key: string;
  offers: number;
  views: number;
  outbound: number;
  votes: number;
  saves: number;
  comments: number;
  /** Outbound / views. Null when there are no views. */
  outboundRate: number | null;
  engagementRate: number | null;
};

export type DemandFeatures = {
  windowNote: 'counts_only_no_user_ids';
  offers: number;
  byCategory: DemandSlice[];
  byRetailer: DemandSlice[];
  /** Offers whose outbound rate is high enough to be a ranking candidate later. Not applied to rank. */
  attractiveOfferIds: string[];
};

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 10000) / 10000;
}

function slice(rows: OfferDemandCounts[], pick: (row: OfferDemandCounts) => string | null): DemandSlice[] {
  const groups = new Map<string, OfferDemandCounts[]>();
  for (const row of rows) {
    const key = pick(row)?.trim() || 'unknown';
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const views = list.reduce((acc, row) => acc + row.views, 0);
      const outbound = list.reduce((acc, row) => acc + row.outbound, 0);
      const votes = list.reduce((acc, row) => acc + row.votes, 0);
      const saves = list.reduce((acc, row) => acc + row.saves, 0);
      const comments = list.reduce((acc, row) => acc + row.comments, 0);
      return {
        key,
        offers: list.length,
        views,
        outbound,
        votes,
        saves,
        comments,
        outboundRate: rate(outbound, views),
        engagementRate: rate(votes + saves + comments, views),
      };
    })
    .sort((a, b) => b.outbound - a.outbound || b.views - a.views);
}

export function buildDemandFeatures(rows: OfferDemandCounts[]): DemandFeatures {
  recordDemandWindow();
  const bounded = rows.slice(0, DEMAND_OFFER_LIMIT);
  const attractiveOfferIds = bounded
    .filter((row) => row.views >= 5 && row.outbound / row.views >= 0.08)
    .sort((a, b) => b.outbound / Math.max(b.views, 1) - a.outbound / Math.max(a.views, 1))
    .map((row) => row.offerId);

  return {
    windowNote: 'counts_only_no_user_ids',
    offers: bounded.length,
    byCategory: slice(bounded, (row) => row.category),
    byRetailer: slice(bounded, (row) => row.retailer),
    attractiveOfferIds,
  };
}

export function clampDemandWindowHours(hours: number): number {
  if (!Number.isFinite(hours) || hours < 1) return 24;
  return Math.min(DEMAND_WINDOW_MAX_HOURS, Math.floor(hours));
}
