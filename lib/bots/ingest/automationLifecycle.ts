/**
 * Day 4 — Automation lifecycle contract.
 * Stages of a candidate's path through the machine. Not "code ran".
 *
 * Actor per stage: AUTO | HUMAN | BLOCKED | FAILED | SKIPPED | DUPLICATE
 */

export const AUTOMATION_LIFECYCLE_STAGES = [
  'DISCOVERED',
  'CANONICALIZED',
  'EXTRACTED',
  'IDENTIFIED',
  'PM_ENRICHED',
  'OFFER_STANDARD',
  'DQE',
  'S6_1',
  'S7',
  'WRITTEN',
  'PENDING',
  'MODERATION',
  'PUBLISHED',
  'DISTRIBUTION',
] as const;

export type AutomationLifecycleStage = (typeof AUTOMATION_LIFECYCLE_STAGES)[number];

export type LifecycleActor =
  | 'AUTO'
  | 'HUMAN'
  | 'BLOCKED'
  | 'FAILED'
  | 'SKIPPED'
  | 'DUPLICATE';

export type LifecycleStageRecord = {
  stage: AutomationLifecycleStage;
  actor: LifecycleActor;
  reasonCode?: string | null;
};

/** Pipeline loss buckets for forensic PM / discovery analysis. */
export const PIPELINE_LOSS_CODES = [
  'NO_CANDIDATES',
  'FETCH_BLOCKED',
  'EXTRACTION_FAILED',
  'IDENTITY_FAILED',
  'PRICE_MISSING',
  'DUPLICATE',
  'DQE_BLOCK',
  'S6_1_BLOCK',
  'WRITER_BLOCK',
  'WRITE_FAILURE',
  'OTHER',
] as const;

export type PipelineLossCode = (typeof PIPELINE_LOSS_CODES)[number];

export type LifecycleCandidateTrace = {
  url: string;
  stages: LifecycleStageRecord[];
  terminalActor: LifecycleActor;
  lossCode: PipelineLossCode | null;
};

export function emptyStageCounts(): Record<AutomationLifecycleStage, Record<LifecycleActor, number>> {
  const actors: LifecycleActor[] = [
    'AUTO',
    'HUMAN',
    'BLOCKED',
    'FAILED',
    'SKIPPED',
    'DUPLICATE',
  ];
  const out = {} as Record<AutomationLifecycleStage, Record<LifecycleActor, number>>;
  for (const stage of AUTOMATION_LIFECYCLE_STAGES) {
    out[stage] = Object.fromEntries(actors.map((a) => [a, 0])) as Record<LifecycleActor, number>;
  }
  return out;
}

export function recordStage(
  counts: Record<AutomationLifecycleStage, Record<LifecycleActor, number>>,
  stage: AutomationLifecycleStage,
  actor: LifecycleActor,
): void {
  counts[stage][actor] += 1;
}

/**
 * Map gate / mint outcome → terminal actor + loss code.
 * Dry-run never yields WRITTEN/PENDING AUTO.
 */
export function classifyTerminalFromGate(input: {
  dryRun: boolean;
  extracted: boolean;
  identified: boolean;
  pmEnriched: boolean;
  dqeDecision: string | null;
  s61WouldInsert: boolean;
  mintOk?: boolean;
  mintDuplicate?: boolean;
  mintError?: string | null;
  fetchBlocked?: boolean;
}): { terminalActor: LifecycleActor; lossCode: PipelineLossCode | null } {
  if (input.fetchBlocked && !input.extracted) {
    return { terminalActor: 'BLOCKED', lossCode: 'FETCH_BLOCKED' };
  }
  if (!input.extracted) {
    return { terminalActor: 'FAILED', lossCode: 'EXTRACTION_FAILED' };
  }
  if (!input.identified) {
    return { terminalActor: 'FAILED', lossCode: 'IDENTITY_FAILED' };
  }
  if (input.mintDuplicate) {
    return { terminalActor: 'DUPLICATE', lossCode: 'DUPLICATE' };
  }
  if (input.mintOk === true && !input.dryRun) {
    return { terminalActor: 'AUTO', lossCode: null };
  }
  if (input.mintError) {
    const err = input.mintError.toLowerCase();
    if (err.includes('duplicate')) {
      return { terminalActor: 'DUPLICATE', lossCode: 'DUPLICATE' };
    }
    if (err.includes('write') || err.includes('auth') || err.includes('author')) {
      return { terminalActor: 'BLOCKED', lossCode: 'WRITER_BLOCK' };
    }
    return { terminalActor: 'FAILED', lossCode: 'WRITE_FAILURE' };
  }
  if (!input.s61WouldInsert) {
    const dqe = (input.dqeDecision ?? '').toUpperCase();
    if (dqe.includes('POTENTIAL') || dqe.includes('NO_VERIFIED') || dqe.includes('REJECT')) {
      return { terminalActor: 'BLOCKED', lossCode: 'DQE_BLOCK' };
    }
    return { terminalActor: 'BLOCKED', lossCode: 'S6_1_BLOCK' };
  }
  if (input.dryRun) {
    // Would insert but dry-run — not automated success
    return { terminalActor: 'BLOCKED', lossCode: 'WRITER_BLOCK' };
  }
  return { terminalActor: 'BLOCKED', lossCode: 'OTHER' };
}
