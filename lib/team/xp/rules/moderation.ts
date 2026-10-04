import type { SupabaseClient } from '@supabase/supabase-js';
import { applyTeamProgress, progressEligible, supabaseProgressStore, type TeamProgressOutcome } from '../../progression/apply';
import { persistTeamXpDecision, type TeamXpApplyResult } from './apply';
import { evaluateTeamXpEvent } from './engine';
import { MODERATION_LOG_EVENT_COLUMNS, moderationEventFromLog, type PersistedModerationEvent } from './moderationSource';
import type { TeamXpRuleDecision } from './types';

export type TeamXpPipelineResult = {
  results: TeamXpApplyResult[];
  progress: TeamProgressOutcome[];
};

async function runPipeline(
  supabase: SupabaseClient,
  persisted: PersistedModerationEvent,
  decisions: readonly TeamXpRuleDecision[],
  resolved: ReadonlyMap<string, TeamXpApplyResult>,
): Promise<TeamXpPipelineResult> {
  const store = supabaseProgressStore(supabase);
  const results: TeamXpApplyResult[] = [];
  const progress: TeamProgressOutcome[] = [];
  for (const decision of decisions) {
    const result = resolved.get(decision.idempotencyKey) ?? (await persistTeamXpDecision(decision));
    results.push(result);
    if (progressEligible(result)) progress.push(await applyTeamProgress(store, result, persisted.occurredAt));
  }
  return { results, progress };
}

/**
 * Después de guardar la decisión y su fila en moderation_logs.
 * Evalúa la fila persistida (con su foto de contexto), no el body de la petición.
 * Nunca hace fallar la respuesta de moderación: si falla, la reconciliación lo repite.
 */
export async function recordModerationDecisionTeamXp(
  supabase: SupabaseClient,
  input: { logId: string; actorUserId: string; logRow: unknown },
): Promise<TeamXpPipelineResult> {
  try {
    const persisted = moderationEventFromLog(input.logRow);
    if (!persisted) return { results: [], progress: [] };
    if (persisted.event.eventRef !== `moderation_logs:${input.logId}`) return { results: [], progress: [] };
    if (persisted.event.actorUserId !== input.actorUserId) return { results: [], progress: [] };
    const decisions = evaluateTeamXpEvent(persisted.event, persisted.memberships);
    return await runPipeline(supabase, persisted, decisions, new Map());
  } catch (error) {
    console.error('[team-xp] moderation decision', error instanceof Error ? error.message : 'unknown');
    return { results: [], progress: [] };
  }
}

const RECONCILE_WINDOW_HOURS = 48;
const RECONCILE_PAGE = 500;
const RECONCILE_MAX_PAGES = 20;
const KEY_CHUNK = 100;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

type StoredOutcome = { status: 'granted' | 'skipped'; userId: string; teamId: string; ruleId: string };

async function loadOutcomes(supabase: SupabaseClient, keys: readonly string[]): Promise<Map<string, StoredOutcome> | null> {
  const found = new Map<string, StoredOutcome>();
  for (const part of chunks(keys, KEY_CHUNK)) {
    const { data, error } = await supabase
      .from('team_xp_rule_outcomes')
      .select('idempotency_key, status, user_id, team_id, rule_id')
      .in('idempotency_key', part);
    if (error || !data) return null;
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const value = row as Record<string, unknown>;
      const key = typeof value.idempotency_key === 'string' ? value.idempotency_key : null;
      const status = value.status === 'granted' || value.status === 'skipped' ? value.status : null;
      if (!key || !status) continue;
      found.set(key, {
        status,
        userId: String(value.user_id),
        teamId: String(value.team_id),
        ruleId: String(value.rule_id),
      });
    }
  }
  return found;
}

