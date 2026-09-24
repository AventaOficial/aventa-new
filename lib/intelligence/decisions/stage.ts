/**
 * Decision stages. Nothing in this layer is allowed to reach enabled.
 */

export const DECISION_STAGES = ['observe', 'shadow', 'canary', 'enabled'] as const;
export type DecisionStage = (typeof DECISION_STAGES)[number];

export type DecisionSystem =
  | 'ranking_intelligence'
  | 'supply_priority'
  | 'personalization'
  | 'price_anomaly'
  | 'demand_signal';

const STAGE_RANK: Record<DecisionStage, number> = {
  observe: 0,
  shadow: 1,
  canary: 2,
  enabled: 3,
};

/** Ceiling. Enabled is refused for every system here. */
export const DECISION_STAGE_CAP: Record<DecisionSystem, DecisionStage> = {
  ranking_intelligence: 'shadow',
  supply_priority: 'shadow',
  personalization: 'shadow',
  price_anomaly: 'observe',
  demand_signal: 'shadow',
};

export function stageIsAllowed(system: DecisionSystem, requested: DecisionStage): boolean {
  return STAGE_RANK[requested] <= STAGE_RANK[DECISION_STAGE_CAP[system]];
}

export function clampDecisionStage(system: DecisionSystem, requested: DecisionStage): DecisionStage {
  return stageIsAllowed(system, requested) ? requested : DECISION_STAGE_CAP[system];
}
