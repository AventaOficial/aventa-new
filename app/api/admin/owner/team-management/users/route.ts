import { NextResponse } from 'next/server';
import { callTeamRpc, isOwnerId, isRpcData, ownerId } from '../shared';

export async function GET(request: Request) {
  const owner = await ownerId(request);
  if (!isOwnerId(owner)) return owner;

  const query = new URL(request.url).searchParams.get('q') ?? '';
  const result = await callTeamRpc('team_search_users', {
    p_actor_id: owner.userId,
    p_query: query,
  });
  if (!isRpcData(result)) return result;
  return NextResponse.json({ users: result.data ?? [] });
}
