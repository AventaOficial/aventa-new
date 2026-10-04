import { createServerClient } from '@/lib/supabase/server';

/**
 * Community XP. Fuente: `profiles.achievement_xp`.
 * No suma Team XP y no escribe el contador.
 */
export async function getCommunityXP(userId: string): Promise<number | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('profiles').select('achievement_xp').eq('id', userId).maybeSingle();
    if (error || !data || typeof data !== 'object') return null;
    const xp = 'achievement_xp' in data ? data.achievement_xp : null;
    return typeof xp === 'number' && Number.isFinite(xp) ? xp : null;
  } catch {
    return null;
  }
}
