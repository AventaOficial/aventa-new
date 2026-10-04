export const TEAM_LEADERBOARD_PERIODS = ['daily', 'weekly', 'monthly', 'all_time'] as const;

export type TeamLeaderboardPeriod = (typeof TEAM_LEADERBOARD_PERIODS)[number];

export function isTeamLeaderboardPeriod(value: string): value is TeamLeaderboardPeriod {
  return (TEAM_LEADERBOARD_PERIODS as readonly string[]).includes(value);
}

/** Lo que llega a la UI: sin user ids. Solo Team XP automático. */
export type TeamLeaderboardEntry = {
  position: number;
  displayName: string;
  teamXp: number;
  isSelf: boolean;
};

export type TeamLeaderboardSelf = {
  position: number | null;
  teamXp: number;
  rankedMembers: number;
};

export type TeamLeaderboard = {
  metric: 'team_xp';
  period: TeamLeaderboardPeriod;
  top: TeamLeaderboardEntry[];
  self: TeamLeaderboardSelf | null;
};
