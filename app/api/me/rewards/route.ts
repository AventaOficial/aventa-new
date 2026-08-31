import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/** GET: recompensas del usuario autenticado. */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase
    .from('creator_rewards')
    .select(
      'id, offer_id, network, gross_commission_cents, creator_share_cents, status, hold_until, available_at, paid_at, attribution_method, attribution_confidence, created_at',
    )
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    if ((error.message ?? '').includes('creator_rewards')) {
      return NextResponse.json({ rewards: [], note: 'Migración Rewards pendiente' });
    }
    return NextResponse.json({ error: 'No se pudieron cargar recompensas' }, { status: 500 });
  }

  return NextResponse.json({ rewards: data ?? [] });
}
