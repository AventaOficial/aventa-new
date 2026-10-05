import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMachineToken } from '@/lib/mcp/tokens';
import { createMemoryDb, mcpUniqueIndexes, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';

/**
 * Grok intenta cruzar fronteras a través del endpoint MCP real.
 * Cada intento debe fallar sin efectos fuera de offer_batches / offer_batch_items / machine_client_calls.
 */

const state: { db: MemoryDb } = { db: createMemoryDb() };

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => memorySupabase(state.db),
}));
vi.mock('@/lib/server/rateLimit', () => ({
  enforceRateLimitCustom: vi.fn(async () => ({ success: true })),
}));

const { POST } = await import('@/app/api/mcp/route');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const BOT_AUTHOR = '0b0b0b0b-0000-4000-8000-000000000001';
const HUMAN = 'aaaaaaaa-0000-4000-8000-00000000beef';

function clientRow(id: string, token: { prefix: string; hash: string }, over: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Grok',
    token_prefix: token.prefix,
    token_hash: token.hash,
    scopes: ['candidates:submit', 'candidates:read', 'catalog:read'],
    status: 'active',
    author_profile_id: BOT_AUTHOR,
    daily_candidate_cap: 200,
    expires_at: null,
    revoked_at: null,
    created_by: HUMAN,
    ...over,
  };
}

let mine: ReturnType<typeof generateMachineToken>;
let other: ReturnType<typeof generateMachineToken>;

let rpcId = 0;
async function send(body: unknown, headers: Record<string, string>) {
  rpcId += 1;
  const res = await POST(
    new Request('https://aventa.test/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcId, ...(body as object) }),
    }),
  );
  return res;
}

async function call(name: string, args: unknown = {}, token = mine.token) {
  const res = await send({ method: 'tools/call', params: { name, arguments: args } }, { Authorization: `Bearer ${token}` });
  const json = (await res.json()) as { result?: { isError?: boolean; content: Array<{ text: string }> } };
  const text = json.result?.content[0]?.text ?? null;
  let payload: ReturnType<typeof JSON.parse> = text;
  try {
    payload = text == null ? null : JSON.parse(text);
  } catch {
    payload = text;
  }
  return { res, json, payload, raw: JSON.stringify(json) };
}

const candidate = {
  url: 'https://www.amazon.com.mx/dp/B0TESTAAAA',
  title: 'Audífonos',
  price: 499,
  currency: 'MXN',
  observedAt: new Date(Date.now() - 60_000).toISOString(),
};

const snapshot = (tables: string[]) => JSON.stringify(tables.map((t) => state.db.tables[t] ?? []));
const PROTECTED = ['offers', 'profiles', 'user_roles', 'machine_clients', 'offer_drafts', 'commission_ledger', 'rewards', 'fiscal_profiles'];

const prevEnv = { ...process.env };
beforeEach(() => {
  mine = generateMachineToken();
  other = generateMachineToken();
  state.db = createMemoryDb({ unique: mcpUniqueIndexes() });
  state.db.tables.machine_clients = [clientRow(CLIENT_ID, mine), clientRow(OTHER_CLIENT_ID, other, { name: 'Otro' })];
  state.db.tables.offers = [
    { id: 'pending-offer', status: 'pending', offer_url: candidate.url, ingestion_identity_key: 'amz:B0TESTAAAA', deleted_at: null, bot_meta: null, expires_at: null, created_by: HUMAN },
  ];
  state.db.tables.profiles = [{ id: HUMAN, display_name: 'Humano', reputation_score: 10 }];
  state.db.tables.user_roles = [{ user_id: HUMAN, role: 'owner' }];
  state.db.tables.offer_drafts = [{ id: 'draft-1', user_id: HUMAN, title: 'borrador' }];
  process.env.MCP_INGEST_ENABLED = 'true';
  process.env.CRON_SECRET = 'cron-secret-value-123456';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-value-123456';
});
afterEach(() => {
  process.env = { ...prevEnv };
  vi.restoreAllMocks();
});

