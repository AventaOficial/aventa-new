import { NextResponse } from 'next/server';
import { createOfferBatch } from '@/lib/offers/batch';
import { extractOfferUrlsFromText } from '@/lib/offers/batchPaste';
import { meAuthFailureResponse, requireBearerMeUser } from '@/lib/server/requireMeUser';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

/** POST: pega el texto de Grok o ChatGPT y manda los enlaces a moderación. */
export async function POST(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return meAuthFailureResponse(auth);

  const rl = await enforceRateLimitCustom(`lotes:${auth.user.id}`, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text : '';
  const found = extractOfferUrlsFromText(text);
  if (found.length === 0) {
    return NextResponse.json(
      { error: 'No encontré enlaces. Pega el texto completo, con las URLs.' },
      { status: 400 },
    );
  }

  const result = await createOfferBatch({
    supabase: auth.supabase,
    createdBy: auth.user.id,
    name: null,
    text,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }
  if (!result.batch) {
    return NextResponse.json({ error: 'Esas ofertas ya están en un lote abierto.' }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    links: result.inserted,
    batchId: result.batch.id,
  });
}
