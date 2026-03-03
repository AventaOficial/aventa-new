import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import type { Role } from '@/lib/admin/roles';

const ROLE_PRIORITY: Role[] = ['owner', 'admin', 'moderator', 'analyst'];

/** GET: lista usuarios con rol (solo owner). Devuelve user_id, role efectivo, display_name. */
export async function GET(request: NextRequest) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('user_roles')
    .select('user_id, role');

  if (error) {
    console.error('[admin/team] user_roles:', error.message);
    return NextResponse.json({ error: 'Error al cargar roles' }, { status: 500 });
  }

  const byUser = new Map<string, Role>();
  for (const r of (rows ?? []) as { user_id: string; role: Role }[]) {
    const current = byUser.get(r.user_id);
    const idxCurrent = current ? ROLE_PRIORITY.indexOf(current) : -1;
    const idxNew = ROLE_PRIORITY.indexOf(r.role);
    if (idxNew < idxCurrent || !current) {
      byUser.set(r.user_id, r.role);
    }
  }

  const userIds = [...byUser.keys()];
  if (userIds.length === 0) {
    return NextResponse.json({ team: [] });
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, reputation_level, reputation_score')
    .in('id', userIds);

  const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null; reputation_level: number; reputation_score: number }>();
  for (const p of (profiles ?? []) as { id: string; display_name: string | null; avatar_url?: string | null; reputation_level?: number; reputation_score?: number }[]) {
    profileMap.set(p.id, {
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
      reputation_level: Math.max(1, p.reputation_level ?? 1),
      reputation_score: Math.max(0, p.reputation_score ?? 0),
    });
  }

  const team = userIds.map((user_id) => {
    const prof = profileMap.get(user_id);
    return {
      user_id,
      role: byUser.get(user_id)!,
      display_name: prof?.display_name ?? null,
      avatar_url: prof?.avatar_url ?? null,
      reputation_level: prof?.reputation_level ?? 1,
      reputation_score: prof?.reputation_score ?? 0,
    };
  });

  return NextResponse.json({ team });
}

/** PATCH: actualizar rol de un usuario (solo owner). Body: { user_id, role }. */
export async function PATCH(request: NextRequest) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : null;
  const role = typeof body?.role === 'string' && ROLE_PRIORITY.includes(body.role as Role) ? (body.role as Role) : null;

  if (!userId || !role) {
    return NextResponse.json(
      { error: 'Body debe incluir user_id (UUID) y role (owner|admin|moderator|analyst)' },
      { status: 400 }
    );
  }

  if (userId === auth.user.id && role !== 'owner') {
    return NextResponse.json(
      { error: 'No puedes quitarte el rol owner a ti mismo' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { error: delError } = await supabase.from('user_roles').delete().eq('user_id', userId);
  if (delError) {
    console.error('[admin/team] delete:', delError.message);
    return NextResponse.json({ error: 'Error al actualizar rol' }, { status: 500 });
  }

  const { error: insertError } = await supabase.from('user_roles').insert({ user_id: userId, role });
  if (insertError) {
    console.error('[admin/team] insert:', insertError.message);
    return NextResponse.json({ error: 'Error al guardar rol' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
