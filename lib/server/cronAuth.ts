import { NextRequest, NextResponse } from 'next/server';

/**
 * Protege rutas invocadas por Vercel Cron u otros schedulers.
 * Preferir: `Authorization: Bearer <CRON_SECRET>` o header `x-cron-secret`.
 * `?secret=` solo si `allowQuerySecret` es true (crons legacy / cron-job.org).
 */
export function requireCronSecret(
  request: NextRequest,
  options?: { allowQuerySecret?: boolean },
): NextResponse | null {
  const fromHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const fromBearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const allowQuery = options?.allowQuerySecret !== false;
  const fromQuery = allowQuery ? request.nextUrl.searchParams.get('secret') : null;
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
