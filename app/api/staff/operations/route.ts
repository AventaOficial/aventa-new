import { NextResponse } from 'next/server';
import { requireOperationsRead } from '@/lib/staff/requireOperationsStaff';
import { buildOperationsPayload } from '@/lib/staff/buildOperationsPayload';

export async function GET(request: Request) {
  const auth = await requireOperationsRead(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const payload = await buildOperationsPayload(auth.role, auth.displayName);
    return NextResponse.json(payload);
  } catch (e) {
    console.error('[staff/operations]', e);
    return NextResponse.json({ error: 'No se pudo cargar operaciones' }, { status: 500 });
  }
}
