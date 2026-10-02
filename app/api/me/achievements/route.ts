import { NextResponse } from 'next/server';
import { achievementByCode, activeAchievements } from '@/lib/achievements/catalog';
import { projectAchievements } from '@/lib/achievements/evaluate';
import { presentCatalog, type AchievementCard } from '@/lib/achievements/present';
import { syncUserAchievements } from '@/lib/achievements/sync';
import { MAX_FEATURED_ACHIEVEMENTS, RARITY_LABEL } from '@/lib/achievements/types';
import { meAuthFailureResponse, requireBearerMeUser } from '@/lib/server/requireMeUser';

type StoredRow = {
  progress: number;
  target: number;
  unlocked_at: string | null;
  celebrated_at: string | null;
  achievements: { code: string } | { code: string }[] | null;
};

function codeOf(row: StoredRow): string | null {
  const joined = row.achievements;
  const record = Array.isArray(joined) ? joined[0] : joined;
  return record?.code ?? null;
}

function summary(cards: AchievementCard[], featured: string[]) {
  const total = cards.length;
  const unlockedCount = cards.filter((card) => card.unlocked).length;
  const next = cards
    .filter((card) => !card.unlocked && !card.concealed)
    .sort((a, b) => b.percent - a.percent || a.displayOrder - b.displayOrder)
    .slice(0, 3);
  const celebration = cards.find((card) => card.unlocked && card.unlockedAt && !card.concealed);
  return {
    total,
    unlockedCount,
    percent: total === 0 ? 0 : Math.round((unlockedCount / total) * 100),
    featured,
    next,
    cards,
    celebration: celebration ?? null,
  };
}

export async function GET(request: Request) {
  const auth = await requireBearerMeUser(request);
  if ('error' in auth) return meAuthFailureResponse(auth);

  const day = new Date().toISOString().slice(0, 10);
  const synced = await syncUserAchievements(auth.supabase, auth.user.id, {
    eventType: 'COLLECTION_REFRESH',
    eventId: `recompute:${auth.user.id}:${day}`,
    metadata: { source: 'collection' },
  });

  const { data, error } = await auth.supabase
    .from('user_achievements')
    .select('progress, target, unlocked_at, celebrated_at, achievements!inner(code)')
    .eq('user_id', auth.user.id);

  if (error) {
    console.error('[achievements] list', error.message);
    return NextResponse.json({
      ready: false,
      total: activeAchievements().length,
      unlockedCount: 0,
      percent: 0,
      featured: [],
      next: [],
      cards: [],
      celebration: null,
    });
  }

  const stored = (data ?? []) as StoredRow[];
  const unlockedAt = new Map<string, string | null>();
  const celebrated = new Set<string>();
  for (const row of stored) {
    const code = codeOf(row);
    if (!code) continue;
    unlockedAt.set(code, row.unlocked_at);
    if (row.celebrated_at) celebrated.add(code);
  }

  let cards: AchievementCard[];
  if (synced.facts) {
    cards = presentCatalog(projectAchievements(synced.facts), unlockedAt);
  } else {
    cards = activeAchievements().map((definition) => {
      const row = stored.find((item) => codeOf(item) === definition.code);
      const unlocked = Boolean(row?.unlocked_at);
      return {
        code: definition.code,
        name: definition.isHidden && !unlocked ? '???' : definition.name,
        description: definition.isHidden && !unlocked ? 'Hay algo esperando ser descubierto.' : definition.description,
        unlockLine: definition.unlockLine,
        icon: definition.isHidden && !unlocked ? '🔒' : definition.icon,
        category: definition.isHidden && !unlocked ? 'Oculto' : definition.category,
        categoryIcon: definition.icon,
        rarity: definition.isHidden && !unlocked ? 'Oculto' : RARITY_LABEL[definition.rarity],
        rarityKey: definition.rarity,
        xpReward: definition.isHidden && !unlocked ? 0 : definition.xpReward,
        progress: row?.progress ?? 0,
        target: row?.target ?? 1,
        percent: unlocked ? 100 : 0,
        unlocked,
        unlockedAt: row?.unlocked_at ?? null,
        concealed: definition.isHidden && !unlocked,
        remainingLabel: unlocked ? 'Conseguido.' : definition.description,
        spotlight: definition.v1Spotlight,
        displayOrder: definition.displayOrder,
      };
    });
  }

  const pendingCelebration = cards
    .filter((card) => card.unlocked && card.unlockedAt && !celebrated.has(card.code) && !card.concealed)
    .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))[0] ?? null;

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('featured_achievement_codes')
    .eq('id', auth.user.id)
    .maybeSingle();
  const featured = Array.isArray((profile as { featured_achievement_codes?: unknown } | null)?.featured_achievement_codes)
    ? ((profile as { featured_achievement_codes: unknown[] }).featured_achievement_codes.filter(
        (code): code is string => typeof code === 'string',
      )).slice(0, MAX_FEATURED_ACHIEVEMENTS)
    : [];

  return NextResponse.json({
    ready: synced.ok && synced.skipped !== 'unavailable',
    ...summary(cards, featured),
    celebration: pendingCelebration,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return meAuthFailureResponse(auth);

  const body = await request.json().catch(() => ({}));
  const raw = Array.isArray(body?.codes) ? body.codes : null;
  if (!raw || raw.length > MAX_FEATURED_ACHIEVEMENTS) {
    return NextResponse.json({ error: 'Elige hasta 5 logros.' }, { status: 400 });
  }
  const codes: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || !achievementByCode(entry)) {
      return NextResponse.json({ error: 'Hay un logro que no existe.' }, { status: 400 });
    }
    if (!codes.includes(entry)) codes.push(entry);
  }

  if (codes.length > 0) {
    const { data: rows, error } = await auth.supabase
      .from('user_achievements')
      .select('unlocked_at, achievements!inner(code)')
      .eq('user_id', auth.user.id)
      .not('unlocked_at', 'is', null);
    if (error) return NextResponse.json({ error: 'No se pudieron leer tus logros.' }, { status: 500 });
    const unlocked = new Set(
      ((rows ?? []) as StoredRow[]).map((row) => codeOf(row)).filter((code): code is string => Boolean(code)),
    );
    if (codes.some((code) => !unlocked.has(code))) {
      return NextResponse.json({ error: 'Solo puedes destacar logros que ya conseguiste.' }, { status: 400 });
    }
  }

  const { error: updateError } = await auth.supabase
    .from('profiles')
    .update({ featured_achievement_codes: codes })
    .eq('id', auth.user.id);
  if (updateError) {
    console.error('[achievements] feature', updateError.message);
    return NextResponse.json({ error: 'No se pudo guardar la selección.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, codes });
}

export async function POST(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return meAuthFailureResponse(auth);
  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === 'string' ? body.code : '';
  const definition = achievementByCode(code);
  if (!definition) return NextResponse.json({ error: 'Logro desconocido.' }, { status: 400 });

  const { data: achievement } = await auth.supabase
    .from('achievements')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  const achievementId = (achievement as { id?: string } | null)?.id;
  if (!achievementId) return NextResponse.json({ error: 'Logro no disponible.' }, { status: 404 });

  const { error } = await auth.supabase
    .from('user_achievements')
    .update({ celebrated_at: new Date().toISOString() })
    .eq('user_id', auth.user.id)
    .eq('achievement_id', achievementId)
    .is('celebrated_at', null);
  if (error) return NextResponse.json({ error: 'No se pudo cerrar la celebración.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
