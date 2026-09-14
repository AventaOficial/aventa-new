/**
 * Funnel metrics: supply → pending → human decision → live.
 * Combina hunter_supply_runs (discovered/qualified/pending inserts) +
 * moderation_outcomes (decisiones) + offers (stock live/pending).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { MODERATION_OUTCOME_TABLE } from './contract';

export type SupplyFunnelWindow = {
  sinceIso: string;
  untilIso: string;
};

export type SupplyFunnelBreakdownKey =
  | 'source'
  | 'source_lane'
  | 'priority'
  | 'quality_classification';

export type SupplyFunnelCounts = {
  discovered: number | null;
  qualified: number | null;
  pendingInserted: number | null;
  pendingStock: number | null;
  humanDecisions: number | null;
  approved: number | null;
  rejected: number | null;
  snoozed: number | null;
  claimed: number | null;
  liveStock: number | null;
};

export type SupplyFunnelRates = {
  discoveredToQualified: number | null;
  qualifiedToPending: number | null;
  pendingToApproved: number | null;
  pendingToRejected: number | null;
  pendingToSnoozed: number | null;
  /** approved outcomes in window that correspond to currently live offers / approved in window */
  approvedToLive: number | null;
  /** Pending→Live: live created via approve in window / (approve+reject) decisions */
  pendingToLive: number | null;
};

export type SupplyFunnelTiming = {
  medianDecisionMs: number | null;
  medianApproveToLiveMs: number | null;
};

export type SupplyFunnelSnapshot = {
  window: SupplyFunnelWindow;
  counts: SupplyFunnelCounts;
  rates: SupplyFunnelRates;
  timing: SupplyFunnelTiming;
  /** Porcentaje 0–100 con 1 decimal, o null. */
  pendingToLivePct: number | null;
  medianDecisionMinutes: number | null;
  note: string;
};

function rate(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den <= 0) return null;
  return Math.round((num / den) * 1000) / 1000;
}

function pct(num: number | null, den: number | null): number | null {
  const r = rate(num, den);
  return r == null ? null : Math.round(r * 1000) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return Math.round(sorted[mid]!);
}

function defaultWindow(days = 7): SupplyFunnelWindow {
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  return { sinceIso: since.toISOString(), untilIso: until.toISOString() };
}

async function clientOrNull(supabase?: SupabaseClient | null): Promise<SupabaseClient | null> {
  if (supabase) return supabase;
  try {
    return createServerClient();
  } catch {
    return null;
  }
}

/**
 * Snapshot reutilizable del funnel (7d por defecto).
 */
