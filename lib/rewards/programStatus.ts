/**
 * Activación del Programa de Recompensas.
 * P0-1: SOLO REWARDS_PROGRAM_ACTIVE. COMMISSION_PROGRAM_ACTIVE no activa Rewards
 * (legacy commissions vive en lib/commissions/programStatus.ts).
 * Ausente / vacío / inválido → fail-closed (OFF).
 */
export function isRewardsProgramActive(): boolean {
  const rewards = (process.env.REWARDS_PROGRAM_ACTIVE ?? '').trim().toLowerCase();
  return rewards === 'true' || rewards === '1' || rewards === 'yes';
}
