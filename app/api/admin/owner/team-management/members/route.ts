import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isMembershipStatus } from '@/lib/team/roles/membership';
import { isTeamId } from '@/lib/team/roles/teams';
import { readAssignCommand } from '@/lib/team/membership/commands';
import { callTeamRpc, commandError, isOwnerId, isRpcData, ownerId } from '../shared';
import { rpcFailure } from '@/lib/team/membership/errors';

const MEMBER_COLUMNS = 'id, user_id, team_id, role, status, assigned_by, created_at, status_changed_at';
const PROFILE_COLUMNS = 'id, display_name, username';

export async function GET(request: Request) {
  const owner = await ownerId(request);
  if (!isOwnerId(owner)) return owner;

  const params = new URL(request.url).searchParams;
  const team = params.get('team');
  const status = params.get('status');
  if (team && !isTeamId(team)) {
    return NextResponse.json({ error: 'Equipo desconocido.' }, { status: 400 });
  }
  if (status && !isMembershipStatus(status)) {
    return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
  }

  const supabase = createServerClient();
  let query = supabase
    .from('team_memberships')
    .select(MEMBER_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (team) query = query.eq('team_id', team);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    const body = rpcFailure(error.message);
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    team_id: string;
    role: string;
    status: string;
    assigned_by: string;
    created_at: string;
    status_changed_at: string;
  }>;
  const userIds = [...new Set(rows.flatMap((row) => [row.user_id, row.assigned_by]))];
  const profiles = new Map<string, { display_name: string | null; username: string | null }>();
  if (userIds.length > 0) {
    const { data: people, error: peopleError } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .in('id', userIds);
    if (peopleError) {
      const body = rpcFailure(peopleError.message);
      return NextResponse.json({ error: body.error }, { status: body.status });
    }
    for (const person of people ?? []) {
      const row = person as { id: string; display_name: string | null; username: string | null };
      profiles.set(row.id, { display_name: row.display_name, username: row.username });
    }
  }

  return NextResponse.json({
    members: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      displayName: profiles.get(row.user_id)?.display_name ?? null,
      username: profiles.get(row.user_id)?.username ?? null,
      teamId: row.team_id,
      role: row.role,
      status: row.status,
      assignedBy: row.assigned_by,
      assignedByName: profiles.get(row.assigned_by)?.display_name ?? null,
      createdAt: row.created_at,
      statusChangedAt: row.status_changed_at,
    })),
  });
}

export async function POST(request: Request) {
  const owner = await ownerId(request);
  if (!isOwnerId(owner)) return owner;

  const command = readAssignCommand(await request.json().catch(() => null), owner.userId);
  if (!command.ok) return commandError(command.code);

  const result = await callTeamRpc('team_assign_member', {
    p_actor_id: owner.userId,
    p_target_user_id: command.targetUserId,
    p_team_id: command.teamId,
    p_role: command.role,
    p_reason: command.reason,
    p_request_id: crypto.randomUUID(),
  });
  if (!isRpcData(result)) return result;
  return NextResponse.json(result.data);
}
