import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_CATALOG, activeAchievements } from '@/lib/achievements/catalog';
import { foldAchievementEvents } from '@/lib/achievements/fold';
import { achievementIsConcealed, claimAchievementXp, projectAchievements } from '@/lib/achievements/evaluate';
import { presentCatalog } from '@/lib/achievements/present';
import { SEASONS } from '@/lib/seasons/resolve';
import {
  MAX_FEATURED_ACHIEVEMENTS,
  type AchievementCategory,
  type AchievementRule,
} from '@/lib/achievements/types';

const COUNTS: Record<AchievementCategory, number> = {
  caza: 15,
  calidad: 15,
  comunidad: 15,
  progresion: 10,
  exploracion: 10,
  temporadas: 10,
};

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

function ruleKey(rule: AchievementRule): string {
  return JSON.stringify(rule);
}

function numericTarget(rule: AchievementRule): number | null {
  if (rule.type === 'seasons_visited') return null;
  if (rule.type === 'approval_rate') return rule.minOffers;
  if ('target' in rule) return rule.target;
  return null;
}

describe('catálogo de 75 logros', () => {
  const active = activeAchievements();

  it('tiene exactamente 75 logros activos, códigos únicos y reglas sin duplicar', () => {
    expect(active).toHaveLength(75);
    expect(ACHIEVEMENT_CATALOG).toHaveLength(75);
    expect(new Set(active.map((item) => item.code)).size).toBe(75);
    expect(new Set(active.map((item) => item.name)).size).toBe(75);
    expect(new Set(active.map((item) => ruleKey(item.rule))).size).toBe(75);
    expect(active.every((item) => item.isRepeatable === false)).toBe(true);
  });

  it('reparte 15, 15, 15, 10, 10 y 10', () => {
    for (const [category, count] of Object.entries(COUNTS)) {
      expect(active.filter((item) => item.category === category)).toHaveLength(count);
    }
  });

  it('usa rareza válida y no llama legendario a un umbral chico', () => {
    for (const item of active) {
      expect(RARITIES).toContain(item.rarity);
      expect(item.xpReward).toBeGreaterThanOrEqual(0);
      const target = numericTarget(item.rule);
      if (item.rarity === 'legendary' && target != null) {
        expect(target, item.code).toBeGreaterThanOrEqual(90);
      }
      if (item.rarity === 'legendary' && item.rule.type === 'seasons_visited') {
        expect(item.rule.target).toBeGreaterThanOrEqual(3);
      }
    }
    const targets = active
      .map((item) => numericTarget(item.rule))
      .filter((value): value is number => value != null);
    expect(new Set(targets).size).toBeGreaterThan(8);
  });

  it('separa el XP de logro de la reputación y no lo convierte en dinero', () => {
    const reputation = readFileSync('lib/server/reputation.ts', 'utf8');
    expect(reputation).toContain('profiles.achievement_xp no entra');
    expect(active.filter((item) => item.rule.type === 'level').every((item) => item.xpReward === 0)).toBe(true);
    expect(active.some((item) => item.xpReward > 0)).toBe(true);
    const granted = new Set<string>();
    expect(claimAchievementXp(granted, 'user', 'first_trail', 50)).toBe(50);
    expect(claimAchievementXp(granted, 'user', 'first_trail', 50)).toBe(0);
    const source = readFileSync('lib/achievements/sync.ts', 'utf8');
    expect(source).toContain('grant_achievement_xp');
    expect(source).not.toMatch(/payout|ledger|settlement/);
  });

  it('oculta los secretos hasta desbloquearlos y se pueden conseguir', () => {
    const secrets = active.filter((item) => item.isHidden);
    expect(secrets.length).toBeGreaterThanOrEqual(2);
    expect(secrets.length).toBeLessThanOrEqual(5);
    for (const secret of secrets) {
      expect(secret.reveal).toBe('until_unlocked');
      expect(achievementIsConcealed(secret, false)).toBe(true);
      expect(achievementIsConcealed(secret, true)).toBe(false);
    }
    const locked = presentCatalog(projectAchievements(foldAchievementEvents([])), new Map());
    expect(locked.find((card) => card.code === 'secret_offer')?.name).toBe('???');
    expect(locked.find((card) => card.code === 'night_hunter')?.name).toBe('???');
  });

  it('las temporadas salen del catálogo de Seasons y se pueden apagar solas', () => {
    const seasonal = active.filter((item) => item.category === 'temporadas');
    expect(seasonal).toHaveLength(10);
    const seasonIds = new Set(SEASONS.map((season) => season.id));
    expect(seasonIds).toEqual(new Set(['dia-de-muertos', 'buen-fin', 'navidad']));
    for (const item of seasonal) {
      if (item.rule.type === 'season_offers') expect(seasonIds.has(item.rule.seasonId)).toBe(true);
      else expect(item.rule.type).toBe('seasons_visited');
    }
    const engine = readFileSync('lib/achievements/evaluate.ts', 'utf8');
    expect(engine).not.toMatch(/11-13|12-24|05-23/);
    const seasonsFile = readFileSync('lib/achievements/seasons.ts', 'utf8');
    expect(seasonsFile).toContain("from '@/lib/seasons/resolve'");
    expect(seasonsFile).not.toMatch(/20\d\d-\d\d-\d\d/);
  });

  it('el perfil destaca como máximo 5 y la colección muestra el conteo', () => {
    expect(MAX_FEATURED_ACHIEVEMENTS).toBe(5);
    const route = readFileSync('app/api/me/achievements/route.ts', 'utf8');
    expect(route).toContain('raw.length > MAX_FEATURED_ACHIEVEMENTS');
    expect(route).toContain('.slice(0, MAX_FEATURED_ACHIEVEMENTS)');
    const ui = readFileSync('app/components/achievements/AchievementCollection.tsx', 'utf8');
    expect(ui).toContain('/ {payload.total} desbloqueados');
    expect(ui).toContain('Secretos');
    expect(ui).toContain('CATEGORY_LABEL');
  });

  it('muestra progreso parcial, desbloquea al llegar y no duplica el mismo evento', () => {
    const events = Array.from({ length: 4 }, (_, index) => ({
      type: 'OFFER_APPROVED' as const,
      eventId: `o${index}`,
      offerId: `o${index}`,
      at: '2026-03-01T18:00:00.000Z',
      clean: true,
      qualifies: false,
    }));
    const partial = projectAchievements(foldAchievementEvents(events)).find((item) => item.code === 'hunter_moving_1');
    expect(partial?.progress).toBe(4);
    expect(partial?.target).toBe(5);
    expect(partial?.unlocked).toBe(false);
    const full = projectAchievements(
      foldAchievementEvents([...events, { ...events[0]!, eventId: 'o4', offerId: 'o4' }]),
    ).find((item) => item.code === 'hunter_moving_1');
    expect(full?.unlocked).toBe(true);
    const duplicated = foldAchievementEvents([events[0]!, events[0]!]);
    expect(duplicated.approvedOffers).toBe(1);
  });
});
