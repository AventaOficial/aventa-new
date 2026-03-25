import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { isValidUuid } from '@/lib/server/validateUuid';

const MIN_M = 1;
const MAX_M = 1000;

/** GET ?user_id=uuid — solo owner. Devuelve vote_weight_multiplier actual (default 1). */
export async function GET(request: NextRequest) {
  const auth = await requireOwner(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = request.nextUrl.searchParams.get('user_id')?.trim() ?? '';
  if (!userId || !isValidUuid(userId)) {
    return NextResponse.json({ error: 'user_id inválido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, vote_weight_multiplier')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[vote-weight GET]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  const row = data as { id: string; display_name: string | null; vote_weight_multiplier?: number | null };
  return NextResponse.json({
    user_id: row.id,
    display_name: row.display_name,
    vote_weight_multiplier: row.vote_weight_multiplier ?? 1,
  });
}

/** PATCH { user_id, vote_weight_multiplier } — solo owner. Recalcula ofertas donde votó ese usuario. */
export async function PATCH(request: NextRequest) {
  const auth = await requireOwner(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  const rawM = body?.vote_weight_multiplier;
  const m = typeof rawM === 'number' ? rawM : typeof rawM === 'string' ? parseInt(rawM, 10) : NaN;

  if (!userId || !isValidUuid(userId)) {
    return NextResponse.json({ error: 'user_id requerido' }, { status: 400 });
  }
  if (!Number.isFinite(m) || m < MIN_M || m > MAX_M) {
    return NextResponse.json({ error: `vote_weight_multiplier debe ser ${MIN_M}–${MAX_M}` }, { status: 400 });
  }

  const supabase = createServerClient();

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ vote_weight_multiplier: m })
    .eq('id', userId);

  if (upErr) {
    if (upErr.message.includes('vote_weight_multiplier') || upErr.code === '42703') {
      return NextResponse.json(
        {
          error:
            'La columna vote_weight_multiplier no existe. Ejecuta en Supabase: docs/supabase-migrations/profiles_vote_weight_multiplier.sql',
        },
        { status: 503 }
      );
    }
    console.error('[vote-weight PATCH]', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { error: rpcErr } = await supabase.rpc('recalculate_offers_for_voter', { p_user_id: userId });
  if (rpcErr) {
    if (rpcErr.message.includes('recalculate_offers_for_voter') || rpcErr.code === '42883') {
      return NextResponse.json(
        {
          ok: true,
          warning:
            'Perfil actualizado. Ejecuta la migración SQL para crear recalculate_offers_for_voter y recalcular rankings.',
        },
        { status: 200 }
      );
    }
    console.error('[vote-weight rpc]', rpcErr.message);
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
