import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRewardsOnboarding } from '@/lib/rewards/onboarding';
import {
  REWARDS_HOLD_DAYS,
  REWARDS_MIN_ACCOUNT_AGE_DAYS,
  REWARDS_REQUIRED_APPROVED_OFFERS,
  REWARDS_REQUIRED_POSITIVE_VOTES,
} from '@/lib/rewards/config';

const allText = (g: ReturnType<typeof buildRewardsOnboarding>) =>
  [
    ...g.layers.flatMap((l) => [l.title, l.summary, ...l.points]),
    ...g.counts,
    ...g.doesNotCount,
    ...g.abuse,
    ...g.states.flatMap((s) => [s.label, s.description]),
    g.whenReceive,
    g.locked ?? '',
  ].join('\n');

describe('buildRewardsOnboarding', () => {
  it('separa gamificación, recompensas y programa monetario', () => {
    const g = buildRewardsOnboarding(false);
    expect(g.layers.map((l) => l.id)).toEqual(['gamification', 'recognition', 'monetary']);
    expect(g.layers.find((l) => l.id === 'gamification')?.summary).toMatch(/nunca se convierte en dinero/i);
  });

  it('con el programa cerrado no promete pagos, porcentajes ni saldos', () => {
    const g = buildRewardsOnboarding(false);
    const text = allText(g);
    const moneyFacing = [
      ...g.layers.filter((l) => l.id !== 'gamification').flatMap((l) => [l.summary, ...l.points]),
      ...g.states.flatMap((s) => [s.label, s.description]),
      g.whenReceive,
    ].join('\n');
    expect(moneyFacing).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/disponible|retiro|saldo a tu favor/i);
    expect(g.layers.find((l) => l.id === 'monetary')).toMatchObject({ status: 'closed' });
    expect(g.locked).toMatch(/en pausa/);
    expect(g.whenReceive).toMatch(/no hay pagos/i);
  });

  it('con el programa activo explica validación y que sin comisión no hay recompensa', () => {
    const g = buildRewardsOnboarding(true);
    const monetary = g.layers.find((l) => l.id === 'monetary')!;
    expect(monetary.status).toBe('active');
    expect(monetary.points.join(' ')).toContain(`${REWARDS_HOLD_DAYS} días`);
    expect(monetary.points.join(' ')).toMatch(/Sin comisión atribuible no hay recompensa/);
    expect(g.locked).toBeNull();
  });

  it('los requisitos salen de la configuración central', () => {
    const text = allText(buildRewardsOnboarding(false));
    expect(text).toContain(`${REWARDS_REQUIRED_APPROVED_OFFERS} ofertas aprobadas`);
    expect(text).toContain(`${REWARDS_REQUIRED_POSITIVE_VOTES} personas distintas`);
    expect(text).toContain(`${REWARDS_MIN_ACCOUNT_AGE_DAYS} días de antigüedad`);
  });

  it('XP y nivel están en "no cuenta" para el programa', () => {
    expect(buildRewardsOnboarding(false).doesNotCount.join(' ')).toMatch(/XP de logros/);
  });
});

describe('Superficies de progresión sin promesas de dinero', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('el panel del cazador incluye la guía y no anima a un desbloqueo en pausa', () => {
    const panel = read('app/me/RewardsProgramPanel.tsx');
    expect(panel).toContain('<RewardsProgramGuide');
    expect(panel).not.toMatch(/Estás cada vez más cerca/);
  });

  it('retos y guías no dicen que se "gana" algo con XP o reputación', () => {
    expect(read('app/plaza/HuntCenter.tsx')).not.toMatch(/gana XP/);
    expect(read('app/descubre/components/GuideHub.tsx')).not.toMatch(/desbloquea beneficios|Y GANA/);
    expect(read('app/descubre/guides/content.ts')).not.toMatch(/cooldowns más cortos/);
  });
});
