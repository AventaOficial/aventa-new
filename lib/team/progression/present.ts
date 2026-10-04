import type { TeamLevel } from './levels';
import type { TeamLeaderboardPeriod } from './leaderboard/types';

function count(value: number): string {
  return new Intl.NumberFormat('es-MX').format(value);
}

/** Reconocimiento del trabajo validado por regla. Sin regla conocida, sin texto. */
export function recognitionLine(ruleId: string, total: number): string | null {
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  switch (ruleId) {
    case 'moderation.offer_decision':
      return total === 1 ? 'Has ayudado a validar 1 oferta' : `Has ayudado a validar ${count(total)} ofertas`;
    case 'hunter.batch_item_published':
      return total === 1
        ? '1 hallazgo tuyo ya está publicado'
        : `${count(total)} hallazgos tuyos ya están publicados`;
    default:
      return null;
  }
}

export function streakLine(current: number): string {
  if (current <= 0) return 'Sin racha activa. Un día cuenta cuando tu trabajo queda validado.';
  return current === 1 ? '1 día con trabajo validado' : `${count(current)} días seguidos con trabajo validado`;
}

export function levelLine(level: TeamLevel): { title: string; detail: string } {
  const title = `Nivel ${level.level}`;
  if (level.xpToNext === null) return { title, detail: 'Nivel más alto de este equipo' };
  return { title, detail: `${count(level.xpToNext)} Team XP para el nivel ${level.level + 1}` };
}

export const LEADERBOARD_PERIOD_LABEL: Record<TeamLeaderboardPeriod, string> = {
  daily: 'Hoy',
  weekly: 'Esta semana',
  monthly: 'Este mes',
  all_time: 'Histórico',
};

export const TEAM_XP_EXPLAINER =
  'Team XP mide trabajo validado en este equipo. Tu XP de comunidad es aparte y no cuenta aquí.';

export function formatTeamXp(value: number): string {
  return `${count(value)} Team XP`;
}
