import { NextRequest, NextResponse } from 'next/server';

/**
 * Protege rutas invocadas por Vercel Cron u otros schedulers.
 * Preferir: `Authorization: Bearer <CRON_SECRET>` o header `x-cron-secret`.
 * `?secret=` se mantiene por compatibilidad con cron-job.org (documentado);
 * no lo uses en URLs públicas ni lo compartas en chats.
 */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const fromHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const fromBearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const fromQuery = request.nextUrl.searchParams.get('secret');
  const secret = fromBearer || fromHeader || fromQuery || '';
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (fromQuery && !fromBearer && !fromHeader) {
    console.warn(
      '[cronAuth] CRON_SECRET recibido por query string. Prefiere Authorization: Bearer o x-cron-secret.',
    );
  }
  return null;
}
