import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { buildOwnerDashboard } from '@/lib/owner/buildOwnerDashboard';

/** GET: métricas unificadas para /admin/owner (solo rol owner). */
export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const payload = await buildOwnerDashboard();
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[owner-dashboard]', message);
    return NextResponse.json({ error: 'No se pudo generar el panel' }, { status: 500 });
  }
}
