import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { proactiveRefreshMercadoLibreToken } from '@/lib/integrations/mercadolibre/tokenRefresh';

export const dynamic = 'force-dynamic';

/** GET: refresh proactivo del token OAuth ML (cada ~4 h vía Vercel Cron). */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const result = await proactiveRefreshMercadoLibreToken();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ml-oauth-cron]', message.slice(0, 120));
    return NextResponse.json({ ok: false, refreshed: false, reason: 'unexpected' }, { status: 500 });
  }
}
