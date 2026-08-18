import { NextResponse } from 'next/server';
import { requireStaffHub } from '@/lib/server/requireStaff';
import { buildStaffHomePayload } from '@/lib/staff/buildStaffHome';

/** Legacy alias → /api/staff/home */
export async function GET(request: Request) {
  const auth = await requireStaffHub(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const payload = await buildStaffHomePayload(auth.role, auth.displayName, 'home');
    return NextResponse.json(payload);
  } catch (e) {
    console.error('[admin/team-board]', e);
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }
}
