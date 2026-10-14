import type { SupabaseClient } from '@supabase/supabase-js';
import { configuredBotUserIds } from '@/lib/bots/ingest/isBotUserId';
import {
  MCP_DEFAULT_DAILY_CANDIDATE_CAP,
  MCP_MAX_DAILY_CANDIDATE_CAP,
  isMcpScope,
  type MachineClientStatus,
  type McpScope,
} from '@/lib/mcp/contract';
/** Columnas que el Owner puede ver sin `hunter_code`, para entornos sin esa migración. */
export const MACHINE_CLIENT_BASE_COLUMNS =
  'id, name, token_prefix, scopes, status, author_profile_id, daily_candidate_cap, expires_at, created_by, revoked_at, created_at, updated_at';

/** Columnas que el Owner puede ver. Nunca incluye token_hash. */
export const MACHINE_CLIENT_PUBLIC_COLUMNS = `${MACHINE_CLIENT_BASE_COLUMNS}, hunter_code`;

export type MachineClientPublic = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: McpScope[];
  status: MachineClientStatus;
  authorProfileId: string;
  dailyCandidateCap: number;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  /** Code guardado, con el mismo formato que exige la base. Null: hunter predeterminado. */
  hunterCode: string | null;
};

export function isMissingHunterCodeColumn(error: { message?: string } | null | undefined): boolean {
  return Boolean(error) && /hunter_code/i.test(error?.message ?? '');
}

/** Mismo formato que el CHECK `machine_clients_hunter_code_format`. */
const HUNTER_CODE_RE = /^[a-z][a-z0-9-]{1,32}$/;

export function parseHunterCodeText(value: unknown): string | null {
  return typeof value === 'string' && HUNTER_CODE_RE.test(value) ? value : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSAFE_NAME_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF<>]/;
const MAX_EXPIRY_MS = 366 * 24 * 60 * 60 * 1000;

export function toPublicMachineClient(row: Record<string, unknown>): MachineClientPublic {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    tokenPrefix: `avk_${String(row.token_prefix ?? '')}`,
    scopes: Array.isArray(row.scopes) ? row.scopes.filter(isMcpScope) : [],
    status: (row.status as MachineClientStatus) ?? 'paused',
    authorProfileId: String(row.author_profile_id ?? ''),
    dailyCandidateCap: Number(row.daily_candidate_cap ?? MCP_DEFAULT_DAILY_CANDIDATE_CAP),
    expiresAt: (row.expires_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    revokedAt: (row.revoked_at as string | null) ?? null,
    hunterCode: parseHunterCodeText(row.hunter_code),
  };
}

export type MachineClientCreateInput = {
  name: string;
  scopes: McpScope[];
  authorProfileId: string;
  dailyCandidateCap: number;
  expiresAt: string | null;
  hunterCode: string | null;
};

/** Codes que el Owner puede asignar. Los define quien llama; vacío no admite ninguno. */
export type HunterCodePolicy = { allowedHunterCodes?: readonly string[] };

function parseName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.normalize('NFC').trim() : '';
  return !name || name.length > 80 || UNSAFE_NAME_RE.test(name) ? null : name;
}

function parseCap(value: unknown): number | null {
  const cap = Number(value);
  return Number.isInteger(cap) && cap >= 1 && cap <= MCP_MAX_DAILY_CANDIDATE_CAP ? cap : null;
}

function parseExpiry(value: unknown, now: Date): string | null | undefined {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(t) || t <= now.getTime() || t > now.getTime() + MAX_EXPIRY_MS) return undefined;
  return new Date(t).toISOString();
}

function parseHunterCode(value: unknown, allowed: readonly string[]): string | null | undefined {
  if (value === null || value === '') return null;
  const code = parseHunterCodeText(value);
  return code && allowed.includes(code) ? code : undefined;
}

const NAME_ERROR = 'Nombre obligatorio, texto plano, máximo 80 caracteres';
const CAP_ERROR = `Cuota diaria entre 1 y ${MCP_MAX_DAILY_CANDIDATE_CAP}`;
const EXPIRY_ERROR = 'Vencimiento debe ser una fecha futura, máximo un año';
const HUNTER_ERROR = 'Hunter no permitido';

export function parseMachineClientCreate(
  body: unknown,
  now: Date = new Date(),
  policy: HunterCodePolicy = {},
): { ok: true; value: MachineClientCreateInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;

  const name = parseName(b.name);
  if (!name) return { ok: false, error: NAME_ERROR };

  if (!Array.isArray(b.scopes) || b.scopes.length === 0) return { ok: false, error: 'Elige al menos un scope' };
  if (!b.scopes.every(isMcpScope)) {
    return { ok: false, error: 'Scope no permitido. Sólo candidates:submit, candidates:read y catalog:read' };
  }
  const scopes = [...new Set(b.scopes as McpScope[])];

  const authorProfileId = typeof b.authorProfileId === 'string' ? b.authorProfileId.trim() : '';
  if (!UUID_RE.test(authorProfileId)) return { ok: false, error: 'authorProfileId debe ser un uuid' };

  let dailyCandidateCap = MCP_DEFAULT_DAILY_CANDIDATE_CAP;
  if (b.dailyCandidateCap !== undefined && b.dailyCandidateCap !== null) {
    const cap = parseCap(b.dailyCandidateCap);
    if (cap == null) return { ok: false, error: CAP_ERROR };
    dailyCandidateCap = cap;
  }

  let expiresAt: string | null = null;
  if (b.expiresAt !== undefined && b.expiresAt !== null && b.expiresAt !== '') {
    const parsed = parseExpiry(b.expiresAt, now);
    if (!parsed) return { ok: false, error: EXPIRY_ERROR };
    expiresAt = parsed;
  }

  let hunterCode: string | null = null;
  if (b.hunterCode !== undefined) {
    const parsed = parseHunterCode(b.hunterCode, policy.allowedHunterCodes ?? []);
    if (parsed === undefined) return { ok: false, error: HUNTER_ERROR };
    hunterCode = parsed;
  }

  return { ok: true, value: { name, scopes, authorProfileId, dailyCandidateCap, expiresAt, hunterCode } };
}

