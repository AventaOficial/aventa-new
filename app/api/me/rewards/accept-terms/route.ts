import { NextResponse } from 'next/server';
import { requireBearerMeUser, meAuthFailureResponse } from '@/lib/server/requireMeUser';
import { acceptRewardsProgramTerms } from '@/lib/rewards/unlock';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

/**
 * POST: aceptar términos del Programa de Recompensas (sección 8).
 * No confirma welcome offer ni paga nada — solo consentimiento.
 * Requiere desbloqueo previo (servidor).
 */
export async function POST(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return meAuthFailureResponse(auth);
  const { user, supabase } = auth;

  const rl = await enforceRateLimitCustom(`rewards-accept-terms:${user.id}`, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 });
  }

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
