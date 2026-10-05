import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb, mcpUniqueIndexes, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';

const owner = vi.hoisted(() => ({
  result: { user: { id: 'owner-0000-4000-8000-000000000001' }, role: 'owner' } as Record<string, unknown>,
}));
const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/lib/server/requireAdmin', () => ({
  requireOwner: vi.fn(async () => owner.result),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => memorySupabase(state.db as MemoryDb),
}));

const collection = await import('@/app/api/admin/machine-clients/route');
const single = await import('@/app/api/admin/machine-clients/[id]/route');
const { decideRateLimitBackend, CRITICAL_RATE_LIMIT_PRESETS } = await import('@/lib/server/rateLimitPolicy');
const { nextMachineClientStatus } = await import('@/lib/mcp/machineClients');

const OWNER_ID = 'owner-0000-4000-8000-000000000001';
const BOT_AUTHOR = 'b0b0b0b0-0000-4000-8000-00000000000b';
const HUMAN = 'cccccccc-0000-4000-8000-00000000000c';
const STAFF_BOT = 'dddddddd-0000-4000-8000-00000000000d';

function db(): MemoryDb {
  return createMemoryDb({
    unique: mcpUniqueIndexes(),
    tables: {
      profiles: [{ id: BOT_AUTHOR }, { id: HUMAN }, { id: STAFF_BOT }],
      user_roles: [{ user_id: STAFF_BOT, role: 'moderator' }],
      machine_clients: [],
    },
  });
}

