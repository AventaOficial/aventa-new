import type { SupabaseClient } from '@supabase/supabase-js';
import { isMcpScope, type MachineClientStatus, type McpScope } from '@/lib/mcp/contract';
import { machineTokenFromAuthorization, machineTokenHashMatches } from '@/lib/mcp/tokens';

export type MachineClientContext = {
  id: string;
  name: string;
  scopes: McpScope[];
  status: Exclude<MachineClientStatus, 'revoked'>;
  authorProfileId: string;
  dailyCandidateCap: number;
};

export type MachineAuthResult =
  | { ok: true; client: MachineClientContext }
  | { ok: false; reason: 'missing_token' | 'invalid_token' | 'revoked' | 'expired' | 'lookup_failed' };

type MachineClientRow = {
  id: string;
  name: string;
  token_hash: string;
  scopes: unknown;
  status: string;
  author_profile_id: string;
  daily_candidate_cap: number | null;
  expires_at: string | null;
  revoked_at: string | null;
};

/**
 * Autentica `Authorization: Bearer avk_...` contra machine_clients.
 * Nunca registra el token ni la cabecera.
 */
export async function authenticateMachineClient(
  supabase: SupabaseClient,
  authorization: string | null | undefined,
  now: Date = new Date(),
): Promise<MachineAuthResult> {
  if (!authorization || !authorization.trim()) return { ok: false, reason: 'missing_token' };
  const parsed = machineTokenFromAuthorization(authorization);
  if (!parsed) return { ok: false, reason: 'invalid_token' };

  const { data, error } = await supabase
    .from('machine_clients')
    .select('id, name, token_hash, scopes, status, author_profile_id, daily_candidate_cap, expires_at, revoked_at')
    .eq('token_prefix', parsed.prefix)
    .maybeSingle();
  if (error) {
    console.error('[mcp-auth] client lookup failed');
    return { ok: false, reason: 'lookup_failed' };
  }
  const row = data as MachineClientRow | null;
  if (!row || !machineTokenHashMatches(parsed.token, row.token_hash)) {
    return { ok: false, reason: 'invalid_token' };
  }
  if (row.status === 'revoked' || row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.status !== 'active' && row.status !== 'paused') return { ok: false, reason: 'invalid_token' };
  if (row.expires_at) {
    const exp = Date.parse(row.expires_at);
    if (!Number.isFinite(exp) || exp <= now.getTime()) return { ok: false, reason: 'expired' };
  }
  const scopes = Array.isArray(row.scopes) ? row.scopes.filter(isMcpScope) : [];
  const cap = Number(row.daily_candidate_cap);
  return {
    ok: true,
    client: {
      id: row.id,
      name: row.name,
      scopes: [...new Set(scopes)],
      status: row.status,
      authorProfileId: row.author_profile_id,
      dailyCandidateCap: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0,
    },
  };
}

export function clientHasScope(client: Pick<MachineClientContext, 'scopes'>, scope: McpScope): boolean {
  return client.scopes.includes(scope);
}
