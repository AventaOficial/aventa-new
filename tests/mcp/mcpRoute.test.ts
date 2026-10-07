import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMachineToken } from '@/lib/mcp/tokens';
import { createMemoryDb, mcpUniqueIndexes, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';

const state: { db: MemoryDb; rate: { success: true } | { success: false; status: 429 | 503 } } = {
  db: createMemoryDb(),
  rate: { success: true },
};

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => memorySupabase(state.db),
}));
vi.mock('@/lib/server/rateLimit', () => ({
  enforceRateLimitCustom: vi.fn(async () => state.rate),
}));

const { POST, GET, DELETE } = await import('@/app/api/mcp/route');
const { enforceRateLimitCustom } = await import('@/lib/server/rateLimit');

const BOT_AUTHOR = '0b0b0b0b-0000-4000-8000-000000000001';

function seedClient(over: Record<string, unknown> = {}) {
  const t = generateMachineToken();
  state.db.tables.machine_clients = [
    ...(state.db.tables.machine_clients ?? []),
    {
      id: over.id ?? '11111111-1111-4111-8111-111111111111',
      name: 'Grok',
      token_prefix: t.prefix,
      token_hash: t.hash,
      scopes: ['candidates:submit', 'candidates:read', 'catalog:read'],
      status: 'active',
      author_profile_id: BOT_AUTHOR,
      daily_candidate_cap: 200,
      expires_at: null,
      revoked_at: null,
      ...over,
    },
  ];
  return t.token;
}

let rpcId = 0;
function rpc(method: string, params?: unknown) {
  rpcId += 1;
  return { jsonrpc: '2.0', id: rpcId, method, ...(params === undefined ? {} : { params }) };
}

function req(body: unknown, token?: string | null, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://aventa.test/api/mcp', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(token: string, name: string, args: unknown = {}) {
  const res = await POST(req(rpc('tools/call', { name, arguments: args }), token));
  const json = (await res.json()) as { result?: { isError?: boolean; content: Array<{ text: string }> }; error?: unknown };
  const text = json.result?.content[0]?.text ?? null;
  let payload: ReturnType<typeof JSON.parse> = text;
  try {
    payload = text == null ? null : JSON.parse(text);
  } catch {
    payload = text;
  }
  return { res, json, payload };
}

const candidate = {
  url: 'https://www.amazon.com.mx/dp/B0TESTAAAA',
  title: 'Audífonos',
  price: 499,
  currency: 'MXN',
  observedAt: new Date(Date.now() - 60_000).toISOString(),
};

const prevEnv = { ...process.env };
beforeEach(() => {
  state.db = createMemoryDb({ unique: mcpUniqueIndexes() });
  state.rate = { success: true };
  process.env.MCP_INGEST_ENABLED = 'true';
  vi.mocked(enforceRateLimitCustom).mockClear();
});
afterEach(() => {
  process.env = { ...prevEnv };
  vi.restoreAllMocks();
});

describe('/api/mcp autenticación', () => {
  it('sin token, token inválido, revocado o vencido => 401 antes de cualquier herramienta', async () => {
    const revoked = seedClient({ id: 'r', status: 'revoked', revoked_at: new Date().toISOString() });
    const expired = seedClient({ id: 'e', expires_at: '2020-01-01T00:00:00.000Z' });
    for (const token of [null, 'garbage', generateMachineToken().token, revoked, expired]) {
      const res = await POST(req(rpc('tools/list'), token));
      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toContain('Bearer');
    }
    expect(state.db.tables.machine_client_calls ?? []).toHaveLength(0);
  });

  it('CRON_SECRET no autentica', async () => {
    process.env.CRON_SECRET = 'cron-secret-value-123';
    const res = await POST(req(rpc('tools/list'), 'cron-secret-value-123'));
    expect(res.status).toBe(401);
  });

  it('el 401 se responde antes de leer el cuerpo (payload gigante sin token)', async () => {
    const res = await POST(req('x'.repeat(200_000), null));
    expect(res.status).toBe(401);
  });

  it('GET y DELETE => 405', async () => {
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });
});

