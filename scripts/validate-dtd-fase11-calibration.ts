/**
 * Validación real FASE 11. No fabrica datasets.
 * Reporta matches honestos. El histórico anterior a esta fase
 * no tiene offer_id en hunter_shadow_cycles → unmatched.
 */
import { createClient } from '@supabase/supabase-js';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { isDayToDayFlagOn } from '../lib/hunter/dayToDay';
import { AUTONOMOUS_DECISION_POLICY_V1, AUTONOMOUS_POLICY_V1 } from '../lib/autonomous/policy';
import { buildCalibrationSnapshot } from '../lib/autonomous/calibration/getCalibration';
import { DEAL_VERIFIER_THRESHOLDS } from '../lib/verifier/thresholds';

function env(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

async function main() {
  const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  const [
    cycles,
    logs,
    outcomes,
    offers,
    summary,
    bySource,
    reasons,
  ] = await Promise.all([
    supabase.from('hunter_shadow_cycles').select('cycle_id, evaluated, policy_version, finished_at', { count: 'exact' }),
    supabase.from('moderation_logs').select('action', { count: 'exact' }),
    supabase.from('hunter_shadow_outcomes').select('offer_id, shadow_decision, human_outcome, policy_version', {
      count: 'exact',
    }),
    supabase.from('offers').select('status', { count: 'exact' }),
    supabase.rpc('hunter_shadow_calibration_summary', { p_since: '2020-01-01T00:00:00.000Z' }),
    supabase.rpc('hunter_shadow_calibration_by_source', { p_since: '2020-01-01T00:00:00.000Z' }),
    supabase.rpc('hunter_shadow_calibration_reasons', { p_since: '2020-01-01T00:00:00.000Z' }),
  ]);

  const logActions = new Map<string, number>();
  for (const row of logs.data ?? []) {
    const action = String((row as { action?: string }).action ?? 'unknown');
    logActions.set(action, (logActions.get(action) ?? 0) + 1);
  }

  const snapshot = buildCalibrationSnapshot({
    since: '2020-01-01T00:00:00.000Z',
    summary: Array.isArray(summary.data) ? (summary.data[0] as Record<string, unknown>) : null,
    bySource: Array.isArray(bySource.data) ? (bySource.data as Record<string, unknown>[]) : [],
    reasons: Array.isArray(reasons.data) ? (reasons.data as Record<string, unknown>[]) : [],
  });

  const cfg = loadBotIngestConfig();
  const report = {
    shadowCycles: cycles.count ?? (cycles.data ?? []).length,
    shadowCyclesError: cycles.error?.message ?? null,
    moderationLogs: logs.count ?? (logs.data ?? []).length,
    moderationByAction: Object.fromEntries(logActions),
    moderationError: logs.error?.message ?? null,
    shadowOutcomes: outcomes.count ?? (outcomes.data ?? []).length,
    shadowOutcomesError: outcomes.error?.message ?? null,
    outcomesPreview: (outcomes.data ?? []).slice(0, 8),
    offers: offers.count ?? null,
    offersError: offers.error?.message ?? null,
    calibration: {
      evaluated: snapshot.counts.shadowEvaluated,
      matched: snapshot.counts.shadowMatched,
      unknown: snapshot.counts.shadowUnknown,
      autoApprovePrecision: snapshot.autoApprovePrecision.display,
      autoRejectPrecision: snapshot.autoRejectPrecision.display,
      agreement: snapshot.agreementRate.display,
      reviewApproval: snapshot.reviewApprovalRate.display,
      recommendedAction: snapshot.recommendedAction,
      policyVersion: snapshot.policyVersion,
      bySource: snapshot.bySource,
      disagreementReasons: snapshot.disagreementReasons,
    },
    safety: {
      autonomousPolicy: AUTONOMOUS_DECISION_POLICY_V1,
      minAutoApproveConfidence: AUTONOMOUS_POLICY_V1.minAutoApproveConfidence,
      absurdDiscountCap: DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap,
      legacyAutoApproveWriteEnabled: cfg.legacyAutoApproveWriteEnabled,
      chedraui: isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED'),
      bodega: isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED'),
      walmart: isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED'),
    },
    note:
      'Sin offer_id en hunter_shadow_cycles no hay correlación histórica fiable. Pocos o cero matches es el resultado honesto.',
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
