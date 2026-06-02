import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { buildAventaMap } from '@/lib/owner/buildAventaMap';

/** GET: mapa de negocio para fundador (solo rol owner). */
export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const payload = await buildAventaMap();
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[owner-map]', message);
    return NextResponse.json({ error: 'No se pudo generar el mapa' }, { status: 500 });
  }
}
