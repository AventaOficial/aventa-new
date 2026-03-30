import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { getAffiliateProgramsRuntimeStatus } from '@/lib/affiliate/programCatalog';

/** Estado de afiliadas (activo/inactivo) según variables configuradas en runtime. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const programs = getAffiliateProgramsRuntimeStatus();
  const activeCount = programs.filter((p) => p.active).length;

  return NextResponse.json({
    programs,
    summary: {
      total: programs.length,
      active: activeCount,
      inactive: programs.length - activeCount,
    },
  });
}
