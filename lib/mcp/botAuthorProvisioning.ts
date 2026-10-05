import {
  extractSupabaseProjectRef,
  isStagingSupabaseRef,
  PRODUCTION_SUPABASE_REF,
} from '@/lib/supabase/projectRefs';

/**
 * Aprovisionamiento del autor bot MCP de PRODUCTION (usuario Auth + perfil). Contrato:
 * docs/SYSTEMS/MCP_GROK_BOTS.md §15. Lógica pura con dependencias inyectadas: el script
 * scripts/mcp-provision-production-bot-author.ts sólo conecta Supabase.
 *
 * Únicas escrituras posibles (y sólo con apply): auth.admin.createUser sin contraseña y el
 * username del perfil recién creado. Nunca user_roles, machine_clients, ofertas ni economía.
 */

export const PRODUCTION_BOT_EMAIL = 'mcp-supply-production@aventa.internal';
export const PRODUCTION_BOT_USERNAME = 'aventa_mcp_supply_production';
export const PRODUCTION_BOT_DISPLAY = 'Aventa MCP Supply';
export const PRODUCTION_BOT_APP_METADATA = {
  aventa_machine_author: true,
  mcp_bot_author: true,
  role_hint: 'mcp_supply',
} as const;

/** Autores máquina que nunca pueden ser el autor MCP (ingesta S7.2). */
const FORBIDDEN_USERNAMES = new Set(['aventa_machine_supply']);
const STAGING_INGEST_AUTHOR = '778cfbf5-294e-4866-883f-71e3046566cb';
const INGEST_ENV_KEYS = ['BOT_INGEST_USER_ID', 'BOT_INGEST_USER_ID_TECH', 'BOT_INGEST_USER_ID_STAPLES'];

/** Esquema de profiles de production: sin `role` ni `trusted`; los privilegios viven en user_roles. */
export const INERT_PROFILE_COLUMNS =
  'id, username, is_trusted, owner_auto_approve_offers, commissions_accepted_at, reward_program_unlocked_at, rewards_terms_accepted_at, reputation_score, achievement_xp';

function read(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? '').trim();
}

function isPlaceholder(value: string): boolean {
  return !value || /sensitive/i.test(value) || /^<.*>$/.test(value);
}

/** Payload de una key JWT de Supabase, sin verificar firma. null si no es JWT. */
function jwtClaims(key: string): { ref?: unknown; role?: unknown } | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export type ProductionGuardResult = { ok: true; ref: string } | { ok: false; reasons: string[] };

