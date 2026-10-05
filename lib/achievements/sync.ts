import type { SupabaseClient } from '@supabase/supabase-js';
import { isEconomicallyInertAuthor } from '@/lib/economy/botAuthorFirewall';
import { achievementByCode, activeAchievements } from './catalog';
import { projectAchievements } from './evaluate';
import { loadUserAchievementFacts } from './loadFacts';
import type { AchievementProjection } from './evaluate';
import type { UserFacts } from './types';

export type AchievementTrigger = {
  eventType: string;
  eventId: string;
  metadata?: Record<string, unknown>;
};

export type AchievementSyncResult = {
  ok: boolean;
  skipped?: 'bot' | 'banned' | 'unavailable';
  unlocked: string[];
  facts: UserFacts | null;
};

type CatalogRow = { id: string; code: string };
type ProgressRow = {
  id: string;
  achievement_id: string;
  progress: number;
  unlocked_at: string | null;
};

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '23505' || (error.message ?? '').toLowerCase().includes('duplicate');
}

export async function syncUserAchievements(
  supabase: SupabaseClient,
  userId: string,
  trigger?: AchievementTrigger,
): Promise<AchievementSyncResult> {
  if (!userId || (await isEconomicallyInertAuthor(supabase, userId))) {
    return { ok: true, skipped: 'bot', unlocked: [], facts: null };
  }

  let loaded;
  try {
    loaded = await loadUserAchievementFacts(supabase, userId);
  } catch (error) {
    console.error('[achievements] facts', error);
    return { ok: false, skipped: 'unavailable', unlocked: [], facts: null };
  }
  if (loaded.unavailable) return { ok: false, skipped: 'unavailable', unlocked: [], facts: null };
  if (loaded.banned) return { ok: true, skipped: 'banned', unlocked: [], facts: null };

  const catalog = await loadCatalog(supabase);
  if (!catalog) return { ok: false, skipped: 'unavailable', unlocked: [], facts: null };

  const first = await applyProjections(supabase, userId, projectAchievements(loaded.facts), catalog, trigger);
  if (first.xpGranted) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('reputation_level')
      .eq('id', userId)
      .maybeSingle();
    const level = Math.max(1, (profile as { reputation_level?: number } | null)?.reputation_level ?? loaded.facts.reputationLevel);
    if (level !== loaded.facts.reputationLevel) {
      const again = await applyProjections(
        supabase,
        userId,
        projectAchievements({ ...loaded.facts, reputationLevel: level }),
        catalog,
        trigger ? { ...trigger, eventType: 'LEVEL_REACHED', eventId: `level:${userId}:${level}` } : undefined,
      );
      return {
        ok: true,
        unlocked: [...first.unlocked, ...again.unlocked],
        facts: { ...loaded.facts, reputationLevel: level },
      };
    }
  }
  return { ok: true, unlocked: first.unlocked, facts: loaded.facts };
}

export function syncAchievementsLater(
  supabase: SupabaseClient,
  userIds: Array<string | null | undefined>,
  trigger: AchievementTrigger,
): void {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  for (const userId of unique) {
    void syncUserAchievements(supabase, userId, trigger).catch((error) => {
      console.error('[achievements] sync', error);
    });
  }
}

async function loadCatalog(supabase: SupabaseClient): Promise<Map<string, CatalogRow> | null> {
  const { data, error } = await supabase.from('achievements').select('id, code').eq('is_active', true);
  if (error) {
    console.error('[achievements] catalog', error.message);
    return null;
  }
  const map = new Map<string, CatalogRow>();
  for (const row of (data ?? []) as CatalogRow[]) {
    if (achievementByCode(row.code)) map.set(row.code, row);
  }
  if (map.size === 0) return null;
  return map;
}

