import { createServerClient } from '@/lib/supabase/server';
import { logTeamGate } from './log';
import { membershipFromRow } from './policy';
import type { TeamMembership } from '../roles/membership';

export type MembershipLoad =
  | { ok: true; memberships: TeamMembership[] }
  | { ok: false; code: 'schema_unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRow(value: unknown): { teamId: string; role: string; status: string } | null {
  if (!isRecord(value)) return null;
  const { team_id, role, status } = value;
  if (typeof team_id !== 'string' || typeof role !== 'string' || typeof status !== 'string') return null;
  return { teamId: team_id, role, status };
}

/**
 * Lee únicamente membresías ACTIVE del usuario de la sesión.
 * service_role no sustituye la comprobación: el user id llega de `getUser()`.
 */
export async function loadActiveMemberships(userId: string): Promise<MembershipLoad> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('team_memberships')
      .select('team_id, role, status')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');

    if (error) {
      logTeamGate('membership_schema', userId);
      return { ok: false, code: 'schema_unavailable' };
    }

    const memberships: TeamMembership[] = [];
    for (const item of data ?? []) {
      const row = readRow(item);
      if (!row) continue;
      const membership = membershipFromRow(userId, row);
      if (membership) memberships.push(membership);
    }
    return { ok: true, memberships };
  } catch {
    logTeamGate('membership_schema', userId);
    return { ok: false, code: 'schema_unavailable' };
  }
}
