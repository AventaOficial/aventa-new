import { NextResponse } from 'next/server';
import { meAuthFailureResponse, requireBearerMeUser } from '@/lib/server/requireMeUser';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { recordProductEvent } from '@/lib/analytics/recordProductEvent';
import { bodyClaimsForeignUser, interestBodySchema } from '@/lib/interests/schema';
import { buildInterestView, insertInterest, listInterests, loadMatchCandidates } from '@/lib/interests/store';

export async function GET(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: false });
  if ('error' in auth) return meAuthFailureResponse(auth);
  const rl = await enforceRateLimit(`interests:${auth.user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
  const { user, supabase } = auth;
  try {
    const now = new Date();
    const [interests, offers] = await Promise.all([
      listInterests(supabase, user.id),
      loadMatchCandidates(supabase, now),
    ]);
    const view = buildInterestView(interests, offers, now);
    return NextResponse.json({ interests, matches: view.matches, discovery: view.discovery });
  } catch (error) {
    console.error('[interests] list', error instanceof Error ? error.message : 'failed');
    return NextResponse.json({ error: 'No se pudo cargar tu lista de intereses.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return meAuthFailureResponse(auth);
  const rl = await enforceRateLimit(`interests:${auth.user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
  const { user, supabase } = auth;
  const raw = await request.json().catch(() => null);
  if (bodyClaimsForeignUser(raw)) {
    return NextResponse.json({ error: 'Revisa el interés e inténtalo de nuevo.' }, { status: 400 });
  }
  const body = interestBodySchema.safeParse(raw);
  if (!body.success) return NextResponse.json({ error: 'Revisa el interés e inténtalo de nuevo.' }, { status: 400 });
  try {
    const saved = await insertInterest(supabase, user.id, body.data);
    if ('error' in saved) return NextResponse.json({ error: saved.error }, { status: saved.status });
    await recordProductEvent({
      event: 'interest_saved',
      userId: user.id,
      source: 'me/intereses',
      metadata: { action: 'create' },
    });
    return NextResponse.json({ interest: saved.interest }, { status: 201 });
  } catch (error) {
    console.error('[interests] create', error instanceof Error ? error.message : 'failed');
    return NextResponse.json({ error: 'No se pudo guardar el interés.' }, { status: 503 });
  }
}