describe('/api/mcp transporte', () => {
  it('JSON malformado => 400 parse error', async () => {
    const res = await POST(req('{"jsonrpc":', seedClient()));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32700);
  });

  it('payload > 64KB => 413', async () => {
    const res = await POST(req({ ...rpc('tools/call'), pad: 'x'.repeat(70_000) }, seedClient()));
    expect(res.status).toBe(413);
  });

  it('batch JSON-RPC => 400', async () => {
    const res = await POST(req([rpc('tools/list'), rpc('tools/list')], seedClient()));
    expect(res.status).toBe(400);
  });

  it('initialize funciona sin sesión (stateless)', async () => {
    const res = await POST(
      req(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'grok', version: '1' } }), seedClient()),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeNull();
    const json = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(json.result.serverInfo.name).toBe('aventa-candidates');
  });

  it('tools/list expone exactamente las 4 herramientas', async () => {
    const res = await POST(req(rpc('tools/list'), seedClient()));
    const json = (await res.json()) as { result: { tools: Array<{ name: string; inputSchema: unknown }> } };
    expect(json.result.tools.map((t) => t.name).sort()).toEqual(
      ['check_offer_exists', 'get_submission_rules', 'get_submission_status', 'submit_deal_candidates'].sort(),
    );
  });

  it('herramienta inexistente o arbitraria => error, sin efectos', async () => {
    const token = seedClient();
    for (const name of ['publish_offer', 'moderate_offer', 'admin', 'offers_write', '__proto__']) {
      const { json } = await call(token, name, {});
      expect(json.result?.isError).toBe(true);
    }
    expect(state.db.tables.offer_batches ?? []).toHaveLength(0);
    expect(state.db.tables.offers ?? []).toHaveLength(0);
  });
});

describe('/api/mcp rate limit', () => {
  it('sólo tools/call consume el bucket mcp por cliente', async () => {
    const token = seedClient();
    await POST(req(rpc('tools/list'), token));
    expect(enforceRateLimitCustom).not.toHaveBeenCalled();
    await call(token, 'get_submission_rules');
    expect(enforceRateLimitCustom).toHaveBeenCalledWith('mcp:11111111-1111-4111-8111-111111111111', 'mcp');
  });

  it('429 al exceder y 503 si el backend falla (fail closed)', async () => {
    const token = seedClient();
    state.rate = { success: false, status: 429 };
    const limited = await POST(req(rpc('tools/call', { name: 'get_submission_rules', arguments: {} }), token));
    expect(limited.status).toBe(429);
    expect(((await limited.json()) as { error: { data?: { code: string } } }).error.data?.code).toBe('RATE_LIMITED');
    state.rate = { success: false, status: 503 };
    expect((await POST(req(rpc('tools/call', { name: 'get_submission_rules', arguments: {} }), token))).status).toBe(503);
    expect(state.db.tables.machine_client_calls ?? []).toHaveLength(0);
  });
});

