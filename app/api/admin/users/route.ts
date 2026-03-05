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
};

/** GET: listado de usuarios para Admin (solo owner/admin). Incluye roles, baneo y última actividad. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServerClient();

  const { data: profiles, error: errProfiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, created_at, reputation_score, offers_submitted_count, offers_approved_count, offers_rejected_count')
    .order('created_at', { ascending: false });

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
  }>;
  const userIds = list.map((p) => p.id);

  const [rolesRes, bansRes, activityRes] = await Promise.all([
    supabase.from('user_roles').select('user_id, role').in('user_id', userIds),
    supabase.from('user_bans').select('user_id, reason, expires_at').in('user_id', userIds),
    supabase.from('user_activity').select('user_id, last_seen_at').in('user_id', userIds),
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
    };
  });

  return NextResponse.json({ users });
}
