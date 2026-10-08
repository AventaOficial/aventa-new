/**
 * Lectura acotada de oferta para el command center.
 * Aprobadas y rechazadas salen de supplyDecisionCount (moderation_logs).
 * source_lane de moderation_outcomes solo mide cobertura de observabilidad.
 * Si la lectura se trunca, la mezcla queda vacía en lugar de inventar proporciones.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { declaredMachineHunterIds, ingestSystemUserIds, type ActorDirectory } from '@/lib/actors/actorType';
import { auditActors } from '@/lib/owner/actorAudit';
import { supplyDecisionCount, supplyWindows, SUPPLY_APPROVED_ACTION, SUPPLY_REJECTED_ACTION } from '@/lib/owner/supplyDomain';
import { buildHumanSupply, type HumanSupplyOffer } from '@/lib/owner/humanSupply';
import { buildHunterGrowth } from '@/lib/owner/hunterGrowth';
import { loadHunterAudience } from '@/lib/owner/loadHunterGrowth';
import { supplyThresholdsFromEnv } from '@/lib/owner/supplyThresholds';
import {
  buildSupplyIntelligence,
  classifySupplyAuthor,
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
        .select('id, created_at, created_by, status, store, category, product_fingerprint, offer_url, ingestion_identity_key, rejection_reason, deleted_at')
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
          productFingerprint: row.product_fingerprint ?? null,
          offerUrl: row.offer_url ?? null,
          ingestionIdentityKey: row.ingestion_identity_key ?? null,
          rejectionReason: row.rejection_reason ?? null,
          deletedAt: row.deleted_at ?? null,
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
  const rows = truncated ? [] : offerPage.rows;
  const [humanSupply, audience] = await Promise.all([
    truncated ? Promise.resolve(null) : loadHumanSupply(supabase, now, directory, rows),
    loadHunterAudience(supabase, windows),
  ]);
  const hunterGrowth = buildHunterGrowth({
    human: humanSupply,
    d7: audience.d7,
    d30: audience.d30,
    d7StartMs: windows.d7.startMs,
    d30StartMs: windows.d30.startMs,
  });
  return buildSupplyIntelligence({
    now,
    offers: rows,
    decisions: [],
    lanes: truncated ? [] : decisionPage.rows,
    pendingNow,
    directory,
    truncated,
    thresholds: supplyThresholdsFromEnv(),
    volume: { today, d7, d30 },
    humanSupply,
    hunterGrowth,
  });
}

async function loadHumanSupply(
  supabase: SupabaseClient,
  now: Date,
  directory: ActorDirectory | null,
  rows: HumanSupplyOffer[],
) {
  if (!directory) return null;
  const authorIds = [...new Set(
    rows.flatMap((row) => {
      const id = row.createdBy?.trim() ?? '';
      if (!id || row.deletedAt) return [];
      return [id];
    }),
  )];
  const machineClientIds = await readMachineClientIds(supabase, authorIds);
  if (!machineClientIds) return null;
  const actorAudit = auditActors({
    authorIds,
    directory,
    machineClientIds,
    declaredMachineHunterIds: declaredMachineHunterIds(),
    configuredSystemIds: ingestSystemUserIds(),
  });
  if (!actorAudit) return null;
  const ids = [...new Set(
    rows.flatMap((row) => {
      const id = row.createdBy?.trim() ?? '';
      if (!id || row.deletedAt) return [];
      return classifySupplyAuthor(id, directory) === 'HUMAN' ? [id] : [];
    }),
  )];
  const history = await readAuthorHistory(supabase, ids);
  if (!history) {
    return buildHumanSupply({
      now,
      windowOffers: rows,
      history: [],
      directory,
      historyTruncated: true,
      actorAudit,
    });
  }
  const firstIds = firstOfferIds(history.rows);
  const approveAtByOfferId = await readApproveTimes(supabase, firstIds);
  return buildHumanSupply({
    now,
    windowOffers: rows,
    history: history.rows,
    directory,
    historyTruncated: history.truncated,
    approveAtByOfferId: approveAtByOfferId ?? undefined,
    actorAudit,
  });
}

async function readMachineClientIds(supabase: SupabaseClient, ids: string[]): Promise<Set<string> | null> {
  const found = new Set<string>();
  if (ids.length === 0) return found;
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    try {
      const result = await supabase.from('machine_clients').select('author_profile_id').in('author_profile_id', chunk);
      if (result.error) return null;
      for (const row of result.data ?? []) {
        const id = String(row.author_profile_id ?? '').trim();
        if (id) found.add(id);
      }
    } catch {
      return null;
    }
  }
  return found;
}

function firstOfferIds(rows: HumanSupplyOffer[]): string[] {
  const first = new Map<string, HumanSupplyOffer>();
  for (const row of rows) {
    if (row.deletedAt) continue;
    const id = row.createdBy?.trim() ?? '';
    if (!id) continue;
    const current = first.get(id);
    if (!current || Date.parse(row.createdAt) < Date.parse(current.createdAt)) first.set(id, row);
  }
  return [...first.values()].filter((row) => row.status === 'approved').map((row) => row.id);
}

async function readAuthorHistory(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ rows: HumanSupplyOffer[]; truncated: boolean } | null> {
  if (ids.length === 0) return { rows: [], truncated: false };
  const rows: HumanSupplyOffer[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const page = await readPages(async (from, to) => {
      const result = await supabase
        .from('offers')
        .select('id, created_at, created_by, status, product_fingerprint, offer_url, ingestion_identity_key, rejection_reason, deleted_at')
        .in('created_by', chunk)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .range(from, to);
      return {
        data: (result.data ?? []).map((row) => ({
          id: String(row.id),
          createdAt: String(row.created_at),
          createdBy: row.created_by ?? null,
          status: row.status ?? null,
          productFingerprint: row.product_fingerprint ?? null,
          offerUrl: row.offer_url ?? null,
          ingestionIdentityKey: row.ingestion_identity_key ?? null,
          rejectionReason: row.rejection_reason ?? null,
          deletedAt: row.deleted_at ?? null,
        })),
        error: result.error,
      };
    });
    if (!page) return null;
    rows.push(...page.rows);
    if (page.truncated) return { rows, truncated: true };
  }
  return { rows, truncated: false };
}

async function readApproveTimes(
  supabase: SupabaseClient,
  offerIds: string[],
): Promise<Record<string, string> | null> {
  const times: Record<string, string> = {};
  for (let index = 0; index < offerIds.length; index += 100) {
    const chunk = offerIds.slice(index, index + 100);
    if (chunk.length === 0) continue;
    try {
      const result = await supabase
        .from('moderation_logs')
        .select('offer_id, created_at')
        .eq('action', 'approved')
        .in('offer_id', chunk);
      if (result.error) return null;
      for (const row of result.data ?? []) {
        const id = String(row.offer_id);
        const at = String(row.created_at);
        if (!times[id] || Date.parse(at) < Date.parse(times[id])) times[id] = at;
      }
    } catch {
      return null;
    }
  }
  return times;
}
