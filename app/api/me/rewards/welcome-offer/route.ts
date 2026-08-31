import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { selectWelcomeOffer } from '@/lib/rewards/unlock';
import { isValidUuid } from '@/lib/server/validateUuid';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

/** POST: elegir Oferta de Bienvenida (inmutable). */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = await enforceRateLimitCustom(`rewards-welcome:${token.slice(0, 16)}`, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : '';
  if (!offerId || !isValidUuid(offerId)) {
    return NextResponse.json({ error: 'offerId inválido' }, { status: 400 });
  }

  const result = await selectWelcomeOffer(supabase, user.id, offerId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    welcomeOfferId: result.welcomeOfferId,
    selectedAt: result.selectedAt,
  });
}
