import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAnnouncements } from '@/lib/server/requireAdmin';

/** PATCH: actualizar aviso. Body: { title?, body?, link?, active?, sort_order? } */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnnouncements(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.title === 'string') updates.title = body.title.trim();
  if (typeof body?.body === 'string') updates.body = body.body.trim() || null;
  if (typeof body?.link === 'string') updates.link = body.link.trim() || null;
  if (typeof body?.active === 'boolean') updates.active = body.active;
  if (typeof body?.sort_order === 'number') updates.sort_order = body.sort_order;

  const supabase = createServerClient();
  const { error } = await supabase.from('announcements').update(updates).eq('id', id);
  if (error) {
    console.error('[admin/announcements] PATCH', error.message);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE: desactivar o borrar aviso (borrado físico) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnnouncements(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) {
    console.error('[admin/announcements] DELETE', error.message);
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
