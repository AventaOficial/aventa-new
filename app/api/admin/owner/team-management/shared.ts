import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { failureBody, isServerFailure, rpcFailure } from '@/lib/team/membership/errors';
import type { TransitionCode } from '@/lib/team/membership/transitions';
import { LIVE_STATUSES, type MemberStatusFilter } from '@/lib/team/membership/view';

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

export function commandError(code: TransitionCode | 'query_invalid'): NextResponse {
  const body = failureBody(code);
  return NextResponse.json({ error: body.error }, { status: body.status });
}

/** Los 5xx quedan en el log con el código de Postgres/PostgREST; el cliente recibe un mensaje estable. */
export function dbFailure(
  operation: string,
  error: { message: string; code?: string | null },
): NextResponse {
  const body = rpcFailure(error.message);
  if (isServerFailure(body)) {
    console.error(`[team-management] ${operation} failed`, { code: error.code ?? null, message: error.message });
  }
  return NextResponse.json({ error: body.error }, { status: body.status });
}

export async function callTeamRpc(
  name: 'team_assign_member' | 'team_change_role' | 'team_set_status' | 'team_search_users',
  args: Record<string, unknown>,
): Promise<{ data: unknown } | NextResponse> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return dbFailure(name, error);
  return { data };
}

export function isRpcData(value: { data: unknown } | NextResponse): value is { data: unknown } {
  return 'data' in value;
}

export type MemberView = {
  id: string;
  userId: string;
  displayName: string | null;
  username: string | null;
  teamId: string;
  role: string;
  status: string;
  assignedBy: string;
  assignedByName: string | null;
  createdAt: string;
  statusChangedAt: string;
};

type MemberRow = {
  id: string;
  user_id: string;
  team_id: string;
  role: string;
  status: string;
  assigned_by: string;
  created_at: string;
  status_changed_at: string;
};

const MEMBER_COLUMNS = 'id, user_id, team_id, role, status, assigned_by, created_at, status_changed_at';
const PROFILE_COLUMNS = 'id, display_name, username';

export async function readProfiles(
  userIds: readonly string[],
): Promise<Map<string, { display_name: string | null; username: string | null }> | NextResponse> {
  const profiles = new Map<string, { display_name: string | null; username: string | null }>();
  if (userIds.length === 0) return profiles;
  const { data, error } = await createServerClient()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .in('id', [...userIds]);
  if (error) return dbFailure('profiles', error);
  for (const person of data ?? []) {
    const row = person as { id: string; display_name: string | null; username: string | null };
    profiles.set(row.id, { display_name: row.display_name, username: row.username });
  }
  return profiles;
}

/** Única lectura de membresías para la lista y para la respuesta de cada mutación. */
export async function readMemberViews(filter: {
  membershipId?: string;
  team?: string | null;
  status?: MemberStatusFilter;
}): Promise<MemberView[] | NextResponse> {
  let query = createServerClient()
    .from('team_memberships')
    .select(MEMBER_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter.membershipId) query = query.eq('id', filter.membershipId);
  if (filter.team) query = query.eq('team_id', filter.team);
  if (filter.status === 'live') query = query.in('status', [...LIVE_STATUSES]);
  else if (filter.status) query = query.eq('status', filter.status);

  const { data, error } = await query;
  if (error) return dbFailure('memberships', error);

  const rows = (data ?? []) as MemberRow[];
  const profiles = await readProfiles([...new Set(rows.flatMap((row) => [row.user_id, row.assigned_by]))]);
  if (profiles instanceof NextResponse) return profiles;

  return rows.map((row) => ({
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
  }));
}

/**
 * Respuesta de una mutación: el resultado de la RPC más la fila persistida.
 * Si la relectura falla, la mutación ya está hecha: membership null y el cliente recarga la lista.
 */
export async function mutationResponse(data: unknown, membershipId: string | null): Promise<NextResponse> {
  if (!membershipId) return NextResponse.json({ result: data, membership: null });
  try {
    const views = await readMemberViews({ membershipId });
    if (views instanceof NextResponse) return NextResponse.json({ result: data, membership: null });
    return NextResponse.json({ result: data, membership: views[0] ?? null });
  } catch (error) {
    console.error('[team-management] membership reread failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ result: data, membership: null });
  }
}

export function rpcMembershipId(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('membership_id' in data)) return null;
  const value = data.membership_id;
  return typeof value === 'string' ? value : null;
}
