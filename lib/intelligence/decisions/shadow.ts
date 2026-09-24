/**
 * A shadow decision records what intelligence would have done.
 * mutatesProduction is fixed false. The table check repeats that invariant.
 */

import { clampDecisionStage, type DecisionSystem } from '@/lib/intelligence/decisions/stage';

export type ShadowDecision = {
  system: DecisionSystem;
  stage: 'observe' | 'shadow';
  version: string;
  decision: string;
  evidence: string[];
  idempotencyKey: string;
  decidedAt: string;
  outcome: null;
  mutatesProduction: false;
};

export function buildShadowDecision(input: {
  system: DecisionSystem;
  version: string;
  decision: string;
  evidence: string[];
  subjectKey: string;
  decidedAt?: string;
}): ShadowDecision {
  const stage = clampDecisionStage(input.system, 'shadow');
  const decidedAt = input.decidedAt ?? new Date().toISOString();
  const day = decidedAt.slice(0, 10);
  const storedStage = stage === 'observe' ? 'observe' : 'shadow';
  return {
    system: input.system,
    stage: storedStage,
    version: input.version,
    decision: input.decision,
    evidence: input.evidence.slice(0, 20),
    idempotencyKey: `${input.system}:${input.version}:${input.subjectKey}:${day}`.slice(0, 240),
    decidedAt,
    outcome: null,
    mutatesProduction: false,
  };
}
