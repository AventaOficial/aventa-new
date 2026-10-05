import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateProductionProvisionGuard,
  isAllowedProductionEnvFile,
  maskedBotEmail,
  PRODUCTION_BOT_EMAIL,
  PRODUCTION_BOT_USERNAME,
  provisionProductionBotAuthor,
  type AuthUserLite,
  type BotProvisionDeps,
  type CreateBotUserInput,
  type ProfileLite,
} from '@/lib/mcp/botAuthorProvisioning';

const PROD_REF = 'mkgsrpsuvedwwlzmzmzh';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const STAGING_URL = 'https://oojshofrpbfwsiypcecr.supabase.co';
const BOT_ID = '0b0b0b0b-0000-4000-8000-0000000000aa';
const HUMAN_ID = '1a1a1a1a-0000-4000-8000-000000000001';

function jwt(claims: Record<string, unknown>): string {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.firma-secreta`;
}
const SERVICE_KEY = jwt({ ref: PROD_REF, role: 'service_role' });

function prodEnv(over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    AVENTA_TARGET: 'production',
    AVENTA_EXPECTED_SUPABASE_REF: PROD_REF,
    NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
    AVENTA_SUPABASE_TARGET: 'production',
    VERCEL_ENV: 'production',
    AVENTA_REDIS_ENVIRONMENT: 'production',
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    BOT_INGEST_USER_ID_TECH: '2b2b2b2b-0000-4000-8000-000000000002',
    ...over,
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return env as NodeJS.ProcessEnv;
}

function inertProfile(id: string, over: Partial<ProfileLite> = {}): ProfileLite {
  return {
    id,
    username: PRODUCTION_BOT_USERNAME,
    is_trusted: false,
    owner_auto_approve_offers: false,
    commissions_accepted_at: null,
    reward_program_unlocked_at: null,
    rewards_terms_accepted_at: null,
    reputation_score: 0,
    achievement_xp: 0,
    ...over,
  };
}

function botUser(over: Partial<AuthUserLite> = {}): AuthUserLite {
  return {
    id: BOT_ID,
    email: PRODUCTION_BOT_EMAIL,
    app_metadata: { aventa_machine_author: true, mcp_bot_author: true, role_hint: 'mcp_supply', provider: 'email' },
    last_sign_in_at: null,
    identities: [{ provider: 'email' }],
    ...over,
  };
}

/** Supabase falso: registra cada llamada; createUser crea el perfil como handle_new_user (username null). */
function fakeDeps(state: {
  users?: AuthUserLite[];
  profiles?: ProfileLite[];
  roles?: Record<string, number>;
  newId?: string;
  createdProfileOver?: Partial<ProfileLite>;
}) {
  const users = [...(state.users ?? [])];
  const profiles = new Map((state.profiles ?? []).map((p) => [p.id, { ...p }]));
  const calls: string[] = [];
  const created: CreateBotUserInput[] = [];
  const deps: BotProvisionDeps = {
    async listUsersPage(page, perPage) {
      calls.push(`listUsers:${page}`);
      return users.slice((page - 1) * perPage, page * perPage);
    },
    async createUser(input) {
      calls.push('createUser');
      created.push(input);
      const id = state.newId ?? BOT_ID;
      users.push({ id, email: input.email, app_metadata: input.app_metadata, identities: [{ provider: 'email' }] });
      profiles.set(id, inertProfile(id, { username: null, ...state.createdProfileOver }));
      return id;
    },
    async probeProfileSchema() {
      calls.push('probeSchema');
      return true;
    },
    async findProfileIdsByUsername(username) {
      calls.push('findUsername');
      return [...profiles.values()].filter((p) => p.username === username).map((p) => p.id);
    },
    async getProfile(id) {
      calls.push('getProfile');
      return profiles.get(id) ?? null;
    },
    async insertProfile(row) {
      calls.push('insertProfile');
      profiles.set(row.id, inertProfile(row.id, { username: row.username }));
      return true;
    },
    async setProfileUsername(id, username) {
      calls.push('setUsername');
      const p = profiles.get(id);
      if (p) p.username = username;
      return true;
    },
    async countUserRoles(id) {
      calls.push('countRoles');
      return state.roles?.[id] ?? 0;
    },
    sleep: async () => undefined,
  };
  const writes = () => calls.filter((c) => ['createUser', 'insertProfile', 'setUsername'].includes(c));
  return { deps, calls, created, writes, profiles };
}

describe('guarda de production', () => {
  it('production completo => aceptado', () => {
    expect(evaluateProductionProvisionGuard(prodEnv())).toEqual({ ok: true, ref: PROD_REF });
  });

  it('acepta una secret key nueva (sb_secret_)', () => {
    expect(evaluateProductionProvisionGuard(prodEnv({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abcdefghijklmnop' })).ok).toBe(true);
  });

  it.each([
    ['AVENTA_TARGET=staging', { AVENTA_TARGET: 'staging' }],
    ['AVENTA_TARGET ausente', { AVENTA_TARGET: undefined }],
    ['AVENTA_SUPABASE_TARGET=staging', { AVENTA_SUPABASE_TARGET: 'staging' }],
    ['VERCEL_ENV=preview', { VERCEL_ENV: 'preview' }],
    ['AVENTA_DEPLOYMENT_SURFACE=staging', { AVENTA_DEPLOYMENT_SURFACE: 'staging' }],
    ['AVENTA_REDIS_ENVIRONMENT=staging', { AVENTA_REDIS_ENVIRONMENT: 'staging' }],
  ])('staging rechazado: %s', (_label, over) => {
    expect(evaluateProductionProvisionGuard(prodEnv(over)).ok).toBe(false);
  });

  it.each([
    ['ref de staging', { AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr' }],
    ['ref ausente', { AVENTA_EXPECTED_SUPABASE_REF: undefined }],
    ['ref de otro proyecto', { AVENTA_EXPECTED_SUPABASE_REF: 'otroproyecto' }],
  ])('Supabase ref incorrecto rechazado: %s', (_label, over) => {
    expect(evaluateProductionProvisionGuard(prodEnv(over)).ok).toBe(false);
  });

  it.each([
    ['URL de staging', { NEXT_PUBLIC_SUPABASE_URL: STAGING_URL }],
    ['URL de otro proyecto', { NEXT_PUBLIC_SUPABASE_URL: 'https://otroproyecto.supabase.co' }],
    ['URL ausente', { NEXT_PUBLIC_SUPABASE_URL: undefined }],
    ['URL http', { NEXT_PUBLIC_SUPABASE_URL: `http://${PROD_REF}.supabase.co` }],
  ])('URL de Supabase incorrecta rechazada: %s', (_label, over) => {
    expect(evaluateProductionProvisionGuard(prodEnv(over)).ok).toBe(false);
  });

  it.each([
    ['ausente', undefined],
    ['placeholder de Vercel', '[SENSITIVE]'],
    ['vacía', ''],
    ['key de staging', jwt({ ref: 'oojshofrpbfwsiypcecr', role: 'service_role' })],
    ['anon key de production', jwt({ ref: PROD_REF, role: 'anon' })],
    ['publishable key', 'sb_publishable_abcdefghijk'],
    ['formato desconocido', 'no-es-una-key'],
  ])('service role %s => rechazada', (_label, value) => {
    expect(evaluateProductionProvisionGuard(prodEnv({ SUPABASE_SERVICE_ROLE_KEY: value })).ok).toBe(false);
  });

  it('los motivos nunca contienen la key ni la URL', () => {
    const r = evaluateProductionProvisionGuard(prodEnv({ AVENTA_TARGET: 'staging', SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: 'x', role: 'anon' }) }));
    const text = JSON.stringify(r);
    expect(text).not.toContain('firma-secreta');
    expect(text).not.toContain('eyJ');
  });

  it('sólo acepta archivos de entorno de production', () => {
    expect(isAllowedProductionEnvFile('.env.production.local')).toBe(true);
    expect(isAllowedProductionEnvFile('C:/secure/prod.env')).toBe(true);
    for (const bad of ['.env.local', '.env.staging.local', '.env', 'x/.env.preview.local', '.env.development.local', '']) {
      expect(isAllowedProductionEnvFile(bad)).toBe(false);
    }
  });
});