async function applyProjections(
  supabase: SupabaseClient,
  userId: string,
  projections: AchievementProjection[],
  catalog: Map<string, CatalogRow>,
  trigger: AchievementTrigger | undefined,
): Promise<{ unlocked: string[]; xpGranted: boolean }> {
  const ids = [...catalog.values()].map((row) => row.id);
  const { data, error } = await supabase
    .from('user_achievements')
    .select('id, achievement_id, progress, unlocked_at')
    .eq('user_id', userId)
    .in('achievement_id', ids);
  if (error) throw new Error(error.message);
  const existingByAchievement = new Map(
    ((data ?? []) as ProgressRow[]).map((row) => [row.achievement_id, row]),
  );

  const unlocked: string[] = [];
  let xpGranted = false;
  for (const projection of projections) {
    const definition = achievementByCode(projection.code);
    const row = catalog.get(projection.code);
    if (!definition || !row || !definition.isActive) continue;
    const existing = existingByAchievement.get(row.id) ?? null;
    const already = Boolean(existing?.unlocked_at);
    if (!existing && !projection.unlocked && projection.progress <= 0) continue;
    const changed = !existing || existing.progress !== projection.progress;
    let justUnlocked = false;

    if (!existing) {
      const inserted = await supabase
        .from('user_achievements')
        .insert({
          user_id: userId,
          achievement_id: row.id,
          progress: projection.progress,
          target: projection.target,
          unlocked_at: projection.unlocked ? new Date().toISOString() : null,
        })
        .select('id, unlocked_at')
        .maybeSingle();
      if (inserted.error && !isUniqueViolation(inserted.error)) {
        console.error('[achievements] insert', inserted.error.message);
        continue;
      }
      if (!inserted.error && projection.unlocked) {
        justUnlocked = true;
        unlocked.push(definition.code);
      }
    } else if (!already && projection.unlocked) {
      const claimed = await supabase
        .from('user_achievements')
        .update({
          progress: projection.progress,
          target: projection.target,
          unlocked_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .is('unlocked_at', null)
        .select('id')
        .maybeSingle();
      if (claimed.error) {
        console.error('[achievements] unlock', claimed.error.message);
        continue;
      }
      if (claimed.data) {
        justUnlocked = true;
        unlocked.push(definition.code);
      } else if (changed) {
        await supabase
          .from('user_achievements')
          .update({ progress: projection.progress, target: projection.target })
          .eq('id', existing.id);
      }
    } else if (changed) {
      await supabase
        .from('user_achievements')
        .update({ progress: projection.progress, target: projection.target })
        .eq('id', existing.id);
    }

    const unlockedNow = already || justUnlocked || Boolean(existing?.unlocked_at) || (projection.unlocked && !existing);
    if (unlockedNow && definition.xpReward > 0) {
      const granted = await grantXp(supabase, userId, row.id, definition.xpReward);
      if (granted) xpGranted = true;
    }
    if (justUnlocked) {
      await notifyUnlock(supabase, userId, definition.name, definition.xpReward);
    }

    if (trigger && (changed || justUnlocked)) {
      await supabase.from('achievement_events').insert({
        user_id: userId,
        achievement_id: row.id,
        event_type: trigger.eventType,
        event_id: trigger.eventId,
        metadata: {
          ...(trigger.metadata ?? {}),
          progress: projection.progress,
          target: projection.target,
          unlocked: unlockedNow,
        },
      }).then(({ error: eventError }) => {
        if (eventError && !isUniqueViolation(eventError)) {
          console.error('[achievements] event', eventError.message);
        }
      });
    }
  }

  return { unlocked, xpGranted };
}

async function grantXp(
  supabase: SupabaseClient,
  userId: string,
  achievementId: string,
  xpReward: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('grant_achievement_xp', {
    p_user_id: userId,
    p_achievement_id: achievementId,
    p_amount: xpReward,
  });
  if (error) {
    console.error('[achievements] xp', error.message);
    return false;
  }
  return data === true;
}

async function notifyUnlock(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  xpReward: number,
): Promise<void> {
  const xpLine = xpReward > 0 ? `\n+${xpReward} XP` : '';
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'achievement_unlocked',
    title: 'Logro desbloqueado',
    body: `Has conseguido:\n"${name}"${xpLine}`,
    link: '/me',
  });
  if (error) console.error('[achievements] notification', error.message);
}

export function collectionIsReady(codes: Iterable<string>): boolean {
  const present = new Set(codes);
  return activeAchievements().every((item) => present.has(item.code));
}
