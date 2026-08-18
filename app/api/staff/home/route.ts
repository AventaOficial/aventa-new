import { NextResponse } from 'next/server';
import { requireStaffHub } from '@/lib/server/requireStaff';
import { buildStaffHomePayload } from '@/lib/staff/buildStaffHome';
import type { StaffDepartmentId } from '@/lib/staff/permissions';
import { canAccessStaffDepartment } from '@/lib/staff/permissions';

const DEPTS: StaffDepartmentId[] = [
  'home',
  'moderacion',
  'marketing',
  'contabilidad',
  'operaciones',
  'gerencia',
];

export async function GET(request: Request) {
  const auth = await requireStaffHub(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('department') ?? 'home';
  const department = DEPTS.includes(raw as StaffDepartmentId) ? (raw as StaffDepartmentId) : 'home';

  if (!canAccessStaffDepartment(auth.role, department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const payload = await buildStaffHomePayload(auth.role, auth.displayName, department);
    return NextResponse.json(payload);
  } catch (e) {
    console.error('[staff/home]', e);
    return NextResponse.json({ error: 'No se pudo cargar el hub' }, { status: 500 });
  }
}
