import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MEMBER_STATUS_COPY,
  PROGRAM_STATUS_COPY,
  buildRewardsOnboarding,
  resolveRewardsMemberStatus,
  resolveRewardsProgramStatus,
  rewardsHeroCopy,
  type RewardsOnboarding,
} from '@/lib/rewards/onboarding';
import {
  REWARDS_HOLD_DAYS,
  REWARDS_MIN_ACCOUNT_AGE_DAYS,
  REWARDS_REQUIRED_APPROVED_OFFERS,
  REWARDS_REQUIRED_POSITIVE_VOTES,
} from '@/lib/rewards/config';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const allText = (g: RewardsOnboarding) =>
  [
    ...g.journey.flatMap((s) => [s.verb, s.description]),
    ...g.layers.flatMap((l) => [l.title, l.summary, ...l.points]),
    ...g.counts,
    ...g.doesNotCount,
    ...g.pending,
    ...g.withdrawal,
    ...g.abuse,
    ...g.guarantees,
    g.whenReceive,
    g.locked ?? '',
  ].join('\n');

/** Texto que habla de dinero: capas monetarias y "cuándo recibo". Los requisitos (p. ej. 50% de aprobación) no cuentan. */
const moneyFacing = (g: RewardsOnboarding) =>
  [...g.layers.filter((l) => l.money).flatMap((l) => [l.summary, ...l.points]), g.whenReceive].join('\n');

const MISLEADING = /dinero f[aá]cil|garantizad|cada oferta te paga|cada clic genera|desbloquea dinero/i;

describe('estado del programa', () => {
  it('se deriva de REWARDS_PROGRAM_ACTIVE y MONEY_PATH_FROZEN, con pausa por encima del freeze', () => {
    expect(resolveRewardsProgramStatus({ programActive: false, moneyPathFrozen: false })).toBe('PAUSED');
    expect(resolveRewardsProgramStatus({ programActive: false, moneyPathFrozen: true })).toBe('PAUSED');
    expect(resolveRewardsProgramStatus({ programActive: true, moneyPathFrozen: true })).toBe('FROZEN');
    expect(resolveRewardsProgramStatus({ programActive: true, moneyPathFrozen: false })).toBe('ACTIVE');
  });

  it('el estado del cazador sale del claimPhase existente', () => {
    expect(resolveRewardsMemberStatus('locked')).toBe('LOCKED');
    expect(resolveRewardsMemberStatus('unlocked')).toBe('ELIGIBLE');
    expect(resolveRewardsMemberStatus('pending_selection')).toBe('ELIGIBLE');
    expect(resolveRewardsMemberStatus('complete')).toBe('UNLOCKED');
    expect(Object.keys(MEMBER_STATUS_COPY).sort()).toEqual(['ELIGIBLE', 'LOCKED', 'UNLOCKED']);
  });

  it('pausado: lo dice, frena desbloqueos nuevos y marca en pausa toda capa de dinero', () => {
    const g = buildRewardsOnboarding('PAUSED');
    expect(PROGRAM_STATUS_COPY.PAUSED.label).toMatch(/pausa/i);
    expect(g.locked).toMatch(/en pausa/);
    expect(g.layers.filter((l) => l.money).every((l) => l.status === 'paused')).toBe(true);
  });

  it('congelado: el programa abre desbloqueos pero nada se paga', () => {
    const g = buildRewardsOnboarding('FROZEN');
    expect(g.locked).toBeNull();
    expect(g.layers.filter((l) => l.money).every((l) => l.status === 'frozen')).toBe(true);
    expect(g.whenReceive).toMatch(/congelados/);
    expect(PROGRAM_STATUS_COPY.FROZEN.description).toMatch(/Nada se paga/);
  });
});

