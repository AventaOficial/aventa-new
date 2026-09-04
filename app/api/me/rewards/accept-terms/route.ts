import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { acceptRewardsProgramTerms } from '@/lib/rewards/unlock';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

/**
 * POST: aceptar términos del Programa de Recompensas (sección 8).
 * No confirma welcome offer ni paga nada — solo consentimiento.
 * Requiere desbloqueo previo (servidor).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = await enforceRateLimitCustom(`rewards-accept-terms:${token.slice(0, 16)}`, 'reports');
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
  if (body?.accept !== true) {
    return NextResponse.json(
      { error: 'Debes aceptar los Términos y Condiciones para continuar' },
      { status: 400 },
    );
  }

  const result = await acceptRewardsProgramTerms(supabase, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    alreadyAccepted: result.alreadyAccepted,
    acceptedAt: result.acceptedAt,
    termsVersion: result.termsVersion,
    /** Fase 3: pendiente de elegir oferta (fase posterior). */
    claimPhase: 'pending_selection',
  });
}
