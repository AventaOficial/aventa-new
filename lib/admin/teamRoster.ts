import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAuthUserForEquipoPassword } from '@/lib/admin/equipoPassword';
import { loadStaffEquipoCredentials } from '@/lib/admin/staffEquipoCredentials';
import { pickEffectiveRole, type Role } from '@/lib/admin/roles';
import { TEAM_LABELS, isTeamId } from '@/lib/team/roles/teams';
import { teamRoleLabel } from '@/lib/team/roles/catalog';

export type RosterMembership = {
  team_id: string;
  team_label: string;
  role: string;
  role_label: string;
  status: string;
};

export type RosterMember = {
  user_id: string;
  staff_role: Role | null;
  display_name: string | null;
  avatar_url: string | null;
  reputation_level: number;
  reputation_score: number;
  email: string | null;
  has_email_password: boolean;
  memberships: RosterMembership[];
  last_equipo_password: { password: string; generated_at: string } | null;
};

function effectiveRoleFromRows(rows: { role: Role }[] | null | undefined): Role | null {
  if (!rows?.length) return null;
  return pickEffectiveRole(rows.map((r) => r.role));
}

export async function loadAdminTeamRoster(
  supabase: SupabaseClient,
  options: { includePasswordLedger: boolean },
): Promise<RosterMember[]> {
  const { data: roleRows, error: roleError } = await supabase.from('user_roles').select('user_id, role');
  if (roleError) throw new Error(roleError.message);

  const byUserRole = new Map<string, Role>();
  for (const r of (roleRows ?? []) as { user_id: string; role: Role }[]) {
    const current = byUserRole.get(r.user_id);
    if (!current || pickEffectiveRole([current, r.role]) === r.role) {
      byUserRole.set(r.user_id, r.role);
    }
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from('team_memberships')
    .select('user_id, team_id, role, status')
    .in('status', ['ACTIVE', 'SUSPENDED']);

  if (membershipError) {
    console.warn('[admin/team] team_memberships:', membershipError.message);
  }

  const membershipsByUser = new Map<string, RosterMembership[]>();
  for (const row of (membershipRows ?? []) as {
    user_id: string;
    team_id: string;
    role: string;
    status: string;
  }[]) {
    const teamId = row.team_id;
    const label = isTeamId(teamId) ? TEAM_LABELS[teamId] : teamId;
    const roleLabel = isTeamId(teamId) ? teamRoleLabel(teamId, row.role) : row.role;
    const list = membershipsByUser.get(row.user_id) ?? [];
    list.push({
      team_id: teamId,
      team_label: label,
      role: row.role,
      role_label: roleLabel,
      status: row.status,
    });
    membershipsByUser.set(row.user_id, list);
  }

  const userIds = [...new Set([...byUserRole.keys(), ...membershipsByUser.keys()])];
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, reputation_level, reputation_score')
    .in('id', userIds);

  const profileMap = new Map<
    string,
    {
      display_name: string | null;
      avatar_url: string | null;
      reputation_level: number;
      reputation_score: number;
    }
  >();
  for (const p of (profiles ?? []) as {
    id: string;
    display_name: string | null;
    avatar_url?: string | null;
    reputation_level?: number;
    reputation_score?: number;
  }[]) {
    profileMap.set(p.id, {
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
      reputation_level: Math.max(1, p.reputation_level ?? 1),
      reputation_score: Math.max(0, p.reputation_score ?? 0),
    });
  }

  const authFlags = await Promise.all(
    userIds.map(async (user_id) => {
      const loaded = await loadAuthUserForEquipoPassword(supabase, user_id);
      if (!loaded.ok) {
        return { user_id, email: null as string | null, has_email_password: false };
      }
      return {
        user_id,
        email: loaded.email,
        has_email_password: loaded.hasEmailPassword,
      };
    }),
  );
  const authByUser = new Map(authFlags.map((row) => [row.user_id, row]));

  const ledger = options.includePasswordLedger
    ? await loadStaffEquipoCredentials(supabase, userIds)
    : new Map<string, { password: string; generated_at: string }>();

  const roster: RosterMember[] = userIds.map((user_id) => {
    const prof = profileMap.get(user_id);
    const auth = authByUser.get(user_id);
    const cred = ledger.get(user_id) ?? null;
    return {
      user_id,
      staff_role: byUserRole.get(user_id) ?? null,
      display_name: prof?.display_name ?? null,
      avatar_url: prof?.avatar_url ?? null,
      reputation_level: prof?.reputation_level ?? 1,
      reputation_score: prof?.reputation_score ?? 0,
      email: auth?.email ?? null,
      has_email_password: auth?.has_email_password ?? false,
      memberships: membershipsByUser.get(user_id) ?? [],
      last_equipo_password: cred
        ? { password: cred.password, generated_at: cred.generated_at }
        : null,
    };
  });

  roster.sort((a, b) => {
    const rank = (r: Role | null) => (r === 'owner' ? 0 : r ? 1 : 2);
    const dr = rank(a.staff_role) - rank(b.staff_role);
    if (dr !== 0) return dr;
    const an = (a.display_name ?? a.user_id).toLowerCase();
    const bn = (b.display_name ?? b.user_id).toLowerCase();
    return an.localeCompare(bn, 'es');
  });

  return roster;
}

export { effectiveRoleFromRows };
