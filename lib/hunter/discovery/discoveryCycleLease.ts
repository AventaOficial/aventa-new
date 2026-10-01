/**
 * Day 9 — DB lease for a scheduled continuous-discovery cycle_id.
 *
 * UNIQUE(cycle_id) is the authority. The first caller inserts a claim row.
 * A second caller in the same window does not run and does not overwrite.
 * A claim older than the lease can be taken over so a killed run can finish later.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { DISCOVERY_CYCLE_SNAPSHOT_TABLE } from './persistContinuousDiscoveryTruth';

/** Longer than route maxDuration (300s) so a live run is not reclaimed. */
export const DISCOVERY_CYCLE_LEASE_MS = 8 * 60 * 1000;

export type DiscoveryCycleClaim =
  | { action: 'run'; token: string }
  | { action: 'skip'; reason: 'completed' | 'in_progress' }
  | { action: 'unguarded'; reason: 'no_client' | 'table_missing' | 'error' };

type ClaimPayload = {
  status?: string;
  phase?: string;
  claim_token?: string;
  claimed_at?: string;
  verified_yield?: unknown;
};

function uniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return (error.message ?? '').toLowerCase().includes('does not exist');
}

function claimRow(cycleId: string, token: string, now: Date) {
  const iso = now.toISOString();
  return {
    cycle_id: cycleId,
    started_at: iso,
    finished_at: iso,
    dry_run: true,
    payload: {
      status: 'claimed',
      phase: 'started',
      claim_token: token,
      claimed_at: iso,
    },
  };
}

function isCompleted(payload: ClaimPayload): boolean {
  if (payload.status === 'completed' || payload.phase === 'complete') return true;
  if (
    payload.status === 'claimed' ||
    payload.phase === 'started' ||
    payload.phase === 'deadline'
  ) {
    return false;
  }
  return payload.verified_yield != null;
}

export async function claimDiscoveryCycle(input: {
  cycleId: string;
  now?: Date;
  supabase?: SupabaseClient | null;
}): Promise<DiscoveryCycleClaim> {
  const now = input.now ?? new Date();
  const cycleId = input.cycleId.trim();
  if (!cycleId) return { action: 'unguarded', reason: 'error' };

  const supabase =
    input.supabase === undefined
      ? (() => {
          try {
            return createServerClient();
          } catch {
            return null;
          }
        })()
      : input.supabase;
  if (!supabase) return { action: 'unguarded', reason: 'no_client' };

  const token = randomUUID();
  const inserted = await supabase.from(DISCOVERY_CYCLE_SNAPSHOT_TABLE).insert(claimRow(cycleId, token, now));
  if (!inserted.error) return { action: 'run', token };
  if (tableMissing(inserted.error)) return { action: 'unguarded', reason: 'table_missing' };
  if (!uniqueViolation(inserted.error)) return { action: 'unguarded', reason: 'error' };

  const existing = await supabase
    .from(DISCOVERY_CYCLE_SNAPSHOT_TABLE)
    .select('payload,started_at')
    .eq('cycle_id', cycleId)
    .maybeSingle();
  if (existing.error) {
    if (tableMissing(existing.error)) return { action: 'unguarded', reason: 'table_missing' };
    return { action: 'skip', reason: 'in_progress' };
  }

  const payload = (existing.data?.payload ?? {}) as ClaimPayload;
  if (isCompleted(payload)) return { action: 'skip', reason: 'completed' };

  const claimedAt = Date.parse(payload.claimed_at ?? existing.data?.started_at ?? '');
  const age = Number.isFinite(claimedAt) ? now.getTime() - claimedAt : 0;
  if (payload.status === 'claimed' && age < DISCOVERY_CYCLE_LEASE_MS) {
    return { action: 'skip', reason: 'in_progress' };
  }

  const oldToken = payload.claim_token ?? '';
  const reclaimed = await supabase
    .from(DISCOVERY_CYCLE_SNAPSHOT_TABLE)
    .update(claimRow(cycleId, token, now))
    .eq('cycle_id', cycleId)
    .filter('payload->>claim_token', 'eq', oldToken)
    .select('cycle_id');
  if (reclaimed.error || !reclaimed.data?.length) {
    return { action: 'skip', reason: 'in_progress' };
  }
  return { action: 'run', token };
}
