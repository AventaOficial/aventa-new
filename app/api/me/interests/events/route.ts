import { NextResponse } from 'next/server';
import { meAuthFailureResponse, requireBearerMeUser } from '@/lib/server/requireMeUser';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { recordProductEvent } from '@/lib/analytics/recordProductEvent';
import { interestEventSchema } from '@/lib/interests/schema';

export async function POST(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: false });
  if ('error' in auth) return meAuthFailureResponse(auth);
  const rl = await enforceRateLimitCustom(`interest-events:${auth.user.id}`, 'events');
  if (!rl.success) return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
  const body = interestEventSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 });
  await recordProductEvent({
    event: body.data.name,
    userId: auth.user.id,
    offerId: body.data.offerId ?? null,
    source: 'me/intereses',
  });
  return NextResponse.json({ ok: true });
}
