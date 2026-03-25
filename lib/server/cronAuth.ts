import { NextRequest, NextResponse } from 'next/server';

/**
 * Protege rutas invocadas por Vercel Cron u otros schedulers.
 * Con CRON_SECRET definido en Vercel, los cron jobs suelen enviar `Authorization: Bearer <CRON_SECRET>`.
 * Abrir la URL en el navegador (sin secreto) devuelve 401; es el comportamiento esperado.
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
