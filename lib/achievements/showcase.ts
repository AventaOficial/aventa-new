import type { SupabaseClient } from '@supabase/supabase-js';
import { achievementByCode } from './catalog';
import { MAX_FEATURED_ACHIEVEMENTS } from './types';

export type AchievementShowcase = {
  code: string;
  name: string;
  icon: string;
  rarity: string;
};

export async function loadAchievementShowcase(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<AchievementShowcase[]> {
  if (!userId) return [];
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('featured_achievement_codes')
      .eq('id', userId)
      .maybeSingle();
    if (error || !profile) return [];
    const codes = Array.isArray((profile as { featured_achievement_codes?: unknown }).featured_achievement_codes)
      ? ((profile as { featured_achievement_codes: unknown[] }).featured_achievement_codes.filter(
          (code): code is string => typeof code === 'string',
        ))
      : [];
    const selected = codes.slice(0, MAX_FEATURED_ACHIEVEMENTS);
    if (selected.length === 0) return [];

    const { data: unlocked } = await supabase
      .from('user_achievements')
      .select('achievement_id, unlocked_at, achievements!inner(code)')
      .eq('user_id', userId)
      .not('unlocked_at', 'is', null);
    const unlockedCodes = new Set(
      ((unlocked ?? []) as Array<{ achievements?: { code?: string } | { code?: string }[] }>)
        .map((row) => {
          const joined = row.achievements;
          const record = Array.isArray(joined) ? joined[0] : joined;
          return record?.code ?? null;
        })
        .filter((code): code is string => Boolean(code)),
    );

    return selected.flatMap((code) => {
      if (!unlockedCodes.has(code)) return [];
      const definition = achievementByCode(code);
      if (!definition) return [];
      return [{ code, name: definition.name, icon: definition.icon, rarity: definition.rarity }];
    });
  } catch (error) {
    console.error('[achievements] showcase', error);
    return [];
  }
}

export async function loadPrimaryAchievement(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<AchievementShowcase | null> {
  const [first] = await loadAchievementShowcase(supabase, userId);
  return first ?? null;
}