async function loadReceipts(supabase: SupabaseClient, keys: readonly string[]): Promise<Set<string> | null> {
  const found = new Set<string>();
  for (const part of chunks(keys, KEY_CHUNK)) {
    const { data, error } = await supabase.from('team_xp_progress_receipts').select('source_key').in('source_key', part);
    if (error || !data) return null;
    for (const row of data) {
      if (row && typeof row === 'object' && 'source_key' in row && typeof row.source_key === 'string') {
        found.add(row.source_key);
      }
    }
  }
  return found;
}

export type ReconcileSummary = {
  scanned: number;
  withoutSnapshot: number;
  results: TeamXpApplyResult[];
  progress: TeamProgressOutcome[];
};

/**
 * Repite las últimas 48 h por páginas (índice moderation_logs_created_at_idx).
 * Solo filas con foto de contexto: las anteriores no tienen `bulk` ni membresías del momento.
 * Resultados ya resueltos se saltan sin RPC; los concedidos sin recibo repiten la progresión.
 */
export async function reconcileModerationTeamXp(supabase: SupabaseClient, now = new Date()): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { scanned: 0, withoutSnapshot: 0, results: [], progress: [] };
  let cursor = new Date(now.getTime() - RECONCILE_WINDOW_HOURS * 3600 * 1000).toISOString();
  const seen = new Set<string>();

  for (let page = 0; page < RECONCILE_MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from('moderation_logs')
      .select(MODERATION_LOG_EVENT_COLUMNS)
      .in('action', ['approved', 'rejected'])
      .gte('created_at', cursor)
      .lte('created_at', now.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(RECONCILE_PAGE);
    if (error || !data || data.length === 0) break;

    const fresh = data.filter((row) => {
      const id = row && typeof row === 'object' && 'id' in row ? String(row.id) : '';
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    summary.scanned += fresh.length;

    const events: { persisted: PersistedModerationEvent; decisions: TeamXpRuleDecision[] }[] = [];
    for (const row of fresh) {
      const persisted = moderationEventFromLog(row);
      if (!persisted) {
        summary.withoutSnapshot += 1;
        continue;
      }
      events.push({ persisted, decisions: evaluateTeamXpEvent(persisted.event, persisted.memberships) });
    }

    const keys = events.flatMap((item) => item.decisions.map((decision) => decision.idempotencyKey));
    const outcomes = await loadOutcomes(supabase, keys);
    if (!outcomes) break;
    const grantedKeys = [...outcomes].filter(([, value]) => value.status === 'granted').map(([key]) => key);
    const receipts = await loadReceipts(supabase, grantedKeys);
    if (!receipts) break;

    for (const { persisted, decisions } of events) {
      const pending = decisions.filter((decision) => {
        const stored = outcomes.get(decision.idempotencyKey);
        if (!stored) return true;
        if (stored.userId !== decision.recipientUserId || stored.teamId !== decision.rule.teamId) return false;
        return stored.status === 'granted' && !receipts.has(decision.idempotencyKey);
      });
      if (pending.length === 0) continue;
      const resolved = new Map<string, TeamXpApplyResult>();
      for (const decision of pending) {
        const stored = outcomes.get(decision.idempotencyKey);
        if (!stored) continue;
        resolved.set(decision.idempotencyKey, {
          ruleId: decision.rule.id,
          ruleVersion: decision.rule.version,
          teamId: decision.rule.teamId,
          recipientUserId: decision.recipientUserId,
          idempotencyKey: decision.idempotencyKey,
          status: 'duplicate',
          reason: null,
          previous: stored.status,
        });
      }
      const run = await runPipeline(supabase, persisted, pending, resolved);
      summary.results.push(...run.results);
      summary.progress.push(...run.progress);
    }

    if (data.length < RECONCILE_PAGE) break;
    const last = data[data.length - 1];
    const lastAt = last && typeof last === 'object' && 'created_at' in last ? String(last.created_at) : null;
    if (!lastAt || lastAt === cursor) break;
    cursor = lastAt;
  }
  return summary;
}
