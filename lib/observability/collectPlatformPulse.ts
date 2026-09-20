/**
 * Platform Pulse collector — read-only aggregators over existing authorities.
 * Fail-soft per domain when tables/RPCs are missing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { buildAttributionTruth } from '@/lib/attribution/buildAttributionTruth';
import { buildConversionCommissionTruth } from '@/lib/economy/buildConversionCommissionTruth';
import { isSettlementBridgeEnabled } from '@/lib/economy/settlement/isSettlementBridgeEnabled';
import { isDistributionEngineEnabled } from '@/lib/distribution/constants';
import { getSupplyTruth } from '@/lib/hunter/supply/getSupplyTruth';
import { MODERATION_OUTCOME_TABLE } from '@/lib/moderation/outcomes/contract';
import {
  PLATFORM_PULSE_DEFAULT_WINDOW_HOURS,
  type PlatformPulseAttribution,
  type PlatformPulseDistribution,
  type PlatformPulseDomainStatus,
  type PlatformPulseMoney,
  type PlatformPulseSnapshot,
  type PlatformPulseSupply,
} from './platformPulse';

type CollectOptions = {
  supabase?: SupabaseClient | null;
  windowHours?: number;
  now?: Date;
  env?: NodeJS.ProcessEnv;
};

function clampWindowHours(raw: number | undefined): number {
  const n = raw ?? PLATFORM_PULSE_DEFAULT_WINDOW_HOURS;
  return Math.max(1, Math.min(168 * 4, n));
}

function isMissingTable(message: string, table?: string): boolean {
  const m = message.toLowerCase();
  if (m.includes('does not exist') || m.includes('schema cache')) return true;
  if (table) return m.includes(table.toLowerCase());
  return false;
}

function domainStatus(available: boolean, degraded: boolean): PlatformPulseDomainStatus {
  if (!available) return 'unavailable';
  return degraded ? 'degraded' : 'ok';
}

function emptySupply(note: string | null = null): PlatformPulseSupply {
  return {
    available: false,
    status: 'unavailable',
    candidates: null,
    pending: null,
    rejectionReasons: null,
    note,
  };
}

function emptyDistribution(note: string | null = null): PlatformPulseDistribution {
  return {
    available: false,
    status: 'unavailable',
    enqueue: null,
    claim: null,
    published: null,
    retryable: null,
    failed: null,
    unknown: null,
    engineEnabled: isDistributionEngineEnabled(),
    note,
  };
}

function emptyAttribution(note: string | null = null): PlatformPulseAttribution {
  return {
    available: false,
    status: 'unavailable',
    clicks: null,
    attributed: null,
    unattributed: null,
    unresolved: null,
    conversions: null,
    note,
  };
}

function emptyMoney(
  settlementBridgeEnabled: boolean,
  note: string | null = null,
): PlatformPulseMoney {
  return {
    available: false,
    status: 'unavailable',
    commissionsReported: null,
    commissionsApproved: null,
    settlementEligible: null,
    ledgerEntries: null,
    settlementBridgeEnabled,
    note,
  };
}

/** Map free-text rejection reasons into high-level operator buckets. */
export function bucketRejectionReason(raw: string | null | undefined): string {
  const text = (raw ?? '').trim().toLowerCase();
  if (!text) return 'unspecified';
  if (text.includes('duplicate') || text.includes('duplicad')) return 'duplicate';
  if (text.includes('price') || text.includes('precio')) return 'price';
  if (text.includes('link') || text.includes('url') || text.includes('enlace')) return 'link';
  if (
    text.includes('quality') ||
    text.includes('score') ||
    text.includes('calidad') ||
    text.includes('verifier')
  ) {
    return 'quality';
  }
  if (text.includes('expired') || text.includes('timeout') || text.includes('caduc')) {
    return 'expired';
  }
  if (text.includes('spam') || text.includes('abuse')) return 'abuse';
  return 'other';
}

export function aggregateRejectionReasons(
  rows: Array<{ rejection_reason?: string | null }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const bucket = bucketRejectionReason(row.rejection_reason);
    out[bucket] = (out[bucket] ?? 0) + 1;
  }
  return out;
}

async function countPublicationStatus(
  supabase: SupabaseClient,
  status: string,
): Promise<{ count: number | null; missing: boolean; error: string | null }> {
  const { count, error } = await supabase
    .from('distribution_publications')
    .select('id', { count: 'exact', head: true })
    .eq('status', status);
  if (!error) return { count: count ?? 0, missing: false, error: null };
  const msg = error.message ?? 'query_failed';
  if (isMissingTable(msg, 'distribution_publications')) {
    return { count: null, missing: true, error: msg };
  }
  return { count: null, missing: false, error: msg };
}

