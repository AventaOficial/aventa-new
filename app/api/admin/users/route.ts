import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';

/** GET: busca perfiles por nombre (solo owner). Para integrar usuarios al equipo. */
export async function GET(request: NextRequest) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .ilike('display_name', `%${q}%`)
    .order('display_name')
    .limit(20);

  if (error) {
    console.error('[admin/users]', error.message);
    return NextResponse.json({ error: 'Error al buscar' }, { status: 500 });
  }

  const users = (rows ?? []).map((r: { id: string; display_name: string | null; avatar_url?: string | null }) => ({
    user_id: r.id,
    display_name: r.display_name ?? null,
    avatar_url: r.avatar_url ?? null,
  }));

  return NextResponse.json({ users });
}
