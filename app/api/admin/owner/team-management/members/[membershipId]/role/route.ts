import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isValidUuid } from '@/lib/server/validateUuid';
import { readRoleCommand } from '@/lib/team/membership/commands';
import { callTeamRpc, commandError, dbFailure, isOwnerId, isRpcData, mutationResponse, ownerId } from '../../../shared';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ membershipId: string }> },
) {
  const owner = await ownerId(request);
  if (!isOwnerId(owner)) return owner;

  const { membershipId } = await context.params;
  if (!isValidUuid(membershipId)) return commandError('invalid_membership');

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('team_memberships')
    .select('user_id, team_id')
    .eq('id', membershipId)
    .maybeSingle();
  if (error) return dbFailure('membership lookup', error);
  const row = data as { user_id: string; team_id: string } | null;
  if (!row) return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });

  const command = readRoleCommand(await request.json().catch(() => null), owner.userId, row.user_id, row.team_id);
  if (!command.ok) return commandError(command.code);

  const result = await callTeamRpc('team_change_role', {
    p_actor_id: owner.userId,
    p_membership_id: membershipId,
    p_role: command.role,
    p_reason: command.reason,
    p_request_id: crypto.randomUUID(),
  });
  if (!isRpcData(result)) return result;
  return mutationResponse(result.data, membershipId);
}
