import { NextResponse } from 'next/server';
import { requireFinanceRead } from '@/lib/staff/requireFinanceStaff';
import { buildFinancePayload } from '@/lib/staff/buildFinancePayload';

export async function GET(request: Request) {
  const auth = await requireFinanceRead(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const payload = await buildFinancePayload(auth.role, auth.displayName);
    return NextResponse.json(payload);
  } catch (e) {
    console.error('[staff/finance]', e);
    return NextResponse.json({ error: 'No se pudo cargar contabilidad' }, { status: 500 });
  }
}
