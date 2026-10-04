import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { buildOwnerDashboard } from '@/lib/owner/buildOwnerDashboard';
import { buildOwnerCommand } from '@/lib/owner/buildOwnerCommand';
import { parseOwnerRange } from '@/lib/owner/ownerRange';

/**
 * GET: métricas unificadas para /admin/owner (solo rol owner).
 * `?view=command&range=today|7d|30d|month` → agregados por rango del CEO Command Center (solo lectura).
 */
export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get('view');

  try {
    const payload =
      view === 'command'
        ? await buildOwnerCommand(parseOwnerRange(url.searchParams.get('range')))
        : await buildOwnerDashboard();
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[owner-dashboard]', view ?? 'default', message);
    return NextResponse.json({ error: 'No se pudo generar el panel' }, { status: 500 });
  }
}
