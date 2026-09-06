import { NextResponse } from 'next/server';
import { requireBearerMeUser, meAuthFailureResponse } from '@/lib/server/requireMeUser';
import { selectWelcomeOffer } from '@/lib/rewards/unlock';
import { isValidUuid } from '@/lib/server/validateUuid';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

/**
 * POST: elegir Oferta de Bienvenida (inmutable).
 * Requiere términos vigentes (o acceptTerms: true para aceptar en el mismo paso — legacy).
 * Fase 5 usará este endpoint tras el flujo de términos (Fase 3–4).
 */
export async function POST(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return meAuthFailureResponse(auth);
  const { user, supabase } = auth;

  const rl = await enforceRateLimitCustom(`rewards-welcome:${user.id}`, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : '';
  const acceptTerms = body?.acceptTerms === true;
  if (!offerId || !isValidUuid(offerId)) {
    return NextResponse.json({ error: 'offerId inválido' }, { status: 400 });
  }

  const result = await selectWelcomeOffer(supabase, user.id, offerId, {
    acceptTerms: acceptTerms || undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    welcomeOfferId: result.welcomeOfferId,
    selectedAt: result.selectedAt,
    termsVersion: result.termsVersion,
  });
}
