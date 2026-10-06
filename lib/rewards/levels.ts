/**
 * Progresión de participación de Rewards Beta.
 * Una sola regla. No lee Team XP, logros ni reputación.
 * No crea rewards, ledger ni payouts.
 */
import { REWARDS_CREATOR_SHARE_BPS } from '@/lib/rewards/config';

export const REWARDS_LEVEL_COUNT = 8;
export const REWARDS_WELCOME_DAYS = 7;

/** Recompensa que ya cuenta para subir de nivel. Cancelada o revertida no cuenta. */
export const REWARDS_VALID_STATUSES = ['PENDING', 'VALIDATING', 'AVAILABLE', 'PAID'] as const;

export function rewardsLevelShareBps(level: number): number {
  const clamped = Math.min(REWARDS_LEVEL_COUNT, Math.max(1, Math.trunc(level)));
  return Math.round((REWARDS_CREATOR_SHARE_BPS * clamped) / REWARDS_LEVEL_COUNT);
}

export type RewardsProgression = {
  phase: 'welcome' | 'level';
  shareBps: number;
  level: number | null;
  nextShareBps: number | null;
  welcomeDaysLeft: number | null;
  title: string;
  detail: string;
};

function percent(bps: number): number {
  return Math.round(bps / 100);
}

/**
 * Bienvenida: el máximo durante 7 días desde la entrada.
 * Si ese plazo cierra sin una recompensa válida, queda el nivel 1.
 * Cada recompensa válida sube un nivel, con techo en el máximo.
 */
export function resolveRewardsProgression(input: {
  enrolledAt: string;
  validRewardCount: number;
  now?: Date;
}): RewardsProgression {
  const now = input.now ?? new Date();
  const enrolled = new Date(input.enrolledAt);
  const rewards = Number.isFinite(input.validRewardCount) ? Math.max(0, Math.trunc(input.validRewardCount)) : 0;
  const welcomeMs = REWARDS_WELCOME_DAYS * 24 * 60 * 60 * 1000;
  const enrolledMs = enrolled.getTime();
  const inWelcome = Number.isFinite(enrolledMs) && now.getTime() < enrolledMs + welcomeMs;

  if (inWelcome) {
    const daysLeft = Math.max(1, Math.ceil((enrolledMs + welcomeMs - now.getTime()) / (24 * 60 * 60 * 1000)));
    return {
      phase: 'welcome',
      shareBps: REWARDS_CREATOR_SHARE_BPS,
      level: null,
      nextShareBps: null,
      welcomeDaysLeft: daysLeft,
      title: `Bienvenida — ${percent(REWARDS_CREATOR_SHARE_BPS)}%`,
      detail:
        rewards === 0
          ? `Te quedan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'} para desbloquear tu primera recompensa.`
          : `Te quedan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'} de bienvenida.`,
    };
  }

  const level = Math.min(REWARDS_LEVEL_COUNT, Math.max(1, rewards));
  const shareBps = rewardsLevelShareBps(level);
  const nextShareBps = level < REWARDS_LEVEL_COUNT ? rewardsLevelShareBps(level + 1) : null;
  return {
    phase: 'level',
    shareBps,
    level,
    nextShareBps,
    welcomeDaysLeft: null,
    title: `Nivel ${level} — ${percent(shareBps)}%`,
    detail: nextShareBps == null ? 'Este es el máximo.' : `Tu siguiente nivel: ${percent(nextShareBps)}%`,
  };
}
