/**
 * Score heurístico de automatización — explícito y auditable.
 * docs/SYSTEMS/SYSTEM_payout_operations.md §8
 */

import type { AutomationLevel, AutomationScore, PipelineStage, StageId } from './types';

export const STAGE_WEIGHTS: Record<StageId, number> = {
  ingest: 20,
  split: 10,
  hold: 10,
  batch: 15,
  disburse: 30,
  reconcile: 15,
};

export const LEVEL_VALUE: Record<AutomationLevel, number> = {
  auto: 1,
  semi: 0.6,
  manual: 0.15,
  blocked: 0,
};

const INTERNAL_STAGES: StageId[] = ['ingest', 'split', 'hold', 'batch'];

function pct(stages: PipelineStage[], ids: StageId[]): number {
  let weight = 0;
  let value = 0;
  for (const s of stages) {
    if (!ids.includes(s.id)) continue;
    weight += STAGE_WEIGHTS[s.id];
    value += STAGE_WEIGHTS[s.id] * LEVEL_VALUE[s.automation];
  }
  if (weight === 0) return 0;
  return Math.round((value / weight) * 100);
}

export function computeAutomationScore(stages: PipelineStage[]): AutomationScore {
  const byStage = Object.fromEntries(stages.map((s) => [s.id, s.automation])) as Record<
    StageId,
    AutomationLevel
  >;
  const internalPct = pct(stages, INTERNAL_STAGES);
  const endToEndPct = pct(stages, stages.map((s) => s.id));

  const explanation: string[] = [];
  const sorted = [...stages].sort(
    (a, b) =>
      STAGE_WEIGHTS[b.id] * (1 - LEVEL_VALUE[b.automation]) -
      STAGE_WEIGHTS[a.id] * (1 - LEVEL_VALUE[a.automation]),
  );
  for (const s of sorted.slice(0, 3)) {
    if (LEVEL_VALUE[s.automation] >= 1) continue;
    explanation.push(`${s.title}: ${s.automation} → ${s.nextUnlock}`);
  }
  if (explanation.length === 0) explanation.push('Todas las cajas en auto. Vigilar excepciones.');

  return { internalPct, endToEndPct, byStage, explanation };
}
