import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/server/rateLimit';

const DEFAULT_LIMIT = 30;

/** GET: lista de notificaciones del usuario y contador de no leídas */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const rl = await enforceRateLimit(`notif:${user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit')) || DEFAULT_LIMIT, 50);

  const { data: list, error: listError } = await supabase
    .from('notifications')
    .select('id, type, title, body, link, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (listError) {
    console.error('[notifications] list:', listError.message);
    return NextResponse.json({ error: 'Error al cargar' }, { status: 500 });
  }

  const { count, error: countError } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  const unreadCount = countError ? 0 : (count ?? 0);

  return NextResponse.json({
    notifications: list ?? [],
    unreadCount,
  });
}

/** PATCH: marcar una notificación o todas como leídas. Body: { id?: string } — si no id, marca todas */
export async function PATCH(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const rl2 = await enforceRateLimit(`notif:${user.id}`);
  if (!rl2.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : null;

  const query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (id) {
    query.eq('id', id);
  }

  const { error } = await query;
  if (error) {
    console.error('[notifications] patch:', error.message);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE: eliminar una notificación del usuario (body: { id }) */
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const rl = await enforceRateLimit(`notif-del:${user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : null;
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 });
  }

  const { error } = await supabase.from('notifications').delete().eq('user_id', user.id).eq('id', id);

  if (error) {
    console.error('[notifications] delete:', error.message);
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