describe('aprovisionamiento: ensayo y creación', () => {
  it('ensayo (sin --apply): sólo lecturas, ninguna escritura', async () => {
    const f = fakeDeps({ users: [{ id: HUMAN_ID, email: 'persona@example.com' }] });
    const r = await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: false });
    expect(r).toMatchObject({ ok: true, mode: 'dry_run', plan: 'create', created: false, authorProfileId: null });
    expect(f.writes()).toEqual([]);
  });

  it('--apply crea el usuario sin password, con metadata de bot MCP y username dedicado', async () => {
    const f = fakeDeps({});
    const r = await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true });
    expect(r).toMatchObject({
      ok: true,
      created: true,
      authorProfileId: BOT_ID,
      checks: { password: 'none', userRoles: 0, economicallyInert: true, machineClients: 'not_created' },
    });
    expect(f.created).toHaveLength(1);
    const input = f.created[0];
    expect(input).not.toHaveProperty('password');
    expect(JSON.stringify(input)).not.toMatch(/password/i);
    expect(input).toMatchObject({
      email: PRODUCTION_BOT_EMAIL,
      email_confirm: true,
      app_metadata: { aventa_machine_author: true, mcp_bot_author: true },
    });
    expect(f.profiles.get(BOT_ID)?.username).toBe(PRODUCTION_BOT_USERNAME);
    expect(f.writes()).toEqual(['createUser', 'setUsername']);
  });

  it('recorre todas las páginas de Auth antes de crear (no duplica un bot existente en la página 2)', async () => {
    const humans = Array.from({ length: 1000 }, (_, i) => ({ id: `h-${i}`, email: `p${i}@example.com` }));
    const f = fakeDeps({ users: [...humans, botUser()], profiles: [inertProfile(BOT_ID)] });
    const r = await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true });
    expect(r).toMatchObject({ ok: true, created: false, plan: 'already_provisioned', authorProfileId: BOT_ID });
    expect(f.calls).toContain('listUsers:2');
    expect(f.writes()).toEqual([]);
  });

  it('bot ya aprovisionado y válido => idempotente, sin escrituras', async () => {
    const f = fakeDeps({ users: [botUser()], profiles: [inertProfile(BOT_ID)] });
    const r = await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true });
    expect(r).toMatchObject({ ok: true, created: false, authorProfileId: BOT_ID });
    expect(f.writes()).toEqual([]);
  });

  it('guarda fallida => ninguna llamada a Supabase', async () => {
    const f = fakeDeps({});
    const r = await provisionProductionBotAuthor(prodEnv({ AVENTA_TARGET: 'staging' }), f.deps, { apply: true });
    expect(r).toMatchObject({ ok: false, stage: 'guard' });
    expect(f.calls).toEqual([]);
  });
});

