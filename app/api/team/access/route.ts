import { NextResponse } from 'next/server';
import { teamHomePermission } from '@/lib/team/config/catalog';
import { requireTeamPermission } from '@/lib/team/gate/require';
import { readRequestedTeam } from '@/lib/team/gate/policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * El equipo de la query es el recurso pedido.
 * El usuario, el rol y el permiso salen de la sesión y de team_memberships.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = readRequestedTeam(url.searchParams.get('team'));
  if (!teamId) {
    return NextResponse.json({ ok: false, code: 'invalid_team' }, { status: 400, headers: noStore });
  }

  const access = await requireTeamPermission(teamId, teamHomePermission(teamId));
  if (!access.ok) {
    return NextResponse.json({ ok: false, code: access.code }, { status: access.status, headers: noStore });
  }

  return NextResponse.json(
    { ok: true, teamId: access.membership.teamId, role: access.membership.role },
    { headers: noStore },
  );
}
