/**
 * Day 8 — Persist continuous-discovery VERIFIED-yield into Supply Truth.
 *
 * Reuses hunter_supply_runs (append-only, service_role). Fail-open: never throws.
 * Does not mint offers. Does not invent history. Does not bypass DQE/S6.1.
 */

import { recordSupplyRuns } from '@/lib/hunter/supply/recordSupplyRun';
import { inferSupplyRunStatus } from '@/lib/hunter/supply/recordSupplyRun';
import type { SupplyRunInput } from '@/lib/hunter/supply/truthTypes';
import type { DiscoveryCycleReport } from './continuousDiscoveryCycle';
import type { SourceFunnelStageCounts } from '@/lib/bots/ingest/sourceFunnelMetrics';
import { createServerClient } from '@/lib/supabase/server';

export const DISCOVERY_CYCLE_SNAPSHOT_TABLE = 'discovery_cycle_snapshots';

function uuidOrNull(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

function familyForSource(sourceId: string): string {
  if (sourceId.startsWith('amazon')) return 'affiliate_feed';
  if (sourceId === 'ml_api_legacy' || sourceId === 'ml_worker') return 'official_api';
  if (sourceId.includes('liverpool') || sourceId.includes('walmart') || sourceId.includes('bodega') || sourceId.includes('chedraui')) {
    return 'retailer_public';
  }
  if (sourceId === 'sticky_near_ready' || sourceId === 'pm_evidence_backed') return 'core';
  return 'core';
}

function statusFromSource(row: SourceFunnelStageCounts): string {
  if (row.status === 'FAILED') return 'failed';
  if (row.status === 'SKIPPED' || row.status === 'BLOCKED_AUTH') return 'skipped';
  if (row.status === 'BLOCKED_EXTERNAL' || row.status === 'DEGRADED') return 'degraded';
  if (row.discovered <= 0) return 'zero';
  return 'ok';
}

/**
 * Map Day 6/7 bySource funnel → Supply Truth rows (one per source per cycle_id).
 */
export function supplyInputsFromDiscoveryReport(
  report: DiscoveryCycleReport,
): SupplyRunInput[] {
  const inputs: SupplyRunInput[] = [];
  const bySource = report.bySource ?? {};
  for (const [sourceId, row] of Object.entries(bySource)) {
    inputs.push({
      runId: report.cycle_id,
      sourceId,
      sourceFamily: familyForSource(sourceId),
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      status: statusFromSource(row),
      candidatesDiscovered: row.discovered,
      candidatesQualified: row.identity_valid,
      verifiedDeals: row.dqe_verified,
      potentialDeals: row.dqe_potential,
      duplicates: row.duplicate,
      rejected: row.blocked + row.failed,
      pending: report.dryRun ? 0 : row.pending,
      errors: row.failed,
      promotions: 0,
      catalogOnly: 0,
      shadowCycleId: uuidOrNull(report.cycle_id),
    });
  }
  if (inputs.length === 0) {
    inputs.push({
      runId: report.cycle_id,
      sourceId: 'continuous_discovery',
      sourceFamily: 'core',
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      status: inferSupplyRunStatus({
        attempted: true,
        ok: report.funnel.candidates_discovered > 0,
        candidates: report.funnel.candidates_discovered,
      }),
      candidatesDiscovered: report.funnel.candidates_discovered,
      candidatesQualified: report.funnel.identified,
      verifiedDeals: report.funnel.dqe_verified,
      potentialDeals: report.funnel.dqe_potential,
      duplicates: report.funnel.duplicates,
      rejected: report.funnel.s61_blocked,
      pending: report.dryRun ? 0 : report.funnel.pending_created,
      errors: report.funnel.dqe_failed,
      shadowCycleId: uuidOrNull(report.cycle_id),
    });
  }
  return inputs;
}

export type PersistDiscoveryTruthResult = {
  supplyTruth: { attempted: number; persisted: number; duplicates: number; failed: number };
  snapshot: { persisted: boolean; reason?: string };
};

/**
 * Persist source-level Supply Truth + optional cycle snapshot (full verifiedYield JSON).
 * Snapshot table may be missing — then snapshot.persisted=false with reason table_missing.
 */
export async function persistContinuousDiscoveryTruth(
  report: DiscoveryCycleReport,
  opts?: { claimToken?: string; supabase?: import('@supabase/supabase-js').SupabaseClient | null },
): Promise<PersistDiscoveryTruthResult> {
  const inputs = supplyInputsFromDiscoveryReport(report);
  const outcomes = await recordSupplyRuns(inputs);
  let persisted = 0;
  let duplicates = 0;
  let failed = 0;
  let firstFailReason: string | undefined;
  for (const o of outcomes) {
    if (o.persisted) {
      persisted += 1;
      if (o.duplicate) duplicates += 1;
    } else {
      failed += 1;
      if (!firstFailReason && 'reason' in o) firstFailReason = o.reason;
    }
  }

  const snapshot = await persistDiscoveryCycleSnapshot(report, opts);
  if (failed > 0) {
    console.warn(
      `[day8] supply_truth_partial_fail attempted=${inputs.length} failed=${failed} reason=${firstFailReason ?? 'unknown'}`,
    );
  }
  return {
    supplyTruth: {
      attempted: inputs.length,
      persisted,
      duplicates,
      failed,
    },
    snapshot,
  };
}

/**
 * Upsert a minimal row as soon as cycle_id is known so a Vercel timeout
 * still leaves durable evidence. Final persist overwrites the same cycle_id.
 */
export async function seedDiscoveryCycleSnapshot(input: {
  cycleId: string;
  startedAt: string;
  dryRun: boolean;
  claimToken?: string;
  supabase?: import('@supabase/supabase-js').SupabaseClient | null;
}): Promise<{ persisted: boolean; reason?: string }> {
  return upsertDiscoveryCycleSnapshotRow({
    cycleId: input.cycleId,
    startedAt: input.startedAt,
    finishedAt: input.startedAt,
    dryRun: input.dryRun,
    claimToken: input.claimToken,
    supabase: input.supabase,
    payload: {
      cycle_id: input.cycleId,
      phase: 'started',
      status: input.claimToken ? 'claimed' : 'started',
      dry_run: input.dryRun,
      mint_attempted: false,
      ...(input.claimToken
        ? { claim_token: input.claimToken, claimed_at: input.startedAt }
        : {}),
    },
  });
}

/**
 * Force a durable cycle row when the soft deadline fires before the full
 * funnel finishes. Upserts the same cycle_id (idempotent with seed/final).
 */
export async function persistDeadlineDiscoverySnapshot(input: {
  cycleId: string;
  startedAt: string;
  dryRun: boolean;
  reason?: string;
  claimToken?: string;
  supabase?: import('@supabase/supabase-js').SupabaseClient | null;
}): Promise<{ persisted: boolean; reason?: string }> {
  const finishedAt = new Date().toISOString();
  return upsertDiscoveryCycleSnapshotRow({
    cycleId: input.cycleId,
    startedAt: input.startedAt,
    finishedAt,
    dryRun: input.dryRun,
    claimToken: input.claimToken,
    supabase: input.supabase,
    payload: {
      cycle_id: input.cycleId,
      phase: 'deadline',
      status: 'claimed',
      dry_run: input.dryRun,
      mint_attempted: false,
      ...(input.claimToken
        ? { claim_token: input.claimToken, claimed_at: input.startedAt }
        : {}),
      deadline_reason: input.reason ?? 'soft_deadline',
      verified_yield: {
        cycle_id: input.cycleId,
        discovered: 0,
        identity_valid: 0,
        pm_ready: 0,
        dqe_verified: 0,
        dqe_potential: 0,
        s61_pass: 0,
        s61_blocked: 0,
        terminal_reason_counts: { SOFT_DEADLINE: 1 },
        rates: { verified_yield: 0, s61_yield: 0 },
      },
      automation: {
        candidate_count: 0,
        auto_processed: 0,
        automation_rate: 0,
        blocked_quality: 0,
        blocked_external: 0,
      },
      by_source: {},
      terminal_reason_counts: { SOFT_DEADLINE: 1 },
    },
  });
}

async function upsertDiscoveryCycleSnapshotRow(input: {
  cycleId: string;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  payload: Record<string, unknown>;
  claimToken?: string;
  supabase?: import('@supabase/supabase-js').SupabaseClient | null;
}): Promise<{ persisted: boolean; reason?: string }> {
  const client =
    input && 'supabase' in input && input.supabase !== undefined
      ? input.supabase
      : (() => {
          try {
            return createServerClient();
          } catch {
            return null;
          }
        })();
  if (!client) return { persisted: false, reason: 'no_client' };

  const row = {
    cycle_id: input.cycleId,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    dry_run: input.dryRun,
    payload: input.payload,
  };

  if (input.claimToken) {
    const updated = await client
      .from(DISCOVERY_CYCLE_SNAPSHOT_TABLE)
      .update(row)
      .eq('cycle_id', input.cycleId)
      .filter('payload->>claim_token', 'eq', input.claimToken)
      .select('cycle_id');
    if (updated.error) {
      const msg = (updated.error.message ?? '').toLowerCase();
      if (updated.error.code === '42P01' || msg.includes('does not exist')) {
        return { persisted: false, reason: 'table_missing' };
      }
      return { persisted: false, reason: updated.error.message?.slice(0, 160) ?? 'error' };
    }
    if (!updated.data?.length) return { persisted: false, reason: 'lease_lost' };
    return { persisted: true };
  }

  const { error } = await client.from(DISCOVERY_CYCLE_SNAPSHOT_TABLE).upsert(row, {
    onConflict: 'cycle_id',
  });

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (error.code === '42P01' || msg.includes('does not exist')) {
      return { persisted: false, reason: 'table_missing' };
    }
    if (error.code === '23505' || msg.includes('duplicate')) {
      return { persisted: true, reason: 'duplicate_cycle' };
    }
    return { persisted: false, reason: error.message?.slice(0, 160) ?? 'error' };
  }
  return { persisted: true };
}

