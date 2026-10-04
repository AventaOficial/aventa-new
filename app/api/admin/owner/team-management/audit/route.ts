import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isTeamId } from '@/lib/team/roles/teams';
import { rpcFailure } from '@/lib/team/membership/errors';
import { isOwnerId, ownerId } from '../shared';

const AUDIT_COLUMNS =
  'id, actor_id, target_user_id, team_id, action, previous_state, new_state, reason, request_id, created_at';

export async function GET(request: Request) {
  const owner = await ownerId(request);
  if (!isOwnerId(owner)) return owner;

  const team = new URL(request.url).searchParams.get('team');
  if (team && !isTeamId(team)) {
    return NextResponse.json({ error: 'Equipo desconocido.' }, { status: 400 });
  }

  const supabase = createServerClient();
  let query = supabase
    .from('team_audit_log')
    .select(AUDIT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50);
  if (team) query = query.eq('team_id', team);

  const { data, error } = await query;
  if (error) {
    const body = rpcFailure(error.message);
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  return NextResponse.json({
    events: (data ?? []).map((row) => {
      const event = row as {
        id: string;
        actor_id: string;
        target_user_id: string;
        team_id: string;
        action: string;
        previous_state: unknown;
        new_state: unknown;
        reason: string | null;
        request_id: string;
        created_at: string;
      };
      return {
        id: event.id,
        actorId: event.actor_id,
        targetUserId: event.target_user_id,
        teamId: event.team_id,
        action: event.action,
        previousState: event.previous_state,
        newState: event.new_state,
        reason: event.reason,
        requestId: event.request_id,
        createdAt: event.created_at,
      };
    }),
  });
}