describe('/api/mcp herramientas', () => {
  it('submit crea un lote y audita sin secretos ni payload', async () => {
    const token = seedClient();
    const spyErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { payload } = await call(token, 'submit_deal_candidates', { idempotencyKey: 'grok-run-0001', candidates: [candidate] });
    expect(payload.accepted).toEqual([{ index: 0 }]);
    expect(state.db.tables.offer_batches).toHaveLength(1);
    const audit = state.db.tables.machine_client_calls;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tool: 'submit_deal_candidates', result_status: 'ok', accepted_count: 1 });
    const auditText = JSON.stringify(audit);
    expect(auditText).not.toContain(token);
    expect(auditText).not.toContain('Bearer');
    expect(auditText).not.toContain('amazon');
    expect(auditText).not.toContain('Audífonos');
    const logs = JSON.stringify([...spyErr.mock.calls, ...spyLog.mock.calls]);
    expect(logs).not.toContain(token);
  });

  it('un candidato malformado no tumba la llamada', async () => {
    const token = seedClient();
    const { json, payload } = await call(token, 'submit_deal_candidates', {
      idempotencyKey: 'grok-run-0002',
      candidates: [candidate, { url: 42 }, 'texto', { ...candidate, url: 'https://evil.example/x' }],
    });
    expect(json.result?.isError).toBeFalsy();
    expect(payload.accepted).toEqual([{ index: 0 }]);
    expect(payload.rejected).toEqual([
      { index: 1, code: 'INVALID_URL' },
      { index: 2, code: 'INVALID_CANDIDATE' },
      { index: 3, code: 'UNSUPPORTED_HOST' },
    ]);
  });

  it('demasiados candidatos => TOO_MANY_CANDIDATES', async () => {
    const { payload } = await call(seedClient(), 'submit_deal_candidates', {
      idempotencyKey: 'grok-run-0003',
      candidates: Array.from({ length: 21 }, () => candidate),
    });
    expect(payload.error.code).toBe('TOO_MANY_CANDIDATES');
  });

  it('scope faltante => FORBIDDEN_SCOPE (y auditado)', async () => {
    const token = seedClient({ scopes: ['catalog:read'] });
    const { json, payload } = await call(token, 'submit_deal_candidates', { idempotencyKey: 'grok-run-0004', candidates: [candidate] });
    expect(json.result?.isError).toBe(true);
    expect(payload.error.code).toBe('FORBIDDEN_SCOPE');
    expect((await call(token, 'get_submission_status', { submissionId: 'x' })).payload.error.code).toBe('FORBIDDEN_SCOPE');
    expect((await call(token, 'check_offer_exists', { url: candidate.url })).payload).toEqual({ exists: false });
    expect(state.db.tables.offer_batches ?? []).toHaveLength(0);
    expect(state.db.tables.machine_client_calls.map((c) => c.result_status)).toEqual(['FORBIDDEN_SCOPE', 'FORBIDDEN_SCOPE', 'ok']);
  });

  it('kill switch apagado: escribir => INGEST_PAUSED; leer sigue disponible', async () => {
    delete process.env.MCP_INGEST_ENABLED;
    const token = seedClient();
    const write = await call(token, 'submit_deal_candidates', { idempotencyKey: 'grok-run-0005', candidates: [candidate] });
    expect(write.payload.error.code).toBe('INGEST_PAUSED');
    const rules = await call(token, 'get_submission_rules');
    expect(rules.json.result?.isError).toBeFalsy();
    expect(rules.payload.ingestEnabled).toBe(false);
    expect((await call(token, 'check_offer_exists', { url: candidate.url })).payload).toEqual({ exists: false });
    expect(state.db.tables.offer_batches ?? []).toHaveLength(0);
  });

  it('cliente pausado: lee, no escribe', async () => {
    const token = seedClient({ status: 'paused' });
    expect((await call(token, 'submit_deal_candidates', { idempotencyKey: 'grok-run-0006', candidates: [candidate] })).payload.error.code).toBe(
      'CLIENT_PAUSED',
    );
    expect((await call(token, 'get_submission_rules')).json.result?.isError).toBeFalsy();
  });

  it('aislamiento: un cliente no ve envíos de otro', async () => {
    const a = seedClient({ id: '11111111-1111-4111-8111-111111111111' });
    const b = seedClient({ id: '22222222-2222-4222-8222-222222222222' });
    const { payload } = await call(a, 'submit_deal_candidates', { idempotencyKey: 'grok-run-0007', candidates: [candidate] });
    const mine = await call(a, 'get_submission_status', { submissionId: payload.submissionId });
    expect(mine.payload.candidates).toEqual([{ index: 0, state: 'accepted' }]);
    const theirs = await call(b, 'get_submission_status', { submissionId: payload.submissionId });
    expect(theirs.payload.error.code).toBe('NOT_FOUND');
  });

  it('argumentos con tipos inválidos en campos de control => error de validación sin efectos', async () => {
    const { json } = await call(seedClient(), 'submit_deal_candidates', { idempotencyKey: 12345678, candidates: [candidate] });
    expect(json.result?.isError).toBe(true);
    expect(state.db.tables.offer_batches ?? []).toHaveLength(0);
  });
});
