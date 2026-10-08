/**
 * Riesgo económico explicable. No bloquea a un cazador solo por tener éxito.
 * MACHINE_HUNTER, SYSTEM y UNKNOWN no reciben recompensa de creador humano.
 */

import type { ActorType } from '@/lib/actors/actorType';

export type EconomicRiskLevel = 'LOW' | 'REVIEW' | 'BLOCKED';

export type CreatorRewardActor = ActorType | 'UNKNOWN';

export type EconomicRiskSignal =
  | 'velocity'
  | 'repeated_attribution'
  | 'suspicious_clicks'
  | 'self_attribution'
  | 'duplicate_account'
  | 'reward_concentration'
  | 'repeated_cancellations'
  | 'anomalous_conversion';

export type EconomicRiskDecision = {
  level: EconomicRiskLevel;
  eligibleForCreatorReward: boolean;
  reasons: string[];
};

export function creatorRewardActorDecision(actor: CreatorRewardActor | null | undefined): EconomicRiskDecision {
  if (actor == null || actor === 'UNKNOWN') {
    return { level: 'BLOCKED', eligibleForCreatorReward: false, reasons: ['unknown_actor'] };
  }
  if (actor === 'MACHINE_HUNTER' || actor === 'SYSTEM') {
    return { level: 'BLOCKED', eligibleForCreatorReward: false, reasons: [`actor_${actor.toLowerCase()}`] };
  }
  return { level: 'LOW', eligibleForCreatorReward: true, reasons: [] };
}

export function evaluateEconomicRisk(input: {
  actor: CreatorRewardActor | null | undefined;
  signals?: readonly EconomicRiskSignal[];
}): EconomicRiskDecision {
  const actorDecision = creatorRewardActorDecision(input.actor);
  if (!actorDecision.eligibleForCreatorReward) return actorDecision;
  const signals = input.signals ?? [];
  if (signals.length === 0) return actorDecision;
  return {
    level: 'REVIEW',
    eligibleForCreatorReward: false,
    reasons: signals.map((signal) => `review_${signal}`),
  };
}
