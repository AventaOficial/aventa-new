import { NextResponse } from 'next/server';
import { isTeamId } from '@/lib/team/roles/teams';
import { readAssignCommand } from '@/lib/team/membership/commands';
import { readMemberStatusFilter } from '@/lib/team/membership/view';
import {
  callTeamRpc,
  commandError,
  isOwnerId,
  isRpcData,
  mutationResponse,
  ownerId,
  readMemberViews,
  rpcMembershipId,
} from '../shared';

export async function GET(request: Request) {
  const owner = await ownerId(request);
  if (!isOwnerId(owner)) return owner;

  const params = new URL(request.url).searchParams;
  const team = params.get('team');
  const status = readMemberStatusFilter(params.get('status'));
  if (team && !isTeamId(team)) {
    return NextResponse.json({ error: 'Equipo desconocido.' }, { status: 400 });
  }
  if (status === null) {
    return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
  }

  const members = await readMemberViews({ team, status });
  if (members instanceof NextResponse) return members;
  return NextResponse.json({ members });
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
  return mutationResponse(result.data, rpcMembershipId(result.data));
}
