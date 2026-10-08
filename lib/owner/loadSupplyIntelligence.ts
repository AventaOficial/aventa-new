/**
 * Lectura acotada de oferta para el command center.
 * Aprobadas y rechazadas salen de supplyDecisionCount (moderation_logs).
 * source_lane de moderation_outcomes solo mide cobertura de observabilidad.
 * Si la lectura se trunca, la mezcla queda vacía en lugar de inventar proporciones.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorDirectory } from '@/lib/actors/actorType';
import { supplyDecisionCount, supplyWindows, SUPPLY_APPROVED_ACTION, SUPPLY_REJECTED_ACTION } from '@/lib/owner/supplyDomain';
import { supplyThresholdsFromEnv } from '@/lib/owner/supplyThresholds';
import {
  buildSupplyIntelligence,
  type SupplyIntelligence,
  type SupplyVolume,
  type SupplyWindowId,
} from '@/lib/owner/supplyIntelligence';

const PAGE = 1000;
const CAP = 5000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function readPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<{ rows: T[]; truncated: boolean } | null> {
  const rows: T[] = [];
  for (let from = 0; from < CAP; from += PAGE) {
    let page: PageResult<T>;
    try {
      page = await fetchPage(from, from + PAGE - 1);
    } catch {
      return null;
    }
    if (page.error) return null;
    const batch = page.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function countWhere(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number | null> {
  try {
    const { count, error } = await query;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function volumeWindow(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string,
): Promise<SupplyVolume | null> {
  const [created, approved, rejected] = await Promise.all([
    countWhere(
      supabase.from('offers').select('id', { count: 'exact', head: true }).gte('created_at', startIso).lt('created_at', endIso),
    ),
    countWhere(supplyDecisionCount(supabase, SUPPLY_APPROVED_ACTION, startIso, endIso)),
    countWhere(supplyDecisionCount(supabase, SUPPLY_REJECTED_ACTION, startIso, endIso)),
  ]);
  if (created == null || approved == null || rejected == null) return null;
  const decided = approved + rejected;
  const rate = (part: number) => (decided > 0 ? Math.round((part / decided) * 1000) / 1000 : null);
  return { created, approved, rejected, approvalRate: rate(approved), rejectionRate: rate(rejected) };
}

export async function loadSupplyIntelligence(
  supabase: SupabaseClient,
  now: Date,
  directory: ActorDirectory | null,
): Promise<SupplyIntelligence | null> {
  const windows = supplyWindows(now);
  const since = new Date(windows.d30.startMs).toISOString();
  const end = new Date(windows.d30.endMs).toISOString();
  const bounds = (id: SupplyWindowId) => ({
    start: new Date(windows[id].startMs).toISOString(),
    end: new Date(windows[id].endMs).toISOString(),
  });

  const [today, d7, d30, pendingNow, offerPage, decisionPage] = await Promise.all([
    volumeWindow(supabase, bounds('today').start, bounds('today').end),
    volumeWindow(supabase, bounds('d7').start, bounds('d7').end),
    volumeWindow(supabase, bounds('d30').start, bounds('d30').end),
    countWhere(
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null),
    ),
    readPages(async (from, to) => {
      const result = await supabase
        .from('offers')
        .select('id, created_at, created_by, status, store, category')
        .gte('created_at', since)
        .lt('created_at', end)
        .order('created_at', { ascending: true })
        .range(from, to);
      return {
        data: (result.data ?? []).map((row) => ({
          id: String(row.id),
          createdAt: String(row.created_at),
          createdBy: row.created_by ?? null,
          status: row.status ?? null,
          store: row.store ?? null,
          category: row.category ?? null,
        })),
        error: result.error,
      };
    }),
    readPages(async (from, to) => {
      const result = await supabase
        .from('moderation_outcomes')
        .select('offer_id, source_lane')
        .in('decision', ['approve', 'reject'])
        .gte('decision_at', since)
        .lt('decision_at', end)
        .order('decision_at', { ascending: true })
        .range(from, to);
      return {
        data: (result.data ?? []).map((row) => ({
          offerId: String(row.offer_id),
          sourceLane: row.source_lane ?? null,
        })),
        error: result.error,
      };
    }),
  ]);

  if (!today || !d7 || !d30 || !offerPage || !decisionPage) return null;
  const truncated = offerPage.truncated || decisionPage.truncated;
  return buildSupplyIntelligence({
    now,
    offers: truncated ? [] : offerPage.rows,
    decisions: [],
    lanes: truncated ? [] : decisionPage.rows,
    pendingNow,
    directory,
    truncated,
    thresholds: supplyThresholdsFromEnv(),
    volume: { today, d7, d30 },
  });
}