describe('aprovisionamiento: reutilización y discrepancias abortan sin escribir', () => {
  it.each([
    ['usuario humano con el email del bot (sin metadata)', botUser({ app_metadata: {} })],
    ['sólo aventa_machine_author', botUser({ app_metadata: { aventa_machine_author: true } })],
    ['role_hint distinto', botUser({ app_metadata: { aventa_machine_author: true, mcp_bot_author: true, role_hint: 'admin' } })],
    ['cuenta que ya inició sesión', botUser({ last_sign_in_at: '2026-10-01T00:00:00Z' })],
    ['cuenta con identidad OAuth', botUser({ identities: [{ provider: 'email' }, { provider: 'google' }] })],
    ['UUID de un autor de ingesta', botUser({ id: '2b2b2b2b-0000-4000-8000-000000000002' })],
  ])('%s', async (_label, user) => {
    const f = fakeDeps({ users: [user], profiles: [inertProfile(user.id)] });
    const r = await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true });
    expect(r).toMatchObject({ ok: false, stage: 'existing_user' });
    expect(f.writes()).toEqual([]);
  });

  it('username dedicado ocupado por un humano => no crea nada', async () => {
    const f = fakeDeps({ users: [{ id: HUMAN_ID, email: 'persona@example.com' }], profiles: [inertProfile(HUMAN_ID)] });
    const r = await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true });
    expect(r).toMatchObject({ ok: false, stage: 'username' });
    expect(f.writes()).toEqual([]);
  });

  it('bot existente cuyo username es aventa_machine_supply => rechazado', async () => {
    const f = fakeDeps({ users: [botUser()], profiles: [inertProfile(BOT_ID, { username: 'aventa_machine_supply' })] });
    expect(await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true })).toMatchObject({ ok: false });
    expect(f.writes()).toEqual([]);
  });

  it('bot existente con roles => rechazado', async () => {
    const f = fakeDeps({ users: [botUser()], profiles: [inertProfile(BOT_ID)], roles: { [BOT_ID]: 1 } });
    const r = await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true });
    expect(r).toMatchObject({ ok: false, stage: 'existing_user' });
    expect(JSON.stringify(r)).toContain('user_roles');
  });

  it.each([
    ['is_trusted', { is_trusted: true }],
    ['is_trusted nulo', { is_trusted: null }],
    ['auto-aprobación de owner', { owner_auto_approve_offers: true }],
    ['comisiones aceptadas', { commissions_accepted_at: '2026-01-01' }],
    ['Rewards desbloqueado', { reward_program_unlocked_at: '2026-01-01' }],
    ['términos de Rewards', { rewards_terms_accepted_at: '2026-01-01' }],
    ['reputación', { reputation_score: 5 }],
    ['XP', { achievement_xp: 10 }],
  ] as const)('bot existente con efecto económico/privilegio (%s) => rechazado', async (_label, over) => {
    const f = fakeDeps({ users: [botUser()], profiles: [inertProfile(BOT_ID, over as Partial<ProfileLite>)] });
    expect(await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true })).toMatchObject({ ok: false, stage: 'existing_user' });
    expect(f.writes()).toEqual([]);
  });

  it('perfil recién creado con flag económico => verificación falla y avisa de no usarlo', async () => {
    const f = fakeDeps({ createdProfileOver: { reward_program_unlocked_at: '2026-01-01' } });
    const r = await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true });
    expect(r).toMatchObject({ ok: false, stage: 'verify' });
    expect(JSON.stringify(r)).toContain('NO válido');
  });

  it('createUser devuelve un UUID de ingesta => aborta', async () => {
    const f = fakeDeps({ newId: '2b2b2b2b-0000-4000-8000-000000000002' });
    expect(await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true })).toMatchObject({ ok: false, stage: 'create_user' });
  });

  it('esquema de profiles inesperado => aborta antes de cualquier escritura', async () => {
    const f = fakeDeps({});
    f.deps.probeProfileSchema = async () => false;
    expect(await provisionProductionBotAuthor(prodEnv(), f.deps, { apply: true })).toMatchObject({ ok: false, stage: 'schema' });
    expect(f.writes()).toEqual([]);
  });
});

