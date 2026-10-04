import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { failureBody, rpcFailure } from '@/lib/team/membership/errors';
import type { TransitionCode } from '@/lib/team/membership/transitions';

export async function ownerId(request: Request): Promise<{ userId: string } | NextResponse> {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return { userId: auth.user.id };
}

export function isOwnerId(value: { userId: string } | NextResponse): value is { userId: string } {
  return 'userId' in value;
}

export function commandError(code: TransitionCode): NextResponse {
  const body = failureBody(code);
  return NextResponse.json({ error: body.error }, { status: body.status });
}

export async function callTeamRpc(
  name: 'team_assign_member' | 'team_change_role' | 'team_set_status' | 'team_search_users',
  args: Record<string, unknown>,
): Promise<{ data: unknown } | NextResponse> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const body = rpcFailure(error.message);
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  return { data };
}

export function isRpcData(value: { data: unknown } | NextResponse): value is { data: unknown } {
  return 'data' in value;
}
