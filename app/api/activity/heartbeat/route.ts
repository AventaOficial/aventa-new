import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/server/rateLimit';

/** POST: registra actividad del usuario (first_seen / last_seen). Llamar desde el cliente cuando hay sesión. */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ ok: false }, { status: 401 });

  const rl = await enforceRateLimit(`hb:${user.id}`);
  if (!rl.success) return NextResponse.json({ ok: false }, { status: 429 });

  const { error } = await supabase.rpc('upsert_user_activity', { p_user_id: user.id });
  if (error) {
    console.error('[heartbeat]', error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
