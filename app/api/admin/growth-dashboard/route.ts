import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { buildGrowthDashboard } from '@/lib/owner/buildGrowthDashboard';

/** GET: panel Crecimiento AVENTA — usuarios, etapa, infra y hoja de ruta (solo owner). */
export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const payload = await buildGrowthDashboard();
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[growth-dashboard]', message);
    return NextResponse.json({ error: 'No se pudo generar el panel de crecimiento' }, { status: 500 });
  }
}
