import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readUserSearchParams } from '@/lib/team/membership/search';
import type { CandidateMembership } from '@/lib/team/membership/view';
import { callTeamRpc, commandError, dbFailure, isOwnerId, isRpcData, ownerId } from '../shared';

type FoundRow = { id: string; display_name: string | null; username: string | null };

function readFoundRows(data: unknown): FoundRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is FoundRow => (
    typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string'
  ));
}

/**
 * Candidatos para asignar. Página con tope; q vacío lista la primera página.
 * Cada candidato trae su membresía más reciente por equipo para que la UI distinga
 * miembros, suspendidos y removidos.
 */
export async function GET(request: Request) {
  const owner = await ownerId(request);
  if (!isOwnerId(owner)) return owner;

  const params = readUserSearchParams(new URL(request.url).searchParams);
  if (!params.ok) return commandError('query_invalid');

  const result = await callTeamRpc('team_search_users', {
    p_actor_id: owner.userId,
    p_query: params.query,
    p_limit: params.limit + 1,
    p_offset: params.offset,
  });
  if (!isRpcData(result)) return result;

  const rows = readFoundRows(result.data);
  const page = rows.slice(0, params.limit);
  const ids = page.map((row) => row.id);

  const memberships = new Map<string, CandidateMembership[]>();
  if (ids.length > 0) {
    const { data, error } = await createServerClient()
      .from('team_memberships')
      .select('id, user_id, team_id, role, status, created_at')
      .in('user_id', ids)
      .order('created_at', { ascending: false });
    if (error) return dbFailure('candidate memberships', error);
    for (const item of data ?? []) {
      const row = item as { id: string; user_id: string; team_id: string; role: string; status: string };
      const list = memberships.get(row.user_id) ?? [];
      if (list.some((existing) => existing.teamId === row.team_id)) continue;
      list.push({ membershipId: row.id, teamId: row.team_id, role: row.role, status: row.status });
      memberships.set(row.user_id, list);
    }
  }

  return NextResponse.json({
    users: page.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      username: row.username,
      self: row.id === owner.userId,
      memberships: memberships.get(row.id) ?? [],
    })),
    page: params.page,
    limit: params.limit,
    hasMore: rows.length > params.limit,
  });
}
