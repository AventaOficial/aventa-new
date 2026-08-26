import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { getMercadoLibreOAuthStatus } from '@/lib/integrations/mercadolibre/tokenStore';

export const dynamic = 'force-dynamic';

/** GET: estado de conexión OAuth ML (solo owner; nunca expone tokens). */
export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const status = await getMercadoLibreOAuthStatus();
    return NextResponse.json(status, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ml-oauth] oauth-status failed', message.slice(0, 120));
    return NextResponse.json({ error: 'No se pudo leer el estado de Mercado Libre' }, { status: 500 });
  }
}
