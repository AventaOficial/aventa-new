import { NextResponse } from 'next/server';
import { profileMenuLinks } from '@/lib/team/config/profileMenu';
import { loadActiveMemberships } from '@/lib/team/gate/memberships';
import { visibleActiveTeamIds } from '@/lib/team/gate/policy';
import { readTeamActor } from '@/lib/team/gate/session';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * Arma el menú de perfil de la sesión.
 * No abre el dashboard: cada destino vuelve a validar sesión, membresía y permiso.
 */
export async function GET() {
  const actor = await readTeamActor();
  if (!actor) {
    return NextResponse.json({ ok: false }, { status: 401, headers: noStore });
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', actor.userId)
    .eq('role', 'owner')
    .maybeSingle();

  const loaded = await loadActiveMemberships(actor.userId);
  const teamIds = loaded.ok ? visibleActiveTeamIds(loaded.memberships) : [];

  return NextResponse.json(
    {
      ok: true,
      links: profileMenuLinks({
        isOwner: data?.role === 'owner',
        teamIds,
      }),
    },
    { headers: noStore },
  );
}