export async function persistDiscoveryCycleSnapshot(
  report: DiscoveryCycleReport,
  opts?: { claimToken?: string; supabase?: import('@supabase/supabase-js').SupabaseClient | null },
): Promise<{ persisted: boolean; reason?: string }> {
  const payload = {
    cycle_id: report.cycle_id,
    phase: 'complete',
    status: 'completed',
    started_at: report.startedAt,
    finished_at: report.finishedAt,
    dry_run: report.dryRun,
    mint_attempted: report.mintAttempted,
    operator_verdict: report.operator_verdict.slice(0, 500),
    funnel: report.funnel,
    verified_yield: report.verifiedYield,
    automation: {
      candidate_count: report.automation.candidate_count,
      auto_processed: report.automation.auto_processed,
      blocked: report.automation.blocked,
      blocked_quality: report.automation.blocked_quality,
      blocked_external: report.automation.blocked_external,
      duplicates: report.automation.duplicates,
      failed: report.automation.failed,
      pending_created: report.automation.pending_created,
      dqe_verified: report.automation.dqe_verified,
      s61_passed: report.automation.s61_passed,
      automation_rate: report.automation.automation_rate,
      terminal_rate: report.automation.terminal_rate,
    },
    by_source: report.bySource,
    terminal_reason_counts: report.verifiedYield.terminal_reason_counts,
    rates: report.verifiedYield.rates,
    near_ready: report.verifiedYield.near_ready,
    deadline_budget: report.deadlineBudget ?? null,
    history_ready_activation: report.historyReadyActivation ?? null,
    /** Day 12.1 — compact gate samples + candidate diagnostics (capped in cycle). */
    gate_samples: (report.gateSamples ?? []).slice(0, 50),
    candidate_observations: (report.candidateObservations ?? []).slice(0, 50),
    observability_schema_version: 1,
    ...(opts?.claimToken
      ? { claim_token: opts.claimToken, claimed_at: report.startedAt }
      : {}),
  };

  return upsertDiscoveryCycleSnapshotRow({
    cycleId: report.cycle_id,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    dryRun: report.dryRun,
    payload,
    claimToken: opts?.claimToken,
    supabase: opts?.supabase,
  });
}
