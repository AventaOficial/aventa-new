import { NextResponse } from 'next/server';
import { requireGerencia } from '@/lib/server/requireStaff';
import { buildGerenciaPayload } from '@/lib/staff/buildStaffHome';

export async function GET(request: Request) {
  const auth = await requireGerencia(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const payload = await buildGerenciaPayload(auth.role, auth.displayName);
    return NextResponse.json(payload);
  } catch (e) {
    console.error('[staff/gerencia]', e);
    return NextResponse.json({ error: 'No se pudo cargar gerencia' }, { status: 500 });
  }
}
