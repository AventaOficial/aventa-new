import { achievementByCode } from './catalog';
import { achievementIsConcealed, type AchievementProjection } from './evaluate';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  RARITY_LABEL,
  type AchievementDefinition,
} from './types';

export type AchievementCard = {
  code: string;
  name: string;
  description: string;
  unlockLine: string;
  icon: string;
  category: string;
  categoryIcon: string;
  rarity: string;
  rarityKey: AchievementDefinition['rarity'];
  xpReward: number;
  progress: number;
  target: number;
  percent: number;
  unlocked: boolean;
  unlockedAt: string | null;
  concealed: boolean;
  remainingLabel: string;
  spotlight: boolean;
  displayOrder: number;
};

function remainingLabel(definition: AchievementDefinition, projection: AchievementProjection): string {
  if (projection.unlocked) return 'Conseguido.';
  const rule = definition.rule;
  if (rule.type === 'approval_rate') {
    const missingOffers = Math.max(0, rule.minOffers - projection.progress);
    const percent = Math.round(rule.minRate * 100);
    if (missingOffers > 0) {
      return `Te faltan ${missingOffers} ${definition.progressNoun}.`;
    }
    const current = projection.approvalRate == null ? 0 : Math.round(projection.approvalRate * 100);
    return `Tu tasa de aprobación es ${current}%. Necesitas al menos ${percent}%.`;
  }
  if (rule.type === 'level') {
    return `Te falta llegar al nivel ${rule.target}.`;
  }
  if (projection.target <= 1 && projection.progress === 0) {
    return definition.description;
  }
  const missing = Math.max(0, projection.target - projection.progress);
  if (missing === 0) return definition.description;
  return `Te faltan ${missing} ${definition.progressNoun}.`;
}

export function presentAchievement(
  definition: AchievementDefinition,
  projection: AchievementProjection,
  unlockedAt: string | null,
  now = new Date(),
): AchievementCard {
  const concealed = achievementIsConcealed(definition, projection.unlocked || Boolean(unlockedAt), now);
  const unlocked = projection.unlocked || Boolean(unlockedAt);
  return {
    code: definition.code,
    name: concealed ? '???' : definition.name,
    description: concealed ? 'Hay algo esperando ser descubierto.' : definition.description,
    unlockLine: concealed ? 'Hay algo esperando ser descubierto.' : definition.unlockLine,
    icon: concealed ? '🔒' : definition.icon,
    category: concealed ? 'Oculto' : CATEGORY_LABEL[definition.category],
    categoryIcon: concealed ? '🔒' : CATEGORY_ICON[definition.category],
    rarity: concealed ? 'Oculto' : RARITY_LABEL[definition.rarity],
    rarityKey: definition.rarity,
    xpReward: concealed ? 0 : definition.xpReward,
    progress: concealed ? 0 : projection.progress,
    target: concealed ? 0 : projection.target,
    percent: concealed ? 0 : unlocked ? 100 : projection.percent,
    unlocked,
    unlockedAt,
    concealed,
    remainingLabel: concealed ? 'Hay algo esperando ser descubierto.' : remainingLabel(definition, { ...projection, unlocked }),
    spotlight: definition.v1Spotlight,
    displayOrder: definition.displayOrder,
  };
}

export function presentCatalog(
  projections: AchievementProjection[],
  unlockedAtByCode: ReadonlyMap<string, string | null>,
  now = new Date(),
): AchievementCard[] {
  return projections.flatMap((projection) => {
    const definition = achievementByCode(projection.code);
    if (!definition) return [];
    const storedUnlock = unlockedAtByCode.get(projection.code) ?? null;
    const unlocked = projection.unlocked || Boolean(storedUnlock);
    const card = presentAchievement(
      definition,
      { ...projection, unlocked: projection.unlocked },
      unlocked ? storedUnlock ?? new Date(now).toISOString() : null,
      now,
    );
    if (storedUnlock && !projection.unlocked) {
      return [{ ...card, unlocked: true, percent: 100, unlockedAt: storedUnlock, remainingLabel: 'Conseguido.' }];
    }
    return [card];
  });
}