describe('salida y estructura del script de production', () => {
  const root = join(__dirname, '..', '..');
  const script = readFileSync(join(root, 'scripts/mcp-provision-production-bot-author.ts'), 'utf8');
  const lib = readFileSync(join(root, 'lib/mcp/botAuthorProvisioning.ts'), 'utf8');

  it('el email se imprime enmascarado', () => {
    expect(maskedBotEmail()).not.toBe(PRODUCTION_BOT_EMAIL);
    expect(maskedBotEmail()).not.toContain('mcp-supply-production@aventa.internal');
  });

  it('sólo toca profiles y user_roles; user_roles sólo se lee', () => {
    const tables = [...script.matchAll(/from\('([a-z_]+)'\)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(['profiles', 'user_roles']));
    expect(script).not.toMatch(/from\('user_roles'\)\.(insert|upsert|update|delete)/);
    expect(script).not.toMatch(/\.upsert\(|\.delete\(|\.rpc\(/);
  });

  it('no machine_clients, ofertas, Rewards, comisiones, ledger ni settlement', () => {
    for (const text of [script, lib]) {
      expect(text).not.toMatch(/from\('(machine_clients|offers|offer_batches|commission[a-z_]*|reward[a-z_]*|ledger[a-z_]*|settlement[a-z_]*|payout[a-z_]*)'\)/);
    }
    expect(lib).not.toMatch(/createClient|\b(sb|supabase|client)\.from\(/);
    expect(script).not.toMatch(/reward_program_unlocked_at:|rewards_terms_accepted_at:|commissions_accepted_at:|is_trusted:|owner_auto_approve_offers:/);
  });

  it('nunca establece contraseña ni imprime la key', () => {
    expect(script).not.toMatch(/password/i);
    expect(lib).not.toMatch(/password\s*:(?!\s*'none')/i);
    expect(script).not.toMatch(/console\.(log|error)\([^)]*(SERVICE_ROLE|key\b)/);
  });

  it('no lee .env.local ni .env.staging.local y por defecto es ensayo', () => {
    expect(script).not.toMatch(/['"`]\.env\.local['"`]/);
    expect(script).not.toMatch(/['"`]\.env\.staging\.local['"`]/);
    expect(script).toContain("'.env.production.local'");
    expect(script).toContain("argv.includes('--apply')");
    expect(script).not.toMatch(/process\.env\.(SUPABASE|NEXT_PUBLIC)/);
  });
});
