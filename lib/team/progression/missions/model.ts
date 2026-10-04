import type { MissionAdvanceStatus, TeamMissionProgress } from './types';

/**
 * Modelo puro de `advance_team_mission`. Las llamadas llegan serializadas por el
 * advisory lock; este modelo replica ese orden para probar idempotencia y completitud.
 */
export type MissionLedgerState = {
  events: ReadonlySet<string>;
  progress: ReadonlyMap<string, TeamMissionProgress>;
  completions: ReadonlySet<string>;
  xpGranted: number;
};

export const EMPTY_MISSION_LEDGER: MissionLedgerState = {
  events: new Set(),
  progress: new Map(),
  completions: new Set(),
  xpGranted: 0,
};

export type MissionAdvanceInput = {
  userId: string;
  activeMember: boolean;
  missionId: string;
  missionVersion: number;
  periodKey: string;
  sourceKey: string;
  target: number;
  xp: number;
  completedAt: string;
};

function instanceKey(input: MissionAdvanceInput): string {
  return `${input.userId}:${input.missionId}:v${input.missionVersion}:${input.periodKey}`;
}

export function commitMissionEvent(
  state: MissionLedgerState,
  input: MissionAdvanceInput,
): { state: MissionLedgerState; status: MissionAdvanceStatus } {
  if (!input.activeMember) return { state, status: 'skipped' };
  const instance = instanceKey(input);
  const eventKey = `${instance}:${input.sourceKey}`;
  if (state.events.has(eventKey)) return { state, status: 'duplicate' };

  const events = new Set(state.events);
  events.add(eventKey);
  const current = state.progress.get(instance);
  if (current?.completedAt) return { state: { ...state, events }, status: 'already_completed' };

  const progressValue = Math.min(input.target, (current?.progress ?? 0) + 1);
  const done = progressValue >= input.target;
  const progress = new Map(state.progress);
  progress.set(instance, {
    missionId: input.missionId,
    missionVersion: input.missionVersion,
    periodKey: input.periodKey,
    progress: progressValue,
    target: input.target,
    completedAt: done ? input.completedAt : null,
  });
  if (!done) return { state: { ...state, events, progress }, status: 'progressed' };
  if (state.completions.has(instance)) return { state: { ...state, events, progress }, status: 'already_completed' };

  const completions = new Set(state.completions);
  completions.add(instance);
  return {
    state: { events, progress, completions, xpGranted: state.xpGranted + input.xp },
    status: 'completed',
  };
}
