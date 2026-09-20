import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { diagnoseOfferUrl } from '@/lib/offers/diagnoseOfferUrl';
import { validateOfferImageUrl } from '@/lib/offers/imageValidation';

/** POST { url, probeDestination?, imageUrl? } — URL + image forensics (no secrets). */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return NextResponse.json({ error: 'url obligatoria' }, { status: 400 });

  const probeDestination = body.probeDestination !== false;
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : null;
  const titleHint = typeof body.title === 'string' ? body.title : null;

  const diagnosis = await diagnoseOfferUrl(url, { probeDestination });
  const image = validateOfferImageUrl(imageUrl, { titleHint });

  return NextResponse.json({
    ok: true,
    diagnosis,
    image,
  });
}
