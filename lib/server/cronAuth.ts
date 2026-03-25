import { NextRequest, NextResponse } from 'next/server';

/**
 * Protege rutas invocadas por Vercel Cron u otros schedulers.
 * Configura CRON_SECRET en producción y el mismo valor en el dashboard de Vercel (header o query).
 */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const fromQuery = request.nextUrl.searchParams.get('secret');
  const fromHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const fromBearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const secret = fromQuery ?? fromHeader ?? fromBearer ?? '';
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
