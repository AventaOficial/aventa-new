import type { TeamId } from '../roles/teams';

function formatCount(count: number): string {
  return new Intl.NumberFormat('es-MX').format(count);
}

export type TeamXpSummary = {
  scope: 'team';
  teamId: TeamId;
  label: 'Team XP';
  value: string;
};

/** `null` significa que la lectura no respondió. Cero es un acumulado real. */
export function teamXpSummary(teamId: TeamId, balance: number | null): TeamXpSummary | null {
  if (balance === null || !Number.isFinite(balance)) return null;
  return { scope: 'team', teamId, label: 'Team XP', value: formatCount(balance) };
}

/** Etiqueta del selector. No incluye Community XP. */
export function formatTeamXpLabel(balance: number | null): string | null {
  if (balance === null || !Number.isFinite(balance)) return null;
  return `${formatCount(balance)} Team XP`;
}