describe('adversarial MCP: herramientas privilegiadas no existen', () => {
  it.each([
    'create_offer',
    'publish_offer',
    'moderate_offer',
    'approve_batch_item',
    'run_cron',
    'read_drafts',
    'list_users',
    'list_machine_clients',
    'update_machine_client',
    'set_scopes',
    'rotate_token',
    'delete_machine_client',
    'economy_balance',
    'rewards_unlock',
    'fiscal_profile',
    'write_machine_client_calls',
  ])('%s => error sin efectos', async (name) => {
    const before = snapshot([...PROTECTED, 'offer_batches', 'offer_batch_items', 'machine_client_calls']);
    const { json } = await call(name, { id: OTHER_CLIENT_ID, scopes: ['moderate'], status: 'published' });
    expect(json.result?.isError).toBe(true);
    expect(snapshot([...PROTECTED, 'offer_batches', 'offer_batch_items', 'machine_client_calls'])).toBe(before);
  });
});

describe('adversarial MCP: secretos ajenos no autentican', () => {
  it.each([
    ['CRON_SECRET como Bearer', { Authorization: 'Bearer cron-secret-value-123456' }],
    ['CRON_SECRET en x-cron-secret', { 'x-cron-secret': 'cron-secret-value-123456' }],
    ['service role como Bearer', { Authorization: 'Bearer service-role-key-value-123456' }],
    ['service role en apikey', { apikey: 'service-role-key-value-123456' }],
  ])('%s => 401', async (_label, headers) => {
    const res = await send({ method: 'tools/list' }, headers as Record<string, string>);
    expect(res.status).toBe(401);
  });

  it('prefijo de otro cliente con secreto propio => 401', async () => {
    const forged = `avk_${other.prefix}_${mine.token.split('_').slice(2).join('_')}`;
    const res = await send({ method: 'tools/list' }, { Authorization: `Bearer ${forged}` });
    expect(res.status).toBe(401);
  });
});

describe('adversarial MCP: el envío no controla autoría, origen ni estado', () => {
  it('campos inyectados se ignoran; autor = bot del cliente autenticado, ítem en INGESTED, sin ofertas', async () => {
    const before = snapshot(PROTECTED);
    const { payload } = await call('submit_deal_candidates', {
      idempotencyKey: 'adv-inject-0001',
      authorProfileId: HUMAN,
      machine_client_id: OTHER_CLIENT_ID,
      created_by: HUMAN,
      scopes: ['moderate', 'publish'],
      status: 'published',
      candidates: [{ ...candidate, status: 'published', created_by: HUMAN, offer_id: 'pending-offer', author_profile_id: HUMAN }],
    });
    expect(payload.accepted).toEqual([{ index: 0 }]);
    expect(snapshot(PROTECTED)).toBe(before);

    const [batch] = state.db.tables.offer_batches;
    expect(batch.created_by).toBe(BOT_AUTHOR);
    expect(batch.machine_client_id).toBe(CLIENT_ID);
    const items = state.db.tables.offer_batch_items;
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('INGESTED');
    expect(items[0].offer_id ?? null).toBeNull();
  });
});

describe('adversarial MCP: lecturas acotadas', () => {
  it('get_submission_status no lee lotes humanos ni de otro cliente', async () => {
    state.db.tables.offer_batches = [
      { id: '33333333-3333-4333-8333-333333333333', machine_client_id: null, created_by: HUMAN, meta: {}, created_at: new Date().toISOString() },
      { id: '44444444-4444-4444-8444-444444444444', machine_client_id: OTHER_CLIENT_ID, created_by: BOT_AUTHOR, meta: {}, created_at: new Date().toISOString() },
    ];
    for (const submissionId of ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 'draft-1']) {
      const { payload } = await call('get_submission_status', { submissionId });
      expect(payload.error.code).toBe('NOT_FOUND');
    }
  });

  it('check_offer_exists no revela ofertas pending ni datos internos', async () => {
    const { payload, raw } = await call('check_offer_exists', { url: candidate.url });
    expect(payload).toEqual({ exists: false });
    expect(raw).not.toContain('pending-offer');
    expect(raw).not.toContain(HUMAN);
  });

  it('ninguna respuesta expone token_hash, autor, otros clientes, usuarios ni CRON_SECRET', async () => {
    const outputs = [
      (await call('get_submission_rules')).raw,
      (await call('submit_deal_candidates', { idempotencyKey: 'adv-leak-0001', candidates: [candidate] })).raw,
      (await call('check_offer_exists', { url: candidate.url })).raw,
    ].join('\n');
    for (const secret of [mine.hash, other.hash, other.prefix, OTHER_CLIENT_ID, BOT_AUTHOR, HUMAN, 'cron-secret-value-123456', 'service-role-key-value-123456', 'token_hash', 'author_profile_id']) {
      expect(outputs).not.toContain(secret);
    }
  });
});