describe('Rewards apagado o congelado no promete dinero', () => {
  for (const status of ['PAUSED', 'FROZEN'] as const) {
    it(`${status}: sin tasas, saldo disponible ni mínimos de retiro`, () => {
      const g = buildRewardsOnboarding(status);
      const money = moneyFacing(g);
      expect(money).not.toMatch(/\d+\s*%/);
      expect(money).not.toMatch(/\$\s?\d/);
      expect(money).not.toContain(`${REWARDS_HOLD_DAYS} días`);
    });
  }

  it('ningún estado usa lenguaje engañoso y todos niegan garantías', () => {
    for (const status of ['ACTIVE', 'FROZEN', 'PAUSED'] as const) {
      const g = buildRewardsOnboarding(status);
      expect(allText(g)).not.toMatch(MISLEADING);
      expect(g.guarantees.join(' ')).toMatch(/no garantiza/);
      expect(g.guarantees.join(' ')).toMatch(/puede pausarse/);
    }
  });

  it('la primera pantalla pausada o congelada no ofrece pagos actuales', () => {
    for (const status of ['PAUSED', 'FROZEN'] as const) {
      const hero = rewardsHeroCopy(status, { sharePct: 80, firstLevelPct: 40, minLabel: '$200', holdDays: 60 });
      expect(hero.paymentsAvailable).toBe(false);
      expect(hero.title).toMatch(/no están disponibles/);
      expect(hero.title).not.toMatch(/recompensas reales/);
      expect(hero.facts.map((fact) => fact.body).join(' ')).not.toMatch(/^por SPEI$/);
      expect(hero.facts.some((fact) => fact.title === 'Pagos' && fact.body === 'No disponibles')).toBe(true);
      expect(hero.body).toMatch(/Hoy no se puede cobrar/);
      expect(hero.body).toMatch(/Cuando el programa esté activo/);
    }
  });

  it('la primera pantalla activa sí explica el pago condicionado al programa', () => {
    const hero = rewardsHeroCopy('ACTIVE', { sharePct: 80, firstLevelPct: 40, minLabel: '$200', holdDays: 60 });
    expect(hero.paymentsAvailable).toBe(true);
    expect(hero.facts.some((fact) => fact.body === 'por SPEI')).toBe(true);
  });

  it('activo: explica tasa, validación y que sin comisión no hay recompensa', () => {
    const g = buildRewardsOnboarding('ACTIVE');
    const text = moneyFacing(g);
    expect(text).toMatch(/hasta \d+%/);
    expect(text).toContain(`${REWARDS_HOLD_DAYS} días`);
    expect(text).toMatch(/no hay recompensa/);
  });
});

describe('XP, reputación y logros no son dinero', () => {
  const g = buildRewardsOnboarding('ACTIVE');

  it('XP y reputación son capas no monetarias, aun con el programa activo', () => {
    const xp = g.layers.find((l) => l.id === 'xp')!;
    const reputation = g.layers.find((l) => l.id === 'reputation')!;
    expect(xp.money).toBe(false);
    expect(reputation.money).toBe(false);
    expect(xp.summary).toMatch(/nunca se convierte en dinero/);
    expect(reputation.summary).toMatch(/no dinero/);
  });

  it('la ruta del dinero es recompensa → disponible → retiro, en ese orden', () => {
    expect(g.layers.filter((l) => l.money).map((l) => l.id)).toEqual(['reward', 'available', 'payout']);
  });

  it('XP y nivel aparecen en "no cuenta"', () => {
    expect(g.doesNotCount.join(' ')).toMatch(/XP de logros, nivel o reputación/);
  });

  it('el XP de logros no entra en la fórmula de reputación (SQL)', () => {
    const sql = read('supabase/migrations/0009_achievements.sql');
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.recalculate_user_reputation');
    const end = sql.indexOf('$$;', start);
    expect(start).toBeGreaterThan(-1);
    const body = sql
      .slice(start, end)
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(body).not.toMatch(/achievement_xp/);
    const grantStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.grant_achievement_xp');
    expect(sql.slice(grantStart, sql.indexOf('$$;', grantStart))).not.toMatch(/recalculate_user_reputation/);
  });
});

describe('requisitos y contenido salen de la configuración central', () => {
  it('usa las constantes de config.ts', () => {
    const text = allText(buildRewardsOnboarding('PAUSED'));
    expect(text).toContain(`${REWARDS_REQUIRED_APPROVED_OFFERS} ofertas aprobadas`);
    expect(text).toContain(`${REWARDS_REQUIRED_POSITIVE_VOTES} personas distintas`);
    expect(text).toContain(`${REWARDS_MIN_ACCOUNT_AGE_DAYS} días de antigüedad`);
  });

  it('el onboarding no hardcodea tasas ni montos', () => {
    const src = read('lib/rewards/onboarding.ts');
    expect(src).not.toMatch(/\b(4000|20_?000|60)\b/);
    expect(read('app/me/RewardsProgramGuide.tsx')).not.toMatch(/\d+\s*%|\$\d/);
  });
});

describe('superficies de Rewards', () => {
  it('el panel deriva el estado real y falla cerrado si falta el freeze', () => {
    const panel = read('app/me/RewardsProgramPanel.tsx');
    expect(panel).toContain('<RewardsProgramGuide');
    expect(panel).toContain('moneyPathFrozen: data.moneyPathFrozen ?? true');
    expect(panel).toMatch(/programStatus === 'ACTIVE' \?/);
    expect(panel).not.toMatch(/Estás cada vez más cerca/);
  });

  it('la API de estado expone el freeze real sin escribir dinero', () => {
    const route = read('app/api/me/rewards/status/route.ts');
    expect(route).toContain('moneyPathFrozen: isMoneyPathFrozen()');
    expect(route).not.toMatch(/createManualRewardPayout|payout_intents|ledger/);
  });

  it('retos y guías no dicen que se "gana" algo con XP o reputación', () => {
    expect(read('app/plaza/HuntCenter.tsx')).not.toMatch(/gana XP/);
    expect(read('app/descubre/components/GuideHub.tsx')).not.toMatch(/desbloquea beneficios|Y GANA/);
    expect(read('app/descubre/guides/content.ts')).not.toMatch(/cooldowns más cortos/);
  });
});
