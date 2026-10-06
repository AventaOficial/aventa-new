import { describe, expect, it } from 'vitest';
import { REWARDS_CREATOR_SHARE_BPS } from '@/lib/rewards/config';
import { resolveRewardsProgression, rewardsLevelShareBps } from '@/lib/rewards/levels';

const enrolled = '2026-10-01T00:00:00.000Z';

describe('rewards levels', () => {
  it('el máximo es 40% y cada nivel sube 5 puntos', () => {
    expect(rewardsLevelShareBps(1)).toBe(500);
    expect(rewardsLevelShareBps(8)).toBe(REWARDS_CREATOR_SHARE_BPS);
    expect(rewardsLevelShareBps(9)).toBe(REWARDS_CREATOR_SHARE_BPS);
    expect(rewardsLevelShareBps(0)).toBe(500);
  });

  it('la bienvenida es 40% durante 7 días', () => {
    const view = resolveRewardsProgression({
      enrolledAt: enrolled,
      validRewardCount: 0,
      now: new Date('2026-10-03T00:00:00.000Z'),
    });
    expect(view.phase).toBe('welcome');
    expect(view.shareBps).toBe(4000);
    expect(view.title).toBe('Bienvenida — 40%');
    expect(view.detail).toBe('Te quedan 5 días para desbloquear tu primera recompensa.');
  });

  it('sin recompensa válida al día 7 empieza en nivel 1', () => {
    const view = resolveRewardsProgression({
      enrolledAt: enrolled,
      validRewardCount: 0,
      now: new Date('2026-10-08T00:00:00.000Z'),
    });
    expect(view).toMatchObject({
      phase: 'level',
      level: 1,
      shareBps: 500,
      title: 'Nivel 1 — 5%',
      detail: 'Tu siguiente nivel: 10%',
    });
  });

  it('cada recompensa válida sube un nivel y 40% es el techo', () => {
    const mid = resolveRewardsProgression({
      enrolledAt: enrolled,
      validRewardCount: 3,
      now: new Date('2026-11-01T00:00:00.000Z'),
    });
    expect(mid.level).toBe(3);
    expect(mid.shareBps).toBe(1500);
    const top = resolveRewardsProgression({
      enrolledAt: enrolled,
      validRewardCount: 12,
      now: new Date('2026-11-01T00:00:00.000Z'),
    });
    expect(top.level).toBe(8);
    expect(top.shareBps).toBe(4000);
    expect(top.nextShareBps).toBeNull();
  });
});
