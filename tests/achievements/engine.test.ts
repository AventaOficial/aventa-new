import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_CATALOG } from '@/lib/achievements/catalog';
import { claimAchievementXp, projectAchievements, achievementIsConcealed } from '@/lib/achievements/evaluate';
import { foldAchievementEvents } from '@/lib/achievements/fold';
import { presentCatalog } from '@/lib/achievements/present';
import type { AchievementDomainEvent } from '@/lib/achievements/types';
import { REPUTATION_LEVELS } from '@/lib/reputation';

const USER = 'user-1';
const noon = (day: string) => `${day}T18:00:00.000Z`;

function approved(id: string, day: string, extra: Partial<AchievementDomainEvent> = {}): AchievementDomainEvent {
  return {
    type: 'OFFER_APPROVED',
    eventId: id,
    offerId: id,
    at: noon(day),
    clean: true,
    qualifies: false,
    deleted: false,
    duplicate: false,
    gateFailed: false,
    ...extra,
  };
}

function projection(code: string, events: AchievementDomainEvent[], level = 1) {
  const facts = foldAchievementEvents(events, { reputationLevel: level });
  const row = projectAchievements(facts).find((item) => item.code === code);
  if (!row) throw new Error(`falta ${code}`);
  return { facts, row };
}

describe('logros de Aventa', () => {
  it('el primer logro es una oferta aprobada, no una creada', () => {
    const before = projection('first_trail', []);
    expect(before.row.unlocked).toBe(false);
    const after = projection('first_trail', [approved('o1', '2026-03-01')]);
    expect(after.row.unlocked).toBe(true);
    expect(after.row.progress).toBe(1);
    expect(ACHIEVEMENT_CATALOG.find((item) => item.code === 'first_trail')?.xpReward).toBe(50);
  });

  it('muestra progreso parcial antes del desbloqueo', () => {
    const events = Array.from({ length: 42 }, (_, index) => approved(`o${index}`, '2026-03-01'));
    const { row } = projection('eagle_eye', events);
    expect(row.progress).toBe(42);
    expect(row.target).toBe(50);
    expect(row.unlocked).toBe(false);
    expect(row.percent).toBeGreaterThan(0);
    expect(row.percent).toBeLessThan(100);
  });

  it('desbloquea ojo de águila con 50 aprobadas y 90% de tasa', () => {
    const events = [
      ...Array.from({ length: 50 }, (_, index) => approved(`o${index}`, '2026-04-01')),
      ...Array.from({ length: 4 }, (_, index) => ({
        type: 'OFFER_REJECTED' as const,
        eventId: `r${index}`,
        offerId: `r${index}`,
        at: noon('2026-04-02'),
      })),
    ];
    const { row } = projection('eagle_eye', events);
    expect(row.unlocked).toBe(true);
    expect(ACHIEVEMENT_CATALOG.find((item) => item.code === 'eagle_eye')?.xpReward).toBe(250);
  });

  it('no entrega XP dos veces por el mismo logro', () => {
    const granted = new Set<string>();
    expect(claimAchievementXp(granted, USER, 'eagle_eye', 250)).toBe(250);
    expect(claimAchievementXp(granted, USER, 'eagle_eye', 250)).toBe(0);
    expect(claimAchievementXp(granted, USER, 'first_step', 0)).toBe(0);
  });

  it('un evento repetido no duplica progreso ni desbloqueo', () => {
    const event = approved('same', '2026-03-02');
    const once = projection('first_trail', [event]);
    const twice = projection('first_trail', [event, event]);
    expect(twice.facts.approvedOffers).toBe(1);
    expect(twice.row.unlocked).toBe(true);
    expect(once.facts.approvedOffers).toBe(twice.facts.approvedOffers);
  });

  it('una carrera sobre la misma llave solo entrega el XP una vez', () => {
    const granted = new Set<string>();
    const results = [0, 1].map(() => claimAchievementXp(granted, USER, 'first_trail', 50));
    expect(results.reduce((sum, value) => sum + value, 0)).toBe(50);
    expect(results.filter((value) => value === 50)).toHaveLength(1);
  });

  it('no cuenta rechazadas, duplicadas ni descartadas por quality gate', () => {
    const { facts } = projection('first_trail', [
      { type: 'OFFER_REJECTED', eventId: 'rej', offerId: 'rej', at: noon('2026-03-03') },
      approved('dup', '2026-03-03', { duplicate: true }),
      approved('gate', '2026-03-03', { gateFailed: true }),
      approved('gone', '2026-03-03', { deleted: true }),
    ]);
    expect(facts.approvedOffers).toBe(0);
  });

  it('ignora votos propios, negativos, anulados por ban y repetidos', () => {
    const { facts } = projection('first_help', [
      approved('o1', '2026-03-04'),
      { type: 'OFFER_RECEIVED_VOTE', eventId: 'self', offerId: 'o1', at: noon('2026-03-04'), value: 2, self: true, approved: true },
      { type: 'OFFER_RECEIVED_VOTE', eventId: 'down', offerId: 'o1', at: noon('2026-03-04'), value: -1, approved: true },
      { type: 'OFFER_RECEIVED_VOTE', eventId: 'ban', offerId: 'o1', at: noon('2026-03-04'), value: 2, voterBanned: true, approved: true },
      { type: 'OFFER_RECEIVED_VOTE', eventId: 'ok', offerId: 'o1', at: noon('2026-03-04'), value: 2, approved: true },
      { type: 'OFFER_RECEIVED_VOTE', eventId: 'ok', offerId: 'o1', at: noon('2026-03-04'), value: 2, approved: true },
    ]);
    expect(facts.receivedPositiveVotes).toBe(1);
  });

  it('no cuenta comentarios propios, sin aprobar, repetidos ni de autores baneados', () => {
    const body = 'este hallazgo sí tiene el precio de la tienda';
    const { facts } = projection('participant', [
      { type: 'USER_COMMENTED', eventId: 'own', offerId: 'o1', at: noon('2026-03-05'), approved: true, onOwnOffer: true, commentBody: body },
      { type: 'USER_COMMENTED', eventId: 'pending', offerId: 'o2', at: noon('2026-03-05'), approved: false, commentBody: body },
      { type: 'USER_COMMENTED', eventId: 'ban', offerId: 'o3', at: noon('2026-03-05'), approved: true, authorBanned: true, commentBody: 'otro texto válido de ban' },
      { type: 'USER_COMMENTED', eventId: 'a', offerId: 'o4', at: noon('2026-03-05'), approved: true, commentBody: body },
      { type: 'USER_COMMENTED', eventId: 'b', offerId: 'o5', at: noon('2026-03-05'), approved: true, commentBody: body },
    ]);
    expect(facts.validConversations).toBe(1);
  });

  it('la racha sale de contribución real y no de login', () => {
    const empty = foldAchievementEvents([]);
    expect(empty.distinctContributionDays).toBe(0);
    const days = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07'];
    const events = days.map((day, index) => approved(`d${index}`, day));
    const facts = foldAchievementEvents(events);
    expect(facts.distinctContributionDays).toBe(7);
    expect(facts.longestConsecutiveDays).toBe(7);
    expect(projectAchievements(facts).find((item) => item.code === 'first_fire')?.unlocked).toBe(true);
    expect(projectAchievements(facts).find((item) => item.code === 'perfect_week')?.unlocked).toBe(true);
    const broken = foldAchievementEvents([
      approved('a', '2026-06-01'),
      approved('b', '2026-06-03'),
    ]);
    expect(broken.longestConsecutiveDays).toBe(1);
    expect(broken.distinctContributionDays).toBe(2);
  });

  it('el cambio de nivel desbloquea experiencia sin XP', () => {
    const facts = foldAchievementEvents([
      { type: 'LEVEL_REACHED', eventId: 'level-2', at: noon('2026-01-01'), level: 2 },
    ], { reputationLevel: 2 });
    const step = projectAchievements(facts).find((item) => item.code === 'first_step');
    expect(step?.unlocked).toBe(true);
    expect(ACHIEVEMENT_CATALOG.find((item) => item.code === 'first_step')?.xpReward).toBe(0);
    expect(ACHIEVEMENT_CATALOG.filter((item) => item.rule.type === 'level').every((item) => item.xpReward === 0)).toBe(true);
    const hunter = projectAchievements(facts).find((item) => item.code === 'hunter_rank');
    expect(hunter?.unlocked).toBe(false);
    expect(hunter?.target).toBe(4);
  });

  it('ningún logro activo de nivel exige más que el nivel máximo de reputación', () => {
    const maxLevel = Math.max(...REPUTATION_LEVELS.map((l) => l.level));
    const levelRules = ACHIEVEMENT_CATALOG.filter((item) => item.isActive && item.rule.type === 'level');
    expect(levelRules.length).toBeGreaterThan(0);
    for (const item of levelRules) {
      expect(item.rule.type === 'level' && item.rule.target, item.code).toBeLessThanOrEqual(maxLevel);
    }
  });

  it('el logro oculto no revela su nombre hasta desbloquearse', () => {
    const hidden = ACHIEVEMENT_CATALOG.find((item) => item.code === 'secret_offer');
    expect(hidden?.isHidden).toBe(true);
    expect(achievementIsConcealed(hidden!, false)).toBe(true);
    const locked = presentCatalog(projectAchievements(foldAchievementEvents([])), new Map());
    expect(locked.find((card) => card.code === 'secret_offer')?.name).toBe('???');
    const facts = foldAchievementEvents([approved('secret', '2026-07-01', { secret: true, qualifies: true })]);
    const open = presentCatalog(projectAchievements(facts), new Map());
    expect(open.find((card) => card.code === 'secret_offer')?.name).toBe('Oferta secreta');
  });

  it('la temporada cuenta ofertas dentro de la ventana de Seasons', () => {
    const outside = foldAchievementEvents([approved('bf', '2026-06-01')]);
    expect(outside.offers[0]?.seasonId).toBeNull();
    expect(projectAchievements(outside).find((item) => item.code === 'buen_fin_1')?.unlocked).toBe(false);
    const inside = foldAchievementEvents([approved('bf', '2026-11-13')]);
    expect(inside.offers[0]?.seasonId).toBe('buen-fin');
    expect(projectAchievements(inside).find((item) => item.code === 'buen_fin_1')?.unlocked).toBe(true);
    const muertos = foldAchievementEvents([approved('dm', '2026-11-13')]);
    expect(projectAchievements(muertos).find((item) => item.code === 'muertos_1')?.unlocked).toBe(false);
  });

  it('un logro ya desbloqueado se conserva aunque el hecho baje', () => {
    const cards = presentCatalog(
      projectAchievements(foldAchievementEvents([])),
      new Map([['first_trail', '2026-01-01T00:00:00.000Z']]),
    );
    const card = cards.find((item) => item.code === 'first_trail');
    expect(card?.unlocked).toBe(true);
    expect(card?.remainingLabel).toBe('Conseguido.');
  });

  it('un usuario baneado no progresa', () => {
    const facts = foldAchievementEvents([approved('o1', '2026-03-01')], { banned: true });
    expect(facts.approvedOffers).toBe(0);
    expect(projectAchievements(facts).every((item) => item.unlocked === false)).toBe(true);
  });

  it('una recompensa de dinero no abre logros ni XP', () => {
    const facts = foldAchievementEvents([
      { type: 'REWARD_UNLOCKED', eventId: 'pay-1', at: noon('2026-08-01') },
    ]);
    expect(facts.approvedOffers).toBe(0);
    expect(facts.receivedPositiveVotes).toBe(0);
    expect(projectAchievements(facts).every((item) => item.unlocked === false || item.code === 'never')).toBe(true);
  });

  it('conserva los nombres de la v1 y el total es el catálogo activo', () => {
    const names = ACHIEVEMENT_CATALOG.map((item) => item.name);
    for (const name of [
      'Primer rastro',
      'Cazador en marcha I',
      'Cazador en marcha II',
      'Cazador en marcha III',
      'Cazador veterano',
      'Buen ojo',
      'Cazador preciso',
      'Ojo de águila',
      'Detector de gangas',
      'Primera ayuda',
      'Buena aportación',
      'Favorito de la comunidad',
      'Referencia de la comunidad',
      'Conversador',
      'Participante',
      'Primer fuego',
      'Cazador constante',
      'Semana perfecta',
      'Cazador disciplinado',
      'Imparable',
      'Leyenda',
      'Primera huella',
      'Impacto creciente',
      'Oferta destacada',
      'Cazador influyente',
      'Gran impacto',
      'Huella Aventa',
      'Primer paso',
      'Contribuidor',
      'Cazador',
      'Madrugador',
      'Cazador nocturno',
      'Flash Hunter',
      'Oferta secreta',
      'Buen Fin',
      'Ofrenda',
      'Primera de Navidad',
    ]) {
      expect(names).toContain(name);
    }
    const xp = ACHIEVEMENT_CATALOG.reduce((sum, item) => sum + item.xpReward, 0);
    expect(xp).toBeGreaterThan(0);
    expect(xp).toBeLessThan(20000);
    expect(new Set(ACHIEVEMENT_CATALOG.map((item) => item.code)).size).toBe(ACHIEVEMENT_CATALOG.length);
  });
});