/** Columnas editables. Scopes, autor y token no se editan: se crea un cliente nuevo. */
export type MachineClientEditPatch = {
  name?: string;
  hunter_code?: string | null;
  daily_candidate_cap?: number;
  expires_at?: string | null;
};

export function parseMachineClientEdit(
  body: unknown,
  now: Date = new Date(),
  policy: HunterCodePolicy = {},
): { ok: true; patch: MachineClientEditPatch } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;
  const patch: MachineClientEditPatch = {};

  if (b.name !== undefined) {
    const name = parseName(b.name);
    if (!name) return { ok: false, error: NAME_ERROR };
    patch.name = name;
  }
  if (b.hunterCode !== undefined) {
    const code = parseHunterCode(b.hunterCode, policy.allowedHunterCodes ?? []);
    if (code === undefined) return { ok: false, error: HUNTER_ERROR };
    patch.hunter_code = code;
  }
  if (b.dailyCandidateCap !== undefined) {
    const cap = parseCap(b.dailyCandidateCap);
    if (cap == null) return { ok: false, error: CAP_ERROR };
    patch.daily_candidate_cap = cap;
  }
  if (b.expiresAt !== undefined) {
    if (b.expiresAt === null || b.expiresAt === '') {
      patch.expires_at = null;
    } else {
      const expiry = parseExpiry(b.expiresAt, now);
      if (!expiry) return { ok: false, error: EXPIRY_ERROR };
      patch.expires_at = expiry;
    }
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nada que editar' };
  return { ok: true, patch };
}

/**
 * El autor de un cliente MCP debe ser un perfil bot inequívoco:
 * declarado en MCP_BOT_AUTHOR_USER_IDS (isBotUserId), con perfil, sin rol de staff y distinto del Owner.
 * No puede ser un Aventa Hunter editorial ni un humano.
 */
export async function validateMachineAuthor(
  supabase: SupabaseClient,
  authorProfileId: string,
  ownerUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (authorProfileId === ownerUserId) return { ok: false, error: 'El autor no puede ser el Owner' };
  if (!configuredBotUserIds().includes(authorProfileId)) {
    return { ok: false, error: 'El autor debe estar declarado en MCP_BOT_AUTHOR_USER_IDS' };
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', authorProfileId)
    .maybeSingle();
  if (profileError) return { ok: false, error: 'No se pudo validar el perfil del autor' };
  if (!profile) return { ok: false, error: 'El perfil del autor no existe' };
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', authorProfileId)
    .limit(1);
  if (rolesError) return { ok: false, error: 'No se pudo validar el rol del autor' };
  if (Array.isArray(roles) && roles.length > 0) return { ok: false, error: 'El autor no puede tener rol de staff' };
  return { ok: true };
}

/** Perfiles bot que pueden ser autor, con su nombre visible. Si falla la lectura, sólo los ids. */
export async function loadMachineAuthorOptions(
  supabase: Pick<SupabaseClient, 'from'>,
): Promise<Array<{ id: string; displayName: string | null }>> {
  const ids = [...new Set(configuredBotUserIds())];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', ids);
  const names = new Map<string, string | null>();
  if (!error) {
    for (const row of (data ?? []) as { id: string; display_name: string | null }[]) {
      names.set(row.id, row.display_name?.trim() || null);
    }
  }
  return ids.map((id) => ({ id, displayName: names.get(id) ?? null }));
}

export type MachineClientAction = 'pause' | 'resume' | 'revoke';

export function parseMachineClientAction(body: unknown): MachineClientAction | null {
  const action = body && typeof body === 'object' ? (body as { action?: unknown }).action : null;
  return action === 'pause' || action === 'resume' || action === 'revoke' ? action : null;
}

/** Transición permitida. Revocado es terminal. */
export function nextMachineClientStatus(
  current: MachineClientStatus,
  action: MachineClientAction,
): MachineClientStatus | null {
  if (current === 'revoked') return null;
  if (action === 'revoke') return 'revoked';
  if (action === 'pause') return current === 'active' ? 'paused' : null;
  return current === 'paused' ? 'active' : null;
}

export function isMissingMachineClientsTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /machine_clients/i.test(error.message ?? '') && /does not exist|could not find/i.test(error.message ?? '');
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
