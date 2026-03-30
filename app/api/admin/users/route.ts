import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';

export type AdminUserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  created_at: string;
  reputation_score: number;
  offers_submitted_count: number;
  offers_approved_count: number;
  offers_rejected_count: number;
  roles: string[];
  banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
  last_seen_at: string | null;
  commissions_accepted_at: string | null;
  commissions_terms_version: string | null;
  commission_qualifying_offers: number;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** GET: listado de usuarios para Admin (solo owner/admin). Paginado; incluye roles, baneo y última actividad. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const qRaw = url.searchParams.get('q')?.trim() ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limitRaw = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, limitRaw));
  const offset = (page - 1) * limit;
  const rangeEnd = offset + limit - 1;

  const supabase = createServerClient();

  /** Búsqueda rápida por nombre (p. ej. Equipo): devuelve filas mínimas con `id` y alias `user_id`. */
  if (qRaw.length >= 2) {
    const safe = qRaw.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${safe}%`;
    const searchLimit = Math.min(40, Math.max(1, limitRaw));
    const [byDisplay, byUsername] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('display_name', pattern)
        .limit(searchLimit),
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', pattern)
        .limit(searchLimit),
    ]);
    const searchErr = byDisplay.error ?? byUsername.error;
    if (searchErr) {
      return NextResponse.json({ error: searchErr.message }, { status: 500 });
    }
    const seen = new Set<string>();
    const hits: { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[] = [];
    for (const row of [...(byDisplay.data ?? []), ...(byUsername.data ?? [])]) {
      const id = row.id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      hits.push({
        id,
        username: (row.username as string | null) ?? null,
        display_name: (row.display_name as string | null) ?? null,
        avatar_url: (row.avatar_url as string | null) ?? null,
      });
    }

    const users = hits.map((row) => ({
      id: row.id,
      user_id: row.id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      created_at: '',
      reputation_score: 0,
      offers_submitted_count: 0,
      offers_approved_count: 0,
      offers_rejected_count: 0,
      roles: [] as string[],
      banned: false,
      ban_reason: null,
      ban_expires_at: null,
      last_seen_at: null,
      commissions_accepted_at: null,
      commissions_terms_version: null,
      commission_qualifying_offers: 0,
    }));

    return NextResponse.json({ users, total: users.length, page: 1, limit: users.length });
  }

  const withCommissionsRes = await supabase
    .from('profiles')
    .select('id, username, display_name, created_at, reputation_score, offers_submitted_count, offers_approved_count, offers_rejected_count, commissions_accepted_at, commissions_terms_version', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, rangeEnd);

  let profiles = withCommissionsRes.data as Record<string, unknown>[] | null;
  let errProfiles = withCommissionsRes.error;
  let totalCount = withCommissionsRes.count;

  if (errProfiles && (errProfiles.message?.includes('commissions_accepted_at') || errProfiles.code === 'PGRST204')) {
    // Degradación suave para entornos que aún no aplican la migración de comisiones.
    const fallbackRes = await supabase
      .from('profiles')
      .select('id, username, display_name, created_at, reputation_score, offers_submitted_count, offers_approved_count, offers_rejected_count', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(offset, rangeEnd);
    profiles = fallbackRes.data as Record<string, unknown>[] | null;
    errProfiles = fallbackRes.error;
    totalCount = fallbackRes.count;
  }

  if (errProfiles) return NextResponse.json({ error: errProfiles.message }, { status: 500 });

  const list = (profiles ?? []) as Array<{
    id: string;
    username: string | null;
    display_name: string | null;
    created_at: string;
    reputation_score: number;
    offers_submitted_count: number;
    offers_approved_count: number;
    offers_rejected_count: number;
    commissions_accepted_at?: string | null;
    commissions_terms_version?: string | null;
  }>;

  const total = totalCount ?? 0;
  if (list.length === 0) {
    return NextResponse.json({ users: [], total, page, limit });
  }

  const userIds = list.map((p) => p.id);

  const [rolesRes, bansRes, activityRes, qualifyingRes] = await Promise.all([
    supabase.from('user_roles').select('user_id, role').in('user_id', userIds),
    supabase.from('user_bans').select('user_id, reason, expires_at').in('user_id', userIds),
    supabase.from('user_activity').select('user_id, last_seen_at').in('user_id', userIds),
    supabase
      .from('offers')
      .select('created_by, upvotes_count')
      .in('created_by', userIds)
      .in('status', ['approved', 'published'])
      .limit(25000),
  ]);

  const rolesByUser: Record<string, string[]> = {};
  for (const r of (rolesRes.data ?? []) as { user_id: string; role: string }[]) {
    if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
    rolesByUser[r.user_id].push(r.role);
  }
  const bansByUser: Record<string, { reason: string | null; expires_at: string | null }> = {};
  for (const b of (bansRes.data ?? []) as { user_id: string; reason: string | null; expires_at: string | null }[]) {
    bansByUser[b.user_id] = { reason: b.reason, expires_at: b.expires_at };
  }
  const lastSeenByUser: Record<string, string | null> = {};
  for (const a of (activityRes.data ?? []) as { user_id: string; last_seen_at: string }[]) {
    lastSeenByUser[a.user_id] = a.last_seen_at ?? null;
  }
  const qualifyingByUser: Record<string, number> = {};
  for (const row of (qualifyingRes.data ?? []) as { created_by: string; upvotes_count: number | null }[]) {
    if ((row.upvotes_count ?? 0) < 120) continue;
    qualifyingByUser[row.created_by] = (qualifyingByUser[row.created_by] ?? 0) + 1;
  }

  const users: AdminUserRow[] = list.map((p) => {
    const ban = bansByUser[p.id];
    return {
      id: p.id,
      username: p.username ?? null,
      display_name: p.display_name ?? null,
      created_at: p.created_at,
      reputation_score: p.reputation_score ?? 0,
      offers_submitted_count: p.offers_submitted_count ?? 0,
      offers_approved_count: p.offers_approved_count ?? 0,
      offers_rejected_count: p.offers_rejected_count ?? 0,
      roles: rolesByUser[p.id] ?? [],
      banned: !!ban,
      ban_reason: ban?.reason ?? null,
      ban_expires_at: ban?.expires_at ?? null,
      last_seen_at: lastSeenByUser[p.id] ?? null,
      commissions_accepted_at: p.commissions_accepted_at ?? null,
      commissions_terms_version: p.commissions_terms_version ?? null,
      commission_qualifying_offers: qualifyingByUser[p.id] ?? 0,
    };
  });

  return NextResponse.json({ users, total, page, limit });
}
