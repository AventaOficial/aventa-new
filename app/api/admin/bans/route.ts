import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { isValidUuid } from '@/lib/server/validateUuid';

/** GET: listar usuarios baneados */
export async function GET(request: NextRequest) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('user_bans')
    .select('id, user_id, reason, created_at, expires_at, banned_by')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin/bans] GET:', error.message);
    return NextResponse.json({ error: 'Error al cargar baneos' }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

/** POST: banear usuario. Body: { user_id, reason?, expires_at? } */
export async function POST(request: NextRequest) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : null;
  if (!userId || !isValidUuid(userId)) {
    return NextResponse.json({ error: 'user_id (UUID) es obligatorio' }, { status: 400 });
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null;
  const expiresAt = typeof body?.expires_at === 'string' && body.expires_at ? body.expires_at : null;

  const supabase = createServerClient();
  const { error } = await supabase.from('user_bans').upsert(
    {
      user_id: userId,
      banned_by: auth.user.id,
      reason: reason || null,
      expires_at: expiresAt || null,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('[admin/bans] POST:', error.message);
    return NextResponse.json({ error: 'Error al banear' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE: desbanear. Query: userId= */
export async function DELETE(request: NextRequest) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = request.nextUrl.searchParams.get('userId')?.trim();
  if (!userId || !isValidUuid(userId)) {
    return NextResponse.json({ error: 'userId (UUID) es obligatorio' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('user_bans').delete().eq('user_id', userId);

  if (error) {
    console.error('[admin/bans] DELETE:', error.message);
    return NextResponse.json({ error: 'Error al desbanear' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
