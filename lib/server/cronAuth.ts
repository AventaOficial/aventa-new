import { NextRequest, NextResponse } from 'next/server';

/**
 * Protege rutas de cron (Vercel Cron u otros schedulers).
 * Solo: Authorization Bearer CRON_SECRET o header x-cron-secret.
 * Query secrets (?secret=, ?token=, ?cron_secret=) → siempre REJECT (P1-2).
 * CRON_SECRET env ausente → fail-closed.
 */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const sp = request.nextUrl.searchParams;
  if (sp.has('secret') || sp.has('token') || sp.has('cron_secret')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expected = (process.env.CRON_SECRET ?? '').trim();
  if (!expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fromHeader = request.headers.get('x-cron-secret')?.trim() ?? '';
  const authHeader = request.headers.get('authorization');
  const fromBearer =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const secret = fromBearer || fromHeader;
  if (!secret || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