/** Cualquier discrepancia aborta. Los motivos nunca incluyen valores. */
export function evaluateProductionProvisionGuard(env: NodeJS.ProcessEnv): ProductionGuardResult {
  const reasons: string[] = [];

  const target = read(env, 'AVENTA_TARGET').toLowerCase();
  if (target === 'staging' || target === 'stage') reasons.push('AVENTA_TARGET=staging: este script es sólo para production');
  else if (target !== 'production') reasons.push('AVENTA_TARGET debe ser production');

  const expected = read(env, 'AVENTA_EXPECTED_SUPABASE_REF').toLowerCase();
  if (expected !== PRODUCTION_SUPABASE_REF) reasons.push(`AVENTA_EXPECTED_SUPABASE_REF debe ser ${PRODUCTION_SUPABASE_REF}`);

  const url = read(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const ref = extractSupabaseProjectRef(url);
  if (isStagingSupabaseRef(ref)) reasons.push('NEXT_PUBLIC_SUPABASE_URL apunta a STAGING');
  else if (ref !== PRODUCTION_SUPABASE_REF) reasons.push('NEXT_PUBLIC_SUPABASE_URL no es el proyecto production');
  else if (!/^https:\/\//i.test(url)) reasons.push('NEXT_PUBLIC_SUPABASE_URL debe ser https');

  const supabaseTarget = read(env, 'AVENTA_SUPABASE_TARGET').toLowerCase();
  if (supabaseTarget && supabaseTarget !== 'production' && supabaseTarget !== 'prod') {
    reasons.push('AVENTA_SUPABASE_TARGET debe ser production o no existir');
  }
  if (read(env, 'AVENTA_DEPLOYMENT_SURFACE')) reasons.push('AVENTA_DEPLOYMENT_SURFACE definida: no es Aventa Production');
  const vercelEnv = read(env, 'VERCEL_ENV').toLowerCase();
  if (vercelEnv && vercelEnv !== 'production') reasons.push('VERCEL_ENV debe ser production o no existir');
  const redisEnv = read(env, 'AVENTA_REDIS_ENVIRONMENT').toLowerCase();
  if (redisEnv && redisEnv !== 'production' && !isPlaceholder(redisEnv)) reasons.push('AVENTA_REDIS_ENVIRONMENT debe ser production');

  const key = read(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!key) reasons.push('SUPABASE_SERVICE_ROLE_KEY: MISSING');
  else if (isPlaceholder(key)) reasons.push('SUPABASE_SERVICE_ROLE_KEY: placeholder ([SENSITIVE]); pegar la key real sólo en el archivo local');
  else if (key.startsWith('sb_publishable_')) reasons.push('SUPABASE_SERVICE_ROLE_KEY: INVALID (es una key pública)');
  else if (!key.startsWith('sb_secret_')) {
    const claims = jwtClaims(key);
    if (!claims) reasons.push('SUPABASE_SERVICE_ROLE_KEY: INVALID (formato no reconocido)');
    else {
      if (claims.ref !== PRODUCTION_SUPABASE_REF) reasons.push('SUPABASE_SERVICE_ROLE_KEY: INVALID (no pertenece a production)');
      if (claims.role !== 'service_role') reasons.push('SUPABASE_SERVICE_ROLE_KEY: INVALID (no es service_role)');
    }
  }

  return reasons.length === 0 && ref ? { ok: true, ref } : { ok: false, reasons };
}

/** Sólo se aceptan .env.production.local o un archivo explícito que no sea de otro entorno. */
export function isAllowedProductionEnvFile(path: string): boolean {
  const base = path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  if (!base) return false;
  if (base === '.env' || base === '.env.local' || base.includes('staging') || base.includes('preview') || base.includes('development')) {
    return false;
  }
  return true;
}

export type AuthUserLite = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  last_sign_in_at?: string | null;
  identities?: Array<{ provider?: string | null }> | null;
};

export type ProfileLite = {
  id: string;
  username: string | null;
  is_trusted: unknown;
  owner_auto_approve_offers: unknown;
  commissions_accepted_at: unknown;
  reward_program_unlocked_at: unknown;
  rewards_terms_accepted_at: unknown;
  reputation_score: unknown;
  achievement_xp: unknown;
};

export type CreateBotUserInput = {
  email: string;
  email_confirm: true;
  user_metadata: { display_name: string };
  app_metadata: typeof PRODUCTION_BOT_APP_METADATA;
};

export type BotProvisionDeps = {
  listUsersPage(page: number, perPage: number): Promise<AuthUserLite[] | null>;
  createUser(input: CreateBotUserInput): Promise<string | null>;
  /** Lee las columnas de INERT_PROFILE_COLUMNS con limit 0: falla si el esquema no las tiene. */
  probeProfileSchema(): Promise<boolean>;
  findProfileIdsByUsername(username: string): Promise<string[] | null>;
  getProfile(id: string): Promise<ProfileLite | null | 'error'>;
  insertProfile(row: { id: string; display_name: string; username: string }): Promise<boolean>;
  setProfileUsername(id: string, username: string): Promise<boolean>;
  countUserRoles(id: string): Promise<number | null>;
  sleep(ms: number): Promise<void>;
};

export type BotProvisionResult =
  | {
      ok: true;
      mode: 'dry_run' | 'apply';
      created: boolean;
      authorProfileId: string | null;
      plan: 'create' | 'already_provisioned';
      checks: {
        supabaseRef: string;
        password: 'none';
        userRoles: 0;
        economicallyInert: boolean | 'pending_creation';
        machineClients: 'not_created';
      };
    }
  | { ok: false; stage: string; reasons: string[] };

const MAX_PAGES = 200;
const PER_PAGE = 1000;

export function validateExistingBotUser(user: AuthUserLite, env: NodeJS.ProcessEnv): string[] {
  const reasons: string[] = [];
  if ((user.email ?? '').toLowerCase() !== PRODUCTION_BOT_EMAIL) reasons.push('email distinto del autor MCP');
  const meta = user.app_metadata ?? {};
  if (meta.aventa_machine_author !== true) reasons.push('app_metadata.aventa_machine_author no es true');
  if (meta.mcp_bot_author !== true) reasons.push('app_metadata.mcp_bot_author no es true');
  if (meta.role_hint !== PRODUCTION_BOT_APP_METADATA.role_hint) reasons.push('app_metadata.role_hint no es mcp_supply');
  if (user.last_sign_in_at) reasons.push('la cuenta ha iniciado sesión: no es una identidad máquina');
  if ((user.identities ?? []).some((i) => (i.provider ?? '') !== 'email')) reasons.push('tiene identidades OAuth: posible cuenta humana');
  reasons.push(...forbiddenIdReasons(user.id, env));
  return reasons;
}

function forbiddenIdReasons(id: string, env: NodeJS.ProcessEnv): string[] {
  const lower = id.toLowerCase();
  const ingest = INGEST_ENV_KEYS.map((k) => read(env, k).toLowerCase()).filter(Boolean);
  if (lower === STAGING_INGEST_AUTHOR || ingest.includes(lower)) return ['es un autor de ingesta (BOT_INGEST_USER_ID*)'];
  return [];
}

export function validateInertProfile(profile: ProfileLite, expectUsername: boolean): string[] {
  const reasons: string[] = [];
  if (profile.is_trusted !== false) reasons.push('is_trusted no es false');
  if (profile.owner_auto_approve_offers !== false) reasons.push('owner_auto_approve_offers no es false');
  if (profile.commissions_accepted_at != null) reasons.push('commissions_accepted_at definido');
  if (profile.reward_program_unlocked_at != null) reasons.push('reward_program_unlocked_at definido');
  if (profile.rewards_terms_accepted_at != null) reasons.push('rewards_terms_accepted_at definido');
  if (Number(profile.reputation_score) !== 0) reasons.push('reputation_score distinto de 0');
  if (Number(profile.achievement_xp) !== 0) reasons.push('achievement_xp distinto de 0');
  if (profile.username && FORBIDDEN_USERNAMES.has(profile.username)) reasons.push('username de un autor de ingesta');
  if (expectUsername && profile.username !== PRODUCTION_BOT_USERNAME) reasons.push('username distinto del autor MCP');
  return reasons;
}

async function findUserByEmail(deps: BotProvisionDeps): Promise<{ user: AuthUserLite | null } | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const users = await deps.listUsersPage(page, PER_PAGE);
    if (!users) return null;
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === PRODUCTION_BOT_EMAIL);
    if (hit) return { user: hit };
    if (users.length < PER_PAGE) return { user: null };
  }
  return null;
}

