import { TEAM_XP_RULES } from '../../xp/rules/catalog';
import type { TeamXpRule } from '../../xp/rules/types';
import type { TeamId } from '../../roles/teams';
import { teamDay, weekStartDay } from '../time';
import { TEAM_MISSIONS } from './catalog';
import type { TeamMissionDefinition, TeamMissionPeriod } from './types';

const KEY_PATTERN = /^[a-z0-9_]+$/;

/** Llave del periodo en Ciudad de México. Coincide con el patrón de `advance_team_mission`. */
export function missionPeriodKey(period: TeamMissionPeriod, occurredAt: string): string | null {
  if (period === 'once') return 'once';
  const day = teamDay(occurredAt);
  if (!day) return null;
  if (period === 'daily') return `day:${day}`;
  if (period === 'weekly') return `week:${weekStartDay(day)}`;
  return `month:${day.slice(0, 7)}`;
}

export function missionProblems(
  mission: TeamMissionDefinition,
  rules: readonly TeamXpRule[] = TEAM_XP_RULES,
): string[] {
  const problems: string[] = [];
  if (!KEY_PATTERN.test(mission.key)) problems.push('key');
  if (mission.id !== `${mission.teamId}.${mission.key}` || mission.id.length > 64) problems.push('id');
  if (!Number.isInteger(mission.version) || mission.version < 1) problems.push('version');
  if (!Number.isInteger(mission.target) || mission.target < 1 || mission.target > 1000) problems.push('target');
  if (!Number.isInteger(mission.xpReward) || mission.xpReward < 0 || mission.xpReward > 1000) problems.push('xp');
  const rule = rules.find((item) => item.id === mission.ruleId);
  if (!rule || rule.teamId !== mission.teamId) problems.push('rule');
  if (mission.title.trim().length === 0 || mission.description.trim().length === 0) problems.push('copy');
  const starts = mission.startsAt === null ? null : Date.parse(mission.startsAt);
  const ends = mission.endsAt === null ? null : Date.parse(mission.endsAt);
  if ((starts !== null && Number.isNaN(starts)) || (ends !== null && Number.isNaN(ends))) problems.push('window');
  else if (starts !== null && ends !== null && starts >= ends) problems.push('window');
  return problems;
}

function withinWindow(mission: TeamMissionDefinition, occurredAt: string): boolean {
  const at = Date.parse(occurredAt);
  if (Number.isNaN(at)) return false;
  if (mission.startsAt !== null && at < Date.parse(mission.startsAt)) return false;
  if (mission.endsAt !== null && at >= Date.parse(mission.endsAt)) return false;
  return true;
}

export type MissionStep = { mission: TeamMissionDefinition; periodKey: string };

/**
 * Misiones que avanza un resultado concedido. El equipo y la regla salen del resultado
 * persistido; una misión inválida o de otro equipo no avanza.
 */
export function missionsForGrant(
  grant: { teamId: TeamId; ruleId: string; occurredAt: string },
  missions: readonly TeamMissionDefinition[] = TEAM_MISSIONS,
  rules: readonly TeamXpRule[] = TEAM_XP_RULES,
): MissionStep[] {
  const steps: MissionStep[] = [];
  for (const mission of missions) {
    if (!mission.active || mission.teamId !== grant.teamId || mission.ruleId !== grant.ruleId) continue;
    if (missionProblems(mission, rules).length > 0) continue;
    if (!withinWindow(mission, grant.occurredAt)) continue;
    const periodKey = missionPeriodKey(mission.period, grant.occurredAt);
    if (periodKey) steps.push({ mission, periodKey });
  }
  return steps;
}

export function activeMissionsForTeam(
  teamId: TeamId,
  now: Date,
  missions: readonly TeamMissionDefinition[] = TEAM_MISSIONS,
): TeamMissionDefinition[] {
  const iso = now.toISOString();
  return missions.filter(
    (mission) => mission.active && mission.teamId === teamId && missionProblems(mission).length === 0 && withinWindow(mission, iso),
  );
}