export async function buildSupplyFunnelSnapshot(
  opts?: { supabase?: SupabaseClient | null; windowDays?: number; window?: SupplyFunnelWindow },
): Promise<SupplyFunnelSnapshot> {
  const window = opts?.window ?? defaultWindow(opts?.windowDays ?? 7);
  const emptyNote = 'Sin datos de funnel en la ventana';
  const base: SupplyFunnelSnapshot = {
    window,
    counts: {
      discovered: null,
      qualified: null,
      pendingInserted: null,
      pendingStock: null,
      humanDecisions: null,
      approved: null,
      rejected: null,
      snoozed: null,
      claimed: null,
      liveStock: null,
    },
    rates: {
      discoveredToQualified: null,
      qualifiedToPending: null,
      pendingToApproved: null,
      pendingToRejected: null,
      pendingToSnoozed: null,
      approvedToLive: null,
      pendingToLive: null,
    },
    timing: { medianDecisionMs: null, medianApproveToLiveMs: null },
    pendingToLivePct: null,
    medianDecisionMinutes: null,
    note: emptyNote,
  };

  const supabase = await clientOrNull(opts?.supabase);
  if (!supabase) {
    return { ...base, note: 'Supabase no disponible' };
  }

  const nowIso = new Date().toISOString();

  const [
    supplyRes,
    pendingStockRes,
    liveStockRes,
    outcomesRes,
  ] = await Promise.all([
    supabase
      .from('hunter_supply_runs')
      .select('candidates_discovered, candidates_qualified, pending')
      .gte('started_at', window.sinceIso)
      .lt('started_at', window.untilIso),
    supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .in('status', ['approved', 'published'])
      .or(`expires_at.is.null,expires_at.gte.${nowIso}`),
    supabase
      .from(MODERATION_OUTCOME_TABLE)
      .select(
        'decision, time_from_submission_ms, offer_id, decision_at, priority_at_decision, source, source_lane, quality_classification',
      )
      .gte('decision_at', window.sinceIso)
      .lt('decision_at', window.untilIso),
  ]);

  let discovered: number | null = null;
  let qualified: number | null = null;
  let pendingInserted: number | null = null;
  if (!supplyRes.error && supplyRes.data) {
    discovered = 0;
    qualified = 0;
    pendingInserted = 0;
    for (const row of supplyRes.data) {
      discovered += Number((row as { candidates_discovered?: number }).candidates_discovered ?? 0);
      qualified += Number((row as { candidates_qualified?: number }).candidates_qualified ?? 0);
      pendingInserted += Number((row as { pending?: number }).pending ?? 0);
    }
  }

  const pendingStock = pendingStockRes.error ? null : pendingStockRes.count ?? 0;
  const liveStock = liveStockRes.error ? null : liveStockRes.count ?? 0;

  let approved = 0;
  let rejected = 0;
  let snoozed = 0;
  let claimed = 0;
  const decisionTimes: number[] = [];
  const approveOfferIds: string[] = [];

  if (outcomesRes.error) {
    // Tabla ausente o RLS: stock sí, outcomes no.
    const counts: SupplyFunnelCounts = {
      discovered,
      qualified,
      pendingInserted,
      pendingStock,
      humanDecisions: null,
      approved: null,
      rejected: null,
      snoozed: null,
      claimed: null,
      liveStock,
    };
    return {
      ...base,
      counts,
      rates: {
        discoveredToQualified: rate(qualified, discovered),
        qualifiedToPending: rate(pendingInserted, qualified),
        pendingToApproved: null,
        pendingToRejected: null,
        pendingToSnoozed: null,
        approvedToLive: null,
        pendingToLive: null,
      },
      note: outcomesRes.error.message?.includes(MODERATION_OUTCOME_TABLE)
        ? 'moderation_outcomes no disponible (migración pendiente)'
        : `Outcomes no legibles: ${outcomesRes.error.message}`,
    };
  }

  for (const row of outcomesRes.data ?? []) {
    const decision = (row as { decision?: string }).decision;
    if (decision === 'approve') {
      approved += 1;
      const oid = (row as { offer_id?: string }).offer_id;
      if (oid) approveOfferIds.push(oid);
    } else if (decision === 'reject') rejected += 1;
    else if (decision === 'snooze') snoozed += 1;
    else if (decision === 'claim') claimed += 1;

    if (decision === 'approve' || decision === 'reject') {
      const t = (row as { time_from_submission_ms?: number | null }).time_from_submission_ms;
      if (typeof t === 'number' && Number.isFinite(t) && t >= 0) decisionTimes.push(t);
    }
  }

  const terminal = approved + rejected;
  const humanDecisions = approved + rejected + snoozed;

  let liveFromApproves = 0;
  const approveToLiveTimes: number[] = [];
  if (approveOfferIds.length > 0) {
    const uniqueIds = [...new Set(approveOfferIds)].slice(0, 200);
    const { data: liveRows } = await supabase
      .from('offers')
      .select('id, status, expires_at, created_at')
      .in('id', uniqueIds);

    const approveAtByOffer = new Map<string, string>();
    for (const row of outcomesRes.data ?? []) {
      if ((row as { decision?: string }).decision !== 'approve') continue;
      const oid = (row as { offer_id?: string }).offer_id;
      const at = (row as { decision_at?: string }).decision_at;
      if (oid && at) approveAtByOffer.set(oid, at);
    }

    for (const row of liveRows ?? []) {
      const r = row as {
        id: string;
        status?: string;
        expires_at?: string | null;
        created_at?: string;
      };
      const statusOk = r.status === 'approved' || r.status === 'published';
      const expOk =
        r.expires_at == null ||
        (Number.isFinite(Date.parse(r.expires_at)) && Date.parse(r.expires_at) >= Date.now());
      if (statusOk && expOk) {
        liveFromApproves += 1;
        const approvedAt = approveAtByOffer.get(r.id);
        const liveAt = r.created_at;
        if (approvedAt && liveAt) {
          const ms = Date.parse(liveAt) - Date.parse(approvedAt);
          // created_at go-live ≈ decision_at; allow small skew
          if (Number.isFinite(ms) && ms >= -60_000) {
            approveToLiveTimes.push(Math.max(0, ms));
          }
        }
      }
    }
  }

  const medianDecisionMs = median(decisionTimes);
  const medianApproveToLiveMs = median(approveToLiveTimes);

  const counts: SupplyFunnelCounts = {
    discovered,
    qualified,
    pendingInserted,
    pendingStock,
    humanDecisions,
    approved,
    rejected,
    snoozed,
    claimed,
    liveStock,
  };

  const rates: SupplyFunnelRates = {
    discoveredToQualified: rate(qualified, discovered),
    qualifiedToPending: rate(pendingInserted, qualified),
    pendingToApproved: rate(approved, terminal > 0 ? terminal : null),
    pendingToRejected: rate(rejected, terminal > 0 ? terminal : null),
    pendingToSnoozed: rate(snoozed, humanDecisions > 0 ? humanDecisions : null),
    approvedToLive: rate(liveFromApproves, approved > 0 ? approved : null),
    pendingToLive: rate(liveFromApproves, terminal > 0 ? terminal : null),
  };

  return {
    window,
    counts,
    rates,
    timing: {
      medianDecisionMs,
      medianApproveToLiveMs,
    },
    pendingToLivePct: pct(liveFromApproves, terminal > 0 ? terminal : null),
    medianDecisionMinutes:
      medianDecisionMs != null ? Math.round((medianDecisionMs / 60_000) * 10) / 10 : null,
    note:
      terminal === 0 && (discovered ?? 0) === 0
        ? 'Sin supply ni decisiones en la ventana'
        : 'Funnel 7d: supply runs + outcomes + stock live',
  };
}

/** Formato CEO: "8.4%" o "NO_DATA". */
export function formatPendingToLivePct(pctValue: number | null): string {
  if (pctValue == null) return 'NO_DATA';
  return `${pctValue}%`;
}

/** Formato CEO: "14m" / "2.5h" / "NO_DATA". */
export function formatMedianDecisionTime(minutes: number | null): string {
  if (minutes == null) return 'NO_DATA';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}h`;
}
