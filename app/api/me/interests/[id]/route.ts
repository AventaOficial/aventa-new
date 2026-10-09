import { NextResponse } from 'next/server';
import { meAuthFailureResponse, requireBearerMeUser } from '@/lib/server/requireMeUser';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { recordProductEvent } from '@/lib/analytics/recordProductEvent';
import { interestBodySchema } from '@/lib/interests/schema';
import { deleteInterest, updateInterest } from '@/lib/interests/store';

type Context = { params: Promise<{ id: string }> };

async function gate(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return { response: meAuthFailureResponse(auth) };
  const rl = await enforceRateLimit(`interests:${auth.user.id}`);
  if (!rl.success) return { response: NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 }) };
  return { auth };
}

export async function PATCH(request: Request, context: Context) {
  const opened = await gate(request);
  if ('response' in opened) return opened.response;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'No encontramos ese interés.' }, { status: 404 });
  const body = interestBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Revisa el interés e inténtalo de nuevo.' }, { status: 400 });
  try {
    const saved = await updateInterest(opened.auth.supabase, opened.auth.user.id, id, body.data);
    if ('error' in saved) return NextResponse.json({ error: saved.error }, { status: saved.status });
    await recordProductEvent({
      event: 'interest_saved',
      userId: opened.auth.user.id,
      source: 'me/intereses',
      metadata: { action: 'update' },
    });
    return NextResponse.json({ interest: saved.interest });
  } catch (error) {
    console.error('[interests] update', error instanceof Error ? error.message : 'failed');
    return NextResponse.json({ error: 'No se pudo actualizar el interés.' }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const opened = await gate(request);
  if ('response' in opened) return opened.response;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'No encontramos ese interés.' }, { status: 404 });
  try {
    const removed = await deleteInterest(opened.auth.supabase, opened.auth.user.id, id);
    if (!removed) return NextResponse.json({ error: 'No encontramos ese interés.' }, { status: 404 });
    await recordProductEvent({
      event: 'interest_removed',
      userId: opened.auth.user.id,
      source: 'me/intereses',
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[interests] delete', error instanceof Error ? error.message : 'failed');
    return NextResponse.json({ error: 'No se pudo eliminar el interés.' }, { status: 503 });
  }
}
