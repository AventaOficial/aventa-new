import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAnnouncements } from '@/lib/server/requireAdmin';

/** GET: lista de avisos (activos e inactivos) para admin */
export async function GET(request: NextRequest) {
  const auth = await requireAnnouncements(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, link, active, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin/announcements] GET', error.message);
    return NextResponse.json({ error: 'Error al cargar' }, { status: 500 });
  }
  return NextResponse.json({ announcements: data ?? [] });
}

/** POST: crear aviso. Body: { title, body?, link?, sort_order? } */
export async function POST(request: NextRequest) {
  const auth = await requireAnnouncements(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === 'string' ? body.title.trim() : null;
  if (!title) return NextResponse.json({ error: 'Falta title' }, { status: 400 });

  const supabase = createServerClient();
  const now = new Date().toISOString();
  const payload = {
    title,
    body: typeof body?.body === 'string' ? body.body.trim() || null : null,
    link: typeof body?.link === 'string' ? body.link.trim() || null : null,
    active: typeof body?.active === 'boolean' ? body.active : true,
    sort_order: typeof body?.sort_order === 'number' ? body.sort_order : 0,
    created_at: now,
    updated_at: now,
    created_by: auth.user.id,
  };

  const { data, error } = await supabase.from('announcements').insert(payload).select('id').single();
  if (error) {
    console.error('[admin/announcements] POST', error.message);
    return NextResponse.json({ error: 'Error al crear' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data?.id });
}
