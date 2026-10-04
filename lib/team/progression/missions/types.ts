import type { TeamId } from '../../roles/teams';

export type TeamMissionPeriod = 'daily' | 'weekly' | 'monthly' | 'once';

/**
 * Definición versionada. No guarda progreso.
 * Cuenta resultados concedidos de una regla del mismo equipo (`team_xp.rule_granted`).
 */
export type TeamMissionDefinition = {
  id: string;
  teamId: TeamId;
  key: string;
  version: number;
  title: string;
  description: string;
  eventType: 'team_xp.rule_granted';
  ruleId: string;
  target: number;
  xpReward: number;
  period: TeamMissionPeriod;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export type TeamMissionProgress = {
  missionId: string;
  missionVersion: number;
  periodKey: string;
  progress: number;
  target: number;
  completedAt: string | null;
};

export type MissionAdvanceStatus = 'progressed' | 'completed' | 'already_completed' | 'duplicate' | 'skipped';
