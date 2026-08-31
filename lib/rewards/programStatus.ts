/**
 * El Programa de Recompensas permanece apagado hasta activación explícita del owner.
 * COMMISSION_PROGRAM_ACTIVE también permanece false (compat legacy).
 */
export function isRewardsProgramActive(): boolean {
  const rewards = (process.env.REWARDS_PROGRAM_ACTIVE ?? '').trim().toLowerCase();
  if (rewards === 'true' || rewards === '1' || rewards === 'yes') return true;
  const legacy = (process.env.COMMISSION_PROGRAM_ACTIVE ?? 'false').trim().toLowerCase();
  return legacy === 'true' || legacy === '1' || legacy === 'yes';
}