function post(body: unknown) {
  return new Request('https://aventa.test/api/admin/machine-clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(id: string, body: unknown) {
  return single.PATCH(
    new Request(`https://aventa.test/api/admin/machine-clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const valid = {
  name: 'Grok deals MX',
  authorProfileId: BOT_AUTHOR,
  scopes: ['candidates:submit', 'candidates:read', 'catalog:read'],
};

const prevEnv = { ...process.env };
beforeEach(() => {
  state.db = db();
  owner.result = { user: { id: OWNER_ID }, role: 'owner' };
  process.env.MCP_BOT_AUTHOR_USER_IDS = `${BOT_AUTHOR},${STAFF_BOT},${OWNER_ID}`;
});
afterEach(() => {
  process.env = { ...prevEnv };
});

describe('Owner API de clientes MCP', () => {
  it('sin Owner => el error de requireOwner, sin tocar datos', async () => {
    owner.result = { error: 'Forbidden', status: 403 };
    expect((await collection.GET(new Request('https://aventa.test/x'))).status).toBe(403);
    expect((await collection.POST(post(valid))).status).toBe(403);
    expect((await patch('00000000-0000-4000-8000-000000000001', { action: 'revoke' })).status).toBe(403);
    expect((state.db as MemoryDb).tables.machine_clients).toHaveLength(0);
  });

  it('crea: devuelve el token una sola vez y guarda sólo prefijo + hash', async () => {
    const res = await collection.POST(post(valid));
    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as { token: string; client: Record<string, unknown> };
    expect(body.token).toMatch(/^avk_[0-9a-f]{12}_/);
    const row = (state.db as MemoryDb).tables.machine_clients[0];
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(body.token);
    expect(row).toMatchObject({ status: 'active', author_profile_id: BOT_AUTHOR, daily_candidate_cap: 200, created_by: OWNER_ID });
    expect(body.client).not.toHaveProperty('token_hash');
    expect(body.client).not.toHaveProperty('tokenHash');

    const list = (await (await collection.GET(new Request('https://aventa.test/x'))).json()) as { clients: unknown[] };
    const listText = JSON.stringify(list);
    expect(listText).not.toContain(body.token);
    expect(listText).not.toContain(String(row.token_hash));
    expect(listText).not.toContain('token_hash');
  });

  it.each([
    [['offers:write'], 'scope'],
    [['moderate'], 'scope'],
    [['publish'], 'scope'],
    [['rewards'], 'scope'],
    [['admin'], 'scope'],
    [['cron'], 'scope'],
    [['candidates:submit', '*'], 'scope'],
    [[], 'scope'],
  ])('rechaza scopes no permitidos: %j', async (scopes) => {
    const res = await collection.POST(post({ ...valid, scopes }));
    expect(res.status).toBe(400);
    expect((state.db as MemoryDb).tables.machine_clients).toHaveLength(0);
  });

  it('el autor debe ser bot declarado, con perfil, sin rol de staff y distinto del Owner', async () => {
    const cases = [
      { authorProfileId: HUMAN },
      { authorProfileId: STAFF_BOT },
      { authorProfileId: OWNER_ID },
      { authorProfileId: 'no-uuid' },
    ];
    for (const c of cases) {
      const res = await collection.POST(post({ ...valid, ...c }));
      expect(res.status).toBe(400);
    }
    process.env.MCP_BOT_AUTHOR_USER_IDS = 'eeeeeeee-0000-4000-8000-00000000000e';
    expect((await collection.POST(post({ ...valid, authorProfileId: 'eeeeeeee-0000-4000-8000-00000000000e' }))).status).toBe(400);
    expect((state.db as MemoryDb).tables.machine_clients).toHaveLength(0);
  });

  it('valida nombre, cuota y vencimiento', async () => {
    for (const extra of [
      { name: '' },
      { name: '<b>x</b>' },
      { dailyCandidateCap: 0 },
      { dailyCandidateCap: 5000 },
      { dailyCandidateCap: 1.5 },
      { expiresAt: '2000-01-01T00:00:00Z' },
      { expiresAt: 'mañana' },
    ]) {
      expect((await collection.POST(post({ ...valid, ...extra }))).status).toBe(400);
    }
  });

  it('pausar, reanudar y revocar; revocado es terminal', async () => {
    await collection.POST(post(valid));
    const id = String((state.db as MemoryDb).tables.machine_clients[0].id);
    expect((await patch(id, { action: 'pause' })).status).toBe(200);
    expect((state.db as MemoryDb).tables.machine_clients[0].status).toBe('paused');
    expect((await patch(id, { action: 'pause' })).status).toBe(409);
    expect((await patch(id, { action: 'resume' })).status).toBe(200);
    expect((await patch(id, { action: 'revoke' })).status).toBe(200);
    const row = (state.db as MemoryDb).tables.machine_clients[0];
    expect(row.status).toBe('revoked');
    expect(row.revoked_at).toBeTruthy();
    for (const action of ['resume', 'pause', 'revoke']) {
      expect((await patch(id, { action })).status).toBe(409);
    }
    expect((await patch(id, { action: 'delete' })).status).toBe(400);
    expect((await patch('not-a-uuid', { action: 'pause' })).status).toBe(404);
  });

  it('no existe DELETE ni recuperación de token', async () => {
    expect('DELETE' in single).toBe(false);
    expect('GET' in single).toBe(false);
    expect(nextMachineClientStatus('revoked', 'resume')).toBeNull();
  });
});

const root = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|sql)$/.test(name)) out.push(p);
  }
  return out;
}
const src = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');

describe('guardas estructurales MCP', () => {
  const sql = src('docs/supabase-migrations/20261006_machine_clients_mcp.sql');

  it('migración: RLS, grants explícitos y nada para anon/authenticated', () => {
    expect(sql).toContain('ALTER TABLE public.machine_clients ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.machine_client_calls ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('REVOKE ALL ON TABLE public.machine_clients FROM PUBLIC, anon, authenticated, service_role;');
    expect(sql).toContain('REVOKE ALL ON TABLE public.machine_client_calls FROM PUBLIC, anon, authenticated, service_role;');
    expect(sql).toContain('REVOKE ALL ON SEQUENCE public.machine_client_calls_id_seq FROM PUBLIC, anon, authenticated, service_role;');
    expect(sql).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.machine_clients TO service_role;');
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE public.machine_client_calls TO service_role;');
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*machine_client/i);
    expect(sql).not.toMatch(/\bDROP TABLE\b|^\s*TRUNCATE\b|\bDELETE FROM\b|\bDROP COLUMN\b/im);
    expect(sql).not.toMatch(/GRANT[^;]*\b(TRUNCATE|ALL)\b[^;]*machine_client/i);
    expect(sql).toContain('BEFORE TRUNCATE ON public.machine_clients');
    expect(sql).toContain('BEFORE TRUNCATE ON public.machine_client_calls');
  });

  it('migración: scopes cerrados, token sólo hash, revocado inmutable, auditoría append-only, idempotencia única', () => {
    expect(sql).toContain("scopes <@ ARRAY['candidates:submit', 'candidates:read', 'catalog:read']::text[]");
    expect(sql).toMatch(/token_hash text NOT NULL CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(sql).not.toMatch(/\btoken text\b|plaintext|token_plain/i);
    expect(sql).toContain("daily_candidate_cap integer NOT NULL DEFAULT 200");
    expect(sql).toContain('revoked clients are immutable');
    expect(sql).toContain('machine_clients rows cannot be deleted');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.machine_client_calls');
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS offer_batches_mcp_idempotency_uidx\s+ON public\.offer_batches \(machine_client_id, mcp_idempotency_key\)/);
    expect(sql).toContain('char_length(mcp_idempotency_key) BETWEEN 8 AND 128');
    const calls = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.machine_client_calls'), sql.indexOf('CREATE INDEX IF NOT EXISTS idx_machine_client_calls_client_created'));
    expect(calls).not.toMatch(/authorization|token|payload|raw|content/i);
  });

  it('no hay tablas ni writers paralelos de ofertas', () => {
    const files = walk(root).filter((f) => !relative(root, f).startsWith('tests'));
    const forbidden = /\b(mcp_offers|grok_offers|bot_offers|mcp_writer|grok_writer)\b/;
    expect(files.filter((f) => forbidden.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f))).toEqual([]);
  });

  it('lib/mcp y /api/mcp no escriben en offers ni usan CRON_SECRET', () => {
    const files = [...walk(join(root, 'lib/mcp')), join(root, 'app/api/mcp/route.ts')];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text).not.toContain('CRON_SECRET');
      expect(text).not.toMatch(/from\(['"]offers['"]\)\s*\.(insert|update|upsert|delete)/);
      expect(text).not.toContain('ingestOfferObservation');
      expect(text).not.toContain('moderate-offer');
      expect(text).not.toMatch(/\bfetch\(/);
    }
  });

  it('sólo 4 herramientas registradas', () => {
    const server = src('lib/mcp/server.ts');
    const names = [...server.matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(names.sort()).toEqual(['check_offer_exists', 'get_submission_rules', 'get_submission_status', 'submit_deal_candidates']);
    expect(server).not.toMatch(/registerResource|registerPrompt|\.resource\(|\.prompt\(/);
  });

  it('endpoint: runtime node, sin sesión, autenticación antes del cuerpo', () => {
    const route = src('app/api/mcp/route.ts');
    expect(route).toContain("export const runtime = 'nodejs'");
    expect(route).toContain('sessionIdGenerator: undefined');
    const authAt = route.indexOf('await authenticateMachineClient(');
    const bodyAt = route.indexOf('await readBodyCapped(request');
    expect(authAt).toBeGreaterThan(0);
    expect(authAt).toBeLessThan(bodyAt);
    expect(bodyAt).toBeLessThan(route.indexOf('await enforceRateLimitCustom(`mcp:'));
    expect(route).not.toMatch(/console\.[a-z]+\([^)]*(authorization|token)/i);
  });

  it('rate limit mcp: crítico, sin Upstash en producción => deny (503)', () => {
    expect(CRITICAL_RATE_LIMIT_PRESETS).toContain('mcp');
    expect(decideRateLimitBackend({ hasDistributedBackend: false, production: true, critical: true })).toBe('deny');
    const rl = src('lib/server/rateLimit.ts');
    expect(rl).toContain("mcp: [10, '1 m', 'RATE_LIMIT_MCP_PER_MIN']");
    expect(rl).toMatch(/CRITICAL_PRESETS = new Set\(\[[^\]]*'mcp'/);
  });

  it('el autor bot no se conecta con Aventa Hunters', () => {
    for (const f of walk(join(root, 'lib/mcp'))) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/editorial_hunters|product\/hunters|Ximena/);
    }
  });
});