async function collectSupply(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<PlatformPulseSupply> {
  try {
    const [supplyTruth, pendingRes, rejectRes] = await Promise.all([
      getSupplyTruth(supabase),
      supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .is('deleted_at', null),
      supabase
        .from(MODERATION_OUTCOME_TABLE)
        .select('rejection_reason')
        .eq('decision', 'reject')
        .gte('decision_at', sinceIso)
        .limit(2000),
    ]);

    const h24 = supplyTruth.windows.h24;
    const candidates = h24.candidates;
    let pending: number | null = null;
    let rejectionReasons: Record<string, number> | null = null;
    let degraded = false;
    const notes: string[] = [];

    if (pendingRes.error) {
      if (isMissingTable(pendingRes.error.message ?? '', 'offers')) {
        pending = h24.pending > 0 ? h24.pending : null;
        notes.push('offers table unavailable; pending from supply truth only');
        degraded = true;
      } else {
        pending = h24.pending;
        notes.push('pending count query failed');
        degraded = true;
      }
    } else {
      pending = pendingRes.count ?? 0;
    }

    if (rejectRes.error) {
      if (!isMissingTable(rejectRes.error.message ?? '', MODERATION_OUTCOME_TABLE)) {
        degraded = true;
        notes.push('rejection reasons unavailable');
      } else if (h24.rejected > 0) {
        rejectionReasons = { supply_rejected: h24.rejected };
        notes.push('moderation_outcomes missing; using supply rejected total');
        degraded = true;
      }
    } else {
      const rows = (rejectRes.data ?? []) as Array<{ rejection_reason?: string | null }>;
      rejectionReasons = rows.length > 0 ? aggregateRejectionReasons(rows) : {};
    }

    const available = candidates !== null || pending !== null;
    return {
      available,
      status: domainStatus(available, degraded),
      candidates,
      pending,
      rejectionReasons,
      note: notes.length > 0 ? notes.join('; ') : null,
    };
  } catch {
    return emptySupply('supply collection failed');
  }
}

async function collectDistribution(
  supabase: SupabaseClient,
  env: NodeJS.ProcessEnv,
): Promise<PlatformPulseDistribution> {
  const engineEnabled = isDistributionEngineEnabled(env);
  try {
    const [enqueue, claim, published, retryable, failed, unknown] = await Promise.all([
      countPublicationStatus(supabase, 'pending'),
      countPublicationStatus(supabase, 'publishing'),
      countPublicationStatus(supabase, 'published'),
      countPublicationStatus(supabase, 'retryable'),
      countPublicationStatus(supabase, 'failed'),
      countPublicationStatus(supabase, 'unknown_outcome'),
    ]);

    if (enqueue.missing) {
      return { ...emptyDistribution('distribution_publications not migrated'), engineEnabled };
    }

    const degraded = [enqueue, claim, published, retryable, failed, unknown].some(
      (r) => r.error && !r.missing,
    );

    return {
      available: true,
      status: domainStatus(true, degraded),
      enqueue: enqueue.count,
      claim: claim.count,
      published: published.count,
      retryable: retryable.count,
      failed: failed.count,
      unknown: unknown.count,
      engineEnabled,
      note: degraded ? 'one or more distribution status counts failed' : null,
    };
  } catch {
    return { ...emptyDistribution('distribution collection failed'), engineEnabled };
  }
}

async function collectAttribution(
  supabase: SupabaseClient,
  windowHours: number,
  now: Date,
): Promise<PlatformPulseAttribution> {
  try {
    const [attrTruth, convTruth] = await Promise.all([
      buildAttributionTruth(supabase, { windowHours, now }),
      buildConversionCommissionTruth(supabase, { windowHours, now }),
    ]);

    const clicks = attrTruth.attributedClicks;
    const attributed = convTruth.conversions.attributed;
    const unattributed = convTruth.conversions.unattributed;
    const unresolved = convTruth.conversions.unresolved;
    const conversions = convTruth.conversions.reported;

    const tablesMissing =
      attrTruth.status === 'blocked' ||
      convTruth.status === 'blocked' ||
      convTruth.note.toLowerCase().includes('not applied');

    if (tablesMissing && clicks === null && conversions === null) {
      return emptyAttribution('attribution/conversion tables not applied');
    }

    const degraded =
      attrTruth.status === 'degraded' ||
      convTruth.status === 'degraded' ||
      attrTruth.status === 'unknown' ||
      convTruth.status === 'unknown';

    const available =
      clicks !== null ||
      attributed !== null ||
      unattributed !== null ||
      unresolved !== null ||
      conversions !== null;

    return {
      available,
      status: domainStatus(available, degraded),
      clicks,
      attributed,
      unattributed,
      unresolved,
      conversions,
      note: convTruth.note.length > 0 ? convTruth.note.slice(0, 240) : attrTruth.note.slice(0, 240),
    };
  } catch {
    return emptyAttribution('attribution collection failed');
  }
}

async function collectMoney(
  supabase: SupabaseClient,
  windowHours: number,
  sinceIso: string,
  settlementBridgeEnabled: boolean,
  now: Date,
): Promise<PlatformPulseMoney> {
  try {
    const [convTruth, ledgerRes, eligibleRes] = await Promise.all([
      buildConversionCommissionTruth(supabase, { windowHours, now }),
      supabase
        .from('affiliate_ledger_entries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso),
      supabase
        .from('affiliate_economic_events')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'settlement')
        .eq('event_type', 'settlement_eligible')
        .gte('created_at', sinceIso),
    ]);

    const commissionsReported = convTruth.commissions.reported;
    const commissionsApproved = convTruth.commissions.approved;

    let ledgerEntries: number | null = null;
    let settlementEligible: number | null = null;
    let degraded = convTruth.status === 'degraded' || convTruth.status === 'unknown';
    const notes: string[] = [];

    if (ledgerRes.error) {
      if (!isMissingTable(ledgerRes.error.message ?? '', 'affiliate_ledger_entries')) {
        degraded = true;
        notes.push('ledger count query failed');
      }
    } else {
      ledgerEntries = ledgerRes.count ?? 0;
    }

    if (eligibleRes.error) {
      if (!isMissingTable(eligibleRes.error.message ?? '', 'affiliate_economic_events')) {
        degraded = true;
        notes.push('settlement_eligible count query failed');
      }
    } else {
      settlementEligible = eligibleRes.count ?? 0;
    }

    if (
      convTruth.status === 'blocked' &&
      commissionsReported === null &&
      commissionsApproved === null
    ) {
      return emptyMoney(
        settlementBridgeEnabled,
        'commission tables not applied',
      );
    }

    const available =
      commissionsReported !== null ||
      commissionsApproved !== null ||
      ledgerEntries !== null ||
      settlementEligible !== null;

    if (!settlementBridgeEnabled) {
      notes.push('settlement bridge OFF');
    }

    return {
      available,
      status: domainStatus(available, degraded),
      commissionsReported,
      commissionsApproved,
      settlementEligible,
      ledgerEntries,
      settlementBridgeEnabled,
      note: notes.length > 0 ? notes.join('; ') : convTruth.note.slice(0, 200),
    };
  } catch {
    return emptyMoney(settlementBridgeEnabled, 'money collection failed');
  }
}

export async function collectPlatformPulse(
  opts?: CollectOptions,
): Promise<PlatformPulseSnapshot> {
  const windowHours = clampWindowHours(opts?.windowHours);
  const now = opts?.now ?? new Date();
  const sinceIso = new Date(now.getTime() - windowHours * 3600_000).toISOString();
  const generatedAt = now.toISOString();
  const env = opts?.env ?? process.env;
  const settlementBridgeEnabled = isSettlementBridgeEnabled(env);

  let supabase = opts?.supabase ?? null;
  if (!supabase) {
    try {
      supabase = createServerClient();
    } catch {
      return {
        generatedAt,
        windowHours,
        supply: emptySupply('Supabase unavailable'),
        distribution: emptyDistribution('Supabase unavailable'),
        attribution: emptyAttribution('Supabase unavailable'),
        money: emptyMoney(settlementBridgeEnabled, 'Supabase unavailable'),
      };
    }
  }

  const [supply, distribution, attribution, money] = await Promise.all([
    collectSupply(supabase, sinceIso),
    collectDistribution(supabase, env),
    collectAttribution(supabase, windowHours, now),
    collectMoney(supabase, windowHours, sinceIso, settlementBridgeEnabled, now),
  ]);

  return {
    generatedAt,
    windowHours,
    supply,
    distribution,
    attribution,
    money,
  };
}