async function verifyProvisioned(deps: BotProvisionDeps, id: string): Promise<string[]> {
  const profile = await deps.getProfile(id);
  if (profile === 'error' || profile === null) return ['no se pudo leer el perfil'];
  const reasons = validateInertProfile(profile, true);
  const roles = await deps.countUserRoles(id);
  if (roles === null) reasons.push('no se pudo verificar user_roles');
  else if (roles > 0) reasons.push('el autor tiene user_roles');
  return reasons;
}

export async function provisionProductionBotAuthor(
  env: NodeJS.ProcessEnv,
  deps: BotProvisionDeps,
  options: { apply: boolean },
): Promise<BotProvisionResult> {
  const guard = evaluateProductionProvisionGuard(env);
  if (!guard.ok) return { ok: false, stage: 'guard', reasons: guard.reasons };
  const mode = options.apply ? 'apply' : 'dry_run';
  const checks = (inert: boolean | 'pending_creation') => ({
    supabaseRef: guard.ref,
    password: 'none' as const,
    userRoles: 0 as const,
    economicallyInert: inert,
    machineClients: 'not_created' as const,
  });

  if (!(await deps.probeProfileSchema())) {
    return { ok: false, stage: 'schema', reasons: ['profiles no tiene las columnas de verificación esperadas'] };
  }

  const lookup = await findUserByEmail(deps);
  if (!lookup) return { ok: false, stage: 'auth_lookup', reasons: ['no se pudo recorrer la lista de usuarios de Auth'] };

  const holders = await deps.findProfileIdsByUsername(PRODUCTION_BOT_USERNAME);
  if (!holders) return { ok: false, stage: 'username', reasons: ['no se pudo comprobar el username'] };

  if (lookup.user) {
    const existing = lookup.user;
    const reasons = validateExistingBotUser(existing, env);
    if (holders.some((h) => h !== existing.id)) reasons.push('el username pertenece a otro perfil');
    reasons.push(...(await verifyProvisioned(deps, existing.id)));
    if (reasons.length > 0) return { ok: false, stage: 'existing_user', reasons };
    return { ok: true, mode, created: false, authorProfileId: existing.id, plan: 'already_provisioned', checks: checks(true) };
  }

  if (holders.length > 0) return { ok: false, stage: 'username', reasons: ['el username ya pertenece a otro perfil'] };
  if (!options.apply) {
    return { ok: true, mode, created: false, authorProfileId: null, plan: 'create', checks: checks('pending_creation') };
  }

  const id = await deps.createUser({
    email: PRODUCTION_BOT_EMAIL,
    email_confirm: true,
    user_metadata: { display_name: PRODUCTION_BOT_DISPLAY },
    app_metadata: PRODUCTION_BOT_APP_METADATA,
  });
  if (!id) return { ok: false, stage: 'create_user', reasons: ['createUser falló'] };
  const forbidden = forbiddenIdReasons(id, env);
  if (forbidden.length > 0) return { ok: false, stage: 'create_user', reasons: forbidden };

  let profile: ProfileLite | null | 'error' = null;
  for (let attempt = 0; attempt < 10 && !profile; attempt++) {
    await deps.sleep(500);
    profile = await deps.getProfile(id);
    if (profile === 'error') return { ok: false, stage: 'profile', reasons: ['no se pudo leer el perfil'] };
  }
  if (!profile) {
    const inserted = await deps.insertProfile({ id, display_name: PRODUCTION_BOT_DISPLAY, username: PRODUCTION_BOT_USERNAME });
    if (!inserted) return { ok: false, stage: 'profile', reasons: ['no se pudo crear el perfil'] };
  } else if (profile.username !== PRODUCTION_BOT_USERNAME) {
    if (!(await deps.setProfileUsername(id, PRODUCTION_BOT_USERNAME))) {
      return { ok: false, stage: 'profile', reasons: ['no se pudo fijar el username'] };
    }
  }

  const reasons = await verifyProvisioned(deps, id);
  if (reasons.length > 0) return { ok: false, stage: 'verify', reasons: [`autor ${id} creado pero NO válido; no usar`, ...reasons] };
  return { ok: true, mode, created: true, authorProfileId: id, plan: 'create', checks: checks(true) };
}

/** Email enmascarado para la salida: nunca completo. */
export function maskedBotEmail(): string {
  return `${PRODUCTION_BOT_EMAIL.slice(0, 4)}…@…${PRODUCTION_BOT_EMAIL.slice(-9)}`;
}
