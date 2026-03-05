import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/server/rateLimit';

/** GET: preferencias de correo del usuario */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = await enforceRateLimit(`emailpref:${user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const { data, error } = await supabase
    .from('user_email_preferences')
    .select('email_daily_digest, email_weekly_digest')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Error al cargar' }, { status: 500 });
  const row = data as { email_daily_digest?: boolean; email_weekly_digest?: boolean } | null;
  return NextResponse.json({
    email_daily_digest: row?.email_daily_digest ?? false,
    email_weekly_digest: row?.email_weekly_digest ?? false,
  });
}

/** PATCH: actualizar preferencias. Body: { email_daily_digest?: boolean, email_weekly_digest?: boolean } */
export async function PATCH(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl2 = await enforceRateLimit(`emailpref:${user.id}`);
  if (!rl2.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const email_daily_digest = typeof body?.email_daily_digest === 'boolean' ? body.email_daily_digest : undefined;
  const email_weekly_digest = typeof body?.email_weekly_digest === 'boolean' ? body.email_weekly_digest : undefined;

  const payload: { user_id: string; email?: string; updated_at: string; email_daily_digest?: boolean; email_weekly_digest?: boolean } = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (user.email) payload.email = user.email;
  if (email_daily_digest !== undefined) payload.email_daily_digest = email_daily_digest;
  if (email_weekly_digest !== undefined) payload.email_weekly_digest = email_weekly_digest;

  const { error: upsertErr } = await supabase.from('user_email_preferences').upsert(payload, { onConflict: 'user_id' });
  if (upsertErr) return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
