import type { SupabaseClient } from '@supabase/supabase-js';
import type { HunterAudience } from '@/lib/owner/hunterGrowth';

const CAP = 5001;

type Bounds = { startMs: number; endMs: number };

async function countRegistered(supabase: SupabaseClient, endIso: string): Promise<number | null> {
  const result = await supabase.from('profiles').select('id', { count: 'exact', head: true }).lt('created_at', endIso);
  if (result.error || result.count == null) return null;
  return result.count;
}

async function columnIds(
  supabase: SupabaseClient,
  table: 'offer_votes' | 'comments' | 'offer_favorites' | 'offers',
  column: 'user_id' | 'created_by',
  startIso: string,
  endIso: string,
): Promise<string[] | null> {
  const result = await supabase.from(table).select(column).gte('created_at', startIso).lt('created_at', endIso).limit(CAP);
  if (result.error) return null;
  return (result.data ?? [])
    .map((row) => {
      const value = (row as Record<string, string | null>)[column];
      return value?.trim() ?? '';
    })
    .filter((id) => id.length > 0);
}

async function activeUsers(supabase: SupabaseClient, startIso: string, endIso: string): Promise<number | null> {
  const [votes, comments, favorites, offers] = await Promise.all([
    columnIds(supabase, 'offer_votes', 'user_id', startIso, endIso),
    columnIds(supabase, 'comments', 'user_id', startIso, endIso),
    columnIds(supabase, 'offer_favorites', 'user_id', startIso, endIso),
    columnIds(supabase, 'offers', 'created_by', startIso, endIso),
  ]);
  const lists = [votes, comments, favorites, offers];
  if (lists.some((rows) => rows == null || rows.length >= CAP)) return null;
  return new Set(lists.flatMap((rows) => rows ?? [])).size;
}

async function intentSlice(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string,
): Promise<Pick<HunterAudience, 'intentUsers' | 'intentSinceMs' | 'intentReadable'>> {
  const [first, page] = await Promise.all([
    supabase
      .from('product_events')
      .select('occurred_at')
      .eq('event_name', 'hunter_intent')
      .order('occurred_at', { ascending: true })
      .limit(1),
    supabase
      .from('product_events')
      .select('user_id')
      .eq('event_name', 'hunter_intent')
      .gte('occurred_at', startIso)
      .lt('occurred_at', endIso)
      .limit(CAP),
  ]);
  if (first.error || page.error || (page.data?.length ?? 0) >= CAP) {
    return { intentUsers: null, intentSinceMs: null, intentReadable: false };
  }
  const sinceRaw = first.data?.[0]?.occurred_at;
  const sinceMs = sinceRaw ? Date.parse(String(sinceRaw)) : null;
  const users = new Set(
    (page.data ?? [])
      .map((row) => (row.user_id ? String(row.user_id) : ''))
      .filter((id) => id.length > 0),
  );
  return {
    intentUsers: users.size,
    intentSinceMs: sinceMs != null && Number.isFinite(sinceMs) ? sinceMs : null,
    intentReadable: true,
  };
}

function audience(
  registeredUsers: number | null,
  activeUsersCount: number | null,
  intent: Pick<HunterAudience, 'intentUsers' | 'intentSinceMs' | 'intentReadable'>,
): HunterAudience {
  return {
    registeredUsers,
    activeUsers: activeUsersCount,
    intentUsers: intent.intentUsers,
    intentSinceMs: intent.intentSinceMs,
    intentReadable: intent.intentReadable,
  };
}

/** Lecturas acotadas. Si una tabla se trunca o falla, esa métrica queda vacía. */
export async function loadHunterAudience(
  supabase: SupabaseClient,
  windows: { d7: Bounds; d30: Bounds },
): Promise<{ d7: HunterAudience; d30: HunterAudience }> {
  const endIso = new Date(windows.d30.endMs).toISOString();
  const d7Start = new Date(windows.d7.startMs).toISOString();
  const d7End = new Date(windows.d7.endMs).toISOString();
  const d30Start = new Date(windows.d30.startMs).toISOString();
  const [registeredUsers, active7, active30, intent7, intent30] = await Promise.all([
    countRegistered(supabase, endIso),
    activeUsers(supabase, d7Start, d7End),
    activeUsers(supabase, d30Start, endIso),
    intentSlice(supabase, d7Start, d7End),
    intentSlice(supabase, d30Start, endIso),
  ]);
  return {
    d7: audience(registeredUsers, active7, intent7),
    d30: audience(registeredUsers, active30, intent30),
  };
}
