import { ACHIEVEMENT_CATALOG, achievementByCode } from '@/lib/achievements/catalog';
import type { AchievementCategory, AchievementDefinition, AchievementRarity } from '@/lib/achievements/types';

export type AchievementTone = { from: string; to: string; ink: string };

/** Un tono por familia del catálogo. La rareza no cambia el color: cambia el marco. */
export const CATEGORY_TONE: Record<AchievementCategory, AchievementTone> = {
  caceria: { from: '#8b5cf6', to: '#5b21b6', ink: '#7c3aed' },
  precision: { from: '#6366f1', to: '#3730a3', ink: '#4f46e5' },
  comunidad: { from: '#f43f5e', to: '#9f1239', ink: '#e11d48' },
  constancia: { from: '#f59e0b', to: '#b45309', ink: '#d97706' },
  impacto: { from: '#10b981', to: '#047857', ink: '#059669' },
  experiencia: { from: '#0ea5e9', to: '#0369a1', ink: '#0284c7' },
  especiales: { from: '#d946ef', to: '#86198f', ink: '#c026d3' },
};

export const MYTHIC_STOPS = ['#7c3aed', '#d946ef', '#f59e0b'] as const;

/** 0 = común … 5 = mítico. Define cuántos remaches y si hay halo. */
export const RARITY_TIER: Record<AchievementRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export function achievementDefinition(code: string | null | undefined): AchievementDefinition | null {
  return code ? achievementByCode(code) : null;
}

/** Las notificaciones de logro solo guardan el nombre en el texto; el catálogo resuelve el resto. */
export function achievementDefinitionByName(name: string | null | undefined): AchievementDefinition | null {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  return ACHIEVEMENT_CATALOG.find((item) => item.name.toLowerCase() === needle) ?? null;
}

export function formatAchievementDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
