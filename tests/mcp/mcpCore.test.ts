import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateMachineClient, type MachineClientContext } from '@/lib/mcp/auth';
import { canonicalSubmissionHash, normalizeCandidateUrl, validateCandidates } from '@/lib/mcp/candidates';
import { checkOfferExists } from '@/lib/mcp/catalog';
import { MCP_TOOLS, mapBatchItemToCandidateState } from '@/lib/mcp/contract';
import { buildSubmissionRules } from '@/lib/mcp/rules';
import { getSubmissionStatus, submitDealCandidates } from '@/lib/mcp/submissions';
import {
  generateMachineToken,
  hashMachineToken,
  machineTokenFromAuthorization,
  machineTokenHashMatches,
  parseMachineToken,
} from '@/lib/mcp/tokens';
import { createMemoryDb, mcpUniqueIndexes, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';

const NOW = new Date('2026-10-04T18:00:00.000Z');
const OBSERVED = '2026-10-04T17:00:00.000Z';
const BOT_AUTHOR = '0b0b0b0b-0000-4000-8000-000000000001';

function client(over: Partial<MachineClientContext> = {}): MachineClientContext {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Grok',
    scopes: ['candidates:submit', 'candidates:read', 'catalog:read'],
    status: 'active',
    authorProfileId: BOT_AUTHOR,
    dailyCandidateCap: 200,
    ...over,
  };
}

function candidate(over: Record<string, unknown> = {}) {
  return {
    url: 'https://www.amazon.com.mx/dp/B0TESTAAAA',
    title: 'Audífonos inalámbricos',
    price: 499,
    originalPrice: 899,
    currency: 'MXN',
    note: 'Bajó 40% hoy',
    observedAt: OBSERVED,
    ...over,
  };
}

function freshDb(): MemoryDb {
  return createMemoryDb({ unique: mcpUniqueIndexes() });
}

const prevEnv = { ...process.env };
beforeEach(() => {
  process.env.MCP_INGEST_ENABLED = 'true';
});
afterEach(() => {
  process.env = { ...prevEnv };
  vi.restoreAllMocks();
});

describe('MCP tokens', () => {
  it('genera avk_<prefix>_<secret> y guarda sólo prefijo + sha256', () => {
    const t = generateMachineToken();
    expect(t.token).toMatch(/^avk_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/);
    expect(t.token.startsWith(`avk_${t.prefix}_`)).toBe(true);
    expect(t.hash).toBe(hashMachineToken(t.token));
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.hash).not.toContain(t.token);
  });

  it('dos tokens nunca se repiten', () => {
    const set = new Set(Array.from({ length: 50 }, () => generateMachineToken().token));
    expect(set.size).toBe(50);
  });

  it('parsea sólo el formato exacto y Bearer', () => {
    const t = generateMachineToken();
    expect(parseMachineToken(t.token)?.prefix).toBe(t.prefix);
    expect(parseMachineToken(`${t.token}x`)).toBeNull();
    expect(parseMachineToken('avk_XYZ_abc')).toBeNull();
    expect(machineTokenFromAuthorization(`Bearer ${t.token}`)?.token).toBe(t.token);
    expect(machineTokenFromAuthorization(t.token)).toBeNull();
    expect(machineTokenFromAuthorization(`Basic ${t.token}`)).toBeNull();
    expect(machineTokenFromAuthorization(`Bearer ${process.env.CRON_SECRET ?? 'cron-secret-value'}`)).toBeNull();
  });

  it('compara el hash de forma segura', () => {
    const t = generateMachineToken();
    expect(machineTokenHashMatches(t.token, t.hash)).toBe(true);
    expect(machineTokenHashMatches(generateMachineToken().token, t.hash)).toBe(false);
    expect(machineTokenHashMatches(t.token, 'not-a-hash')).toBe(false);
    expect(machineTokenHashMatches(t.token, null)).toBe(false);
  });
});

describe('MCP auth', () => {
  function seed(db: MemoryDb, over: Record<string, unknown> = {}) {
    const t = generateMachineToken();
    db.tables.machine_clients = [
      ...(db.tables.machine_clients ?? []),
      {
        id: `c-${t.prefix}`,
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
    return t;
  }

  it('sin token, token inválido o prefijo desconocido => rechazo', async () => {
    const db = freshDb();
    seed(db);
    const sb = memorySupabase(db);
    expect(await authenticateMachineClient(sb, null)).toEqual({ ok: false, reason: 'missing_token' });
    expect(await authenticateMachineClient(sb, 'Bearer nope')).toEqual({ ok: false, reason: 'invalid_token' });
    expect(await authenticateMachineClient(sb, `Bearer ${generateMachineToken().token}`)).toEqual({
      ok: false,
      reason: 'invalid_token',
    });
  });

  it('mismo prefijo con secreto distinto => inválido', async () => {
    const db = freshDb();
    const t = seed(db);
    const forged = `avk_${t.prefix}_${'A'.repeat(43)}`;
    expect(await authenticateMachineClient(memorySupabase(db), `Bearer ${forged}`)).toEqual({
      ok: false,
      reason: 'invalid_token',
    });
  });

  it('revocado y vencido => rechazo; pausado autentica con status paused', async () => {
    const db = freshDb();
    const revoked = seed(db, { status: 'revoked', revoked_at: NOW.toISOString() });
    const expired = seed(db, { expires_at: '2026-10-01T00:00:00.000Z' });
    const paused = seed(db, { status: 'paused' });
    const sb = memorySupabase(db);
    expect(await authenticateMachineClient(sb, `Bearer ${revoked.token}`, NOW)).toEqual({ ok: false, reason: 'revoked' });
    expect(await authenticateMachineClient(sb, `Bearer ${expired.token}`, NOW)).toEqual({ ok: false, reason: 'expired' });
    const p = await authenticateMachineClient(sb, `Bearer ${paused.token}`, NOW);
    expect(p.ok && p.client.status).toBe('paused');
  });

  it('descarta scopes desconocidos guardados', async () => {
    const db = freshDb();
    const t = seed(db, { scopes: ['catalog:read', 'offers:write', 'admin'] });
    const r = await authenticateMachineClient(memorySupabase(db), `Bearer ${t.token}`, NOW);
    expect(r.ok && r.client.scopes).toEqual(['catalog:read']);
  });

  it('error de lectura => lookup_failed (no anónimo)', async () => {
    const db = freshDb();
    const t = seed(db);
    db.failOn.machine_clients = { op: 'select', error: { message: 'boom' } };
    expect(await authenticateMachineClient(memorySupabase(db), `Bearer ${t.token}`)).toEqual({
      ok: false,
      reason: 'lookup_failed',
    });
  });

  it('nunca registra el token ni la cabecera', async () => {
    const db = freshDb();
    const t = seed(db);
    db.failOn.machine_clients = { op: 'select', error: { message: 'boom' } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await authenticateMachineClient(memorySupabase(db), `Bearer ${t.token}`);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain(t.token);
    expect(logged).not.toContain('Bearer');
  });
});

describe('MCP candidatos: URL', () => {
  it('acepta https de tiendas permitidas', () => {
    expect(normalizeCandidateUrl('https://www.amazon.com.mx/dp/B0TESTAAAA')).toEqual({
      ok: true,
      url: 'https://www.amazon.com.mx/dp/B0TESTAAAA',
    });
  });

  it.each([
    'https://www.amazon.com.mx/dp/B0TESTAAAA#reviews',
    'https://www.amazon.com.mx/dp/B0TESTAAAA?tag=ajeno-20',
    'https://www.amazon.com.mx/dp/B0TESTAAAA?',
    'https://www.amazon.com.mx/dp/B0TESTAAAA#',
    'https://articulo.mercadolibre.com.mx/MLM-123456789-x?matt_tool=1',
  ])('query o fragmento => INVALID_URL: %s', (url) => {
    expect(normalizeCandidateUrl(url)).toEqual({ ok: false, code: 'INVALID_URL' });
  });

  it.each([
    ['http://www.amazon.com.mx/dp/B0TESTAAAA', 'INVALID_URL'],
    ['https://localhost/dp/x', 'INVALID_URL'],
    ['https://127.0.0.1/x', 'INVALID_URL'],
    ['https://169.254.169.254/latest/meta-data', 'INVALID_URL'],
    ['https://[::1]/x', 'INVALID_URL'],
    ['https://user:pass@www.amazon.com.mx/dp/B0TESTAAAA', 'INVALID_URL'],
    ['https://www.amazon.com.mx@evil.example/dp/B0TESTAAAA', 'INVALID_URL'],
    ['https://www.amazon.com.mx:8443/dp/B0TESTAAAA', 'INVALID_URL'],
    ['javascript:alert(1)', 'INVALID_URL'],
    ['file:///etc/passwd', 'INVALID_URL'],
    ['https://www.amazon.com.mx./dp/B0TESTAAAA', 'INVALID_URL'],
    ['https://www.amazon.com.mx\\@evil.example/', 'INVALID_URL'],
    ['https://evil.example/?u=https://www.amazon.com.mx/dp/B0TESTAAAA', 'UNSUPPORTED_HOST'],
    ['https://evil.example/#www.amazon.com.mx', 'UNSUPPORTED_HOST'],
    ['https://amazon.com.mx.evil.example/dp/B0TESTAAAA', 'UNSUPPORTED_HOST'],
    ['https://evilamazon.com.mx/dp/B0TESTAAAA', 'UNSUPPORTED_HOST'],
    ['https://bit.ly/abc', 'UNSUPPORTED_HOST'],
    ['https://www.аmazon.com.mx/dp/B0TESTAAAA', 'UNSUPPORTED_HOST'],
  ])('%s => %s', (url, code) => {
    expect(normalizeCandidateUrl(url)).toEqual({ ok: false, code });
  });
});

describe('MCP candidatos: validación por índice', () => {
  it('rechaza individualmente y conserva índices', () => {
    const r = validateCandidates(
      [
        candidate(),
        candidate({ url: 'https://evil.example/x' }),
        candidate({ url: 'https://articulo.mercadolibre.com.mx/MLM-123456789-x', title: '<script>x</script>' }),
        candidate({ url: 'https://www.amazon.com.mx/dp/B0TESTBBBB', price: 0 }),
        candidate({ url: 'https://www.amazon.com.mx/dp/B0TESTCCCC', originalPrice: 100 }),
        candidate({ url: 'https://www.amazon.com.mx/dp/B0TESTDDDD', currency: 'USD' }),
        candidate({ url: 'https://www.amazon.com.mx/dp/B0TESTEEEE', note: 'x'.repeat(281) }),
        candidate({ url: 'https://www.amazon.com.mx/dp/B0TESTFFFF', observedAt: 'ayer' }),
        'no soy un objeto',
        candidate({ url: 'https://www.amazon.com.mx/Producto-Duplicado/dp/B0TESTAAAA' }),
      ],
      NOW,
    );
    expect(r.valid.map((v) => v.index)).toEqual([0]);
    expect(r.rejected).toEqual([
      { index: 1, code: 'UNSUPPORTED_HOST' },
      { index: 2, code: 'INVALID_TITLE' },
      { index: 3, code: 'INVALID_PRICE' },
      { index: 4, code: 'INVALID_ORIGINAL_PRICE' },
      { index: 5, code: 'INVALID_CURRENCY' },
      { index: 6, code: 'INVALID_NOTE' },
      { index: 7, code: 'INVALID_OBSERVED_AT' },
      { index: 8, code: 'INVALID_CANDIDATE' },
    ]);
    expect(r.duplicatesInRequest).toEqual([{ index: 9, duplicateOf: 0 }]);
  });

  it.each([
    ['HTML', { title: 'Oferta <b>top</b>' }, 'INVALID_TITLE'],
    ['entidad HTML', { title: 'Oferta &lt;b&gt;' }, 'INVALID_TITLE'],
    ['override bidi', { title: 'Oferta \u202Egnp.exe' }, 'INVALID_TITLE'],
    ['zero-width', { title: 'Of\u200Berta' }, 'INVALID_TITLE'],
    ['control', { note: 'linea\u0007' }, 'INVALID_NOTE'],
    ['título largo', { title: 'x'.repeat(201) }, 'INVALID_TITLE'],
    ['precio string', { price: '499' }, 'INVALID_PRICE'],
    ['precio NaN', { price: Number.NaN }, 'INVALID_PRICE'],
    ['observedAt futuro', { observedAt: '2026-10-05T18:00:00.000Z' }, 'INVALID_OBSERVED_AT'],
    ['observedAt viejo', { observedAt: '2026-08-01T00:00:00.000Z' }, 'INVALID_OBSERVED_AT'],
    ['observedAt sin zona', { observedAt: '2026-10-04T17:00:00' }, 'INVALID_OBSERVED_AT'],
  ])('%s => %s', (_label, over, code) => {
    const r = validateCandidates([candidate(over)], NOW);
    expect(r.rejected).toEqual([{ index: 0, code }]);
  });

  it('acepta acentos y emojis en texto plano', () => {
    const r = validateCandidates([candidate({ title: 'Cafetera eléctrica ☕', note: undefined, originalPrice: undefined })], NOW);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].note).toBeNull();
    expect(r.valid[0].originalPrice).toBeNull();
  });

  it('hash canónico ignora el orden de llaves y detecta cambios', () => {
    const a = canonicalSubmissionHash({ candidates: [{ url: 'u', price: 1 }] });
    const b = canonicalSubmissionHash({ candidates: [{ price: 1, url: 'u' }] });
    const c = canonicalSubmissionHash({ candidates: [{ price: 2, url: 'u' }] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('submit_deal_candidates', () => {
  it('crea un lote MCP con pistas y autor bot; nunca toca offers', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    const r = await submitDealCandidates(sb, client(), { idempotencyKey: 'run-0001', candidates: [candidate()] }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.accepted).toEqual([{ index: 0 }]);
    expect(r.data.rejected).toEqual([]);
    expect(r.data.quota).toEqual({ dailyCap: 200, usedToday: 1, remainingToday: 199 });
    const batch = db.tables.offer_batches[0];
    expect(batch.machine_client_id).toBe(client().id);
    expect(batch.created_by).toBe(BOT_AUTHOR);
    expect(batch.mcp_idempotency_key).toBe('run-0001');
    expect(String(batch.mcp_payload_hash)).toMatch(/^[0-9a-f]{64}$/);
    const item = db.tables.offer_batch_items[0];
    expect(item).toMatchObject({
      status: 'INGESTED',
      source_url: 'https://www.amazon.com.mx/dp/B0TESTAAAA',
      hint_title: 'Audífonos inalámbricos',
      hint_price: 499,
      hint_original_price: 899,
      hint_note: 'Bajó 40% hoy',
    });
    expect(db.tables.offers ?? []).toHaveLength(0);
  });

  it('la respuesta no expone notas de moderación, scores, bot_meta, staff ni economía', async () => {
    const db = freshDb();
    const r = await submitDealCandidates(memorySupabase(db), client(), { idempotencyKey: 'run-0002', candidates: [candidate()] }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.data).sort()).toEqual(['accepted', 'duplicatesInRequest', 'quota', 'rejected', 'submissionId']);
    const text = JSON.stringify(r.data);
    for (const leak of ['bot_meta', 'score', 'moderat', 'created_by', 'author', 'reward', 'commission', BOT_AUTHOR]) {
      expect(text).not.toContain(leak);
    }
  });

  it('idempotencia: misma llave + mismo payload => mismo envío, sin lote duplicado ni cuota extra', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    const input = { idempotencyKey: 'run-0003', candidates: [candidate()] };
    const first = await submitDealCandidates(sb, client(), input, NOW);
    const replay = await submitDealCandidates(sb, client(), { candidates: [{ ...candidate() }], idempotencyKey: 'run-0003' }, NOW);
    expect(first.ok && replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    expect(replay.data).toEqual(first.data);
    expect(replay.replay).toBe(true);
    expect(db.tables.offer_batches).toHaveLength(1);
    expect(db.tables.offer_batch_items).toHaveLength(1);
  });

  it('idempotencia: misma llave + payload distinto => IDEMPOTENCY_CONFLICT', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    await submitDealCandidates(sb, client(), { idempotencyKey: 'run-0004', candidates: [candidate()] }, NOW);
    const r = await submitDealCandidates(sb, client(), { idempotencyKey: 'run-0004', candidates: [candidate({ price: 450 })] }, NOW);
    expect(r).toMatchObject({ ok: false, code: 'IDEMPOTENCY_CONFLICT' });
    expect(db.tables.offer_batches).toHaveLength(1);
  });

  it('idempotencia por cliente: otro cliente puede usar la misma llave', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    await submitDealCandidates(sb, client(), { idempotencyKey: 'run-0005', candidates: [candidate()] }, NOW);
    const other = client({ id: '22222222-2222-4222-8222-222222222222' });
    const r = await submitDealCandidates(
      sb,
      other,
      { idempotencyKey: 'run-0005', candidates: [candidate({ url: 'https://www.amazon.com.mx/dp/B0TESTBBBB' })] },
      NOW,
    );
    expect(r.ok).toBe(true);
    expect(db.tables.offer_batches).toHaveLength(2);
  });

  it('carrera: el índice único de la base decide y la segunda llamada responde como replay', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    const input = { idempotencyKey: 'run-race-1', candidates: [candidate()] };
    const [a, b] = await Promise.all([
      submitDealCandidates(sb, client(), input, NOW),
      submitDealCandidates(sb, client(), input, NOW),
    ]);
    expect(db.tables.offer_batches).toHaveLength(1);
    const oks = [a, b].filter((x) => x.ok);
    expect(oks.length).toBeGreaterThanOrEqual(1);
    for (const x of [a, b]) {
      if (!x.ok) expect(['INTERNAL_ERROR']).toContain(x.code);
    }
  });

  it.each([
    [{ idempotencyKey: 'short', candidates: [candidate()] }, 'INVALID_INPUT'],
    [{ idempotencyKey: 'x'.repeat(129), candidates: [candidate()] }, 'INVALID_INPUT'],
    [{ idempotencyKey: 'bad key with spaces', candidates: [candidate()] }, 'INVALID_INPUT'],
    [{ idempotencyKey: 'run-0006', candidates: [] }, 'INVALID_INPUT'],
    [{ idempotencyKey: 'run-0006', candidates: 'x' }, 'INVALID_INPUT'],
    [{ idempotencyKey: 'run-0006', runId: '<x>', candidates: [candidate()] }, 'INVALID_INPUT'],
    [{ idempotencyKey: 'run-0006', candidates: Array.from({ length: 21 }, () => candidate()) }, 'TOO_MANY_CANDIDATES'],
  ])('entrada inválida => %#', async (input, code) => {
    const db = freshDb();
    const r = await submitDealCandidates(memorySupabase(db), client(), input as never, NOW);
    expect(r).toMatchObject({ ok: false, code });
    expect(db.tables.offer_batches ?? []).toHaveLength(0);
  });

  it('kill switch apagado => INGEST_PAUSED y nada se escribe', async () => {
    delete process.env.MCP_INGEST_ENABLED;
    const db = freshDb();
    const r = await submitDealCandidates(memorySupabase(db), client(), { idempotencyKey: 'run-0007', candidates: [candidate()] }, NOW);
    expect(r).toMatchObject({ ok: false, code: 'INGEST_PAUSED' });
    expect(db.tables.offer_batches ?? []).toHaveLength(0);
    process.env.MCP_INGEST_ENABLED = 'false';
    expect(
      await submitDealCandidates(memorySupabase(db), client(), { idempotencyKey: 'run-0007', candidates: [candidate()] }, NOW),
    ).toMatchObject({ ok: false, code: 'INGEST_PAUSED' });
  });

  it('cliente pausado no escribe', async () => {
    const db = freshDb();
    const r = await submitDealCandidates(
      memorySupabase(db),
      client({ status: 'paused' }),
      { idempotencyKey: 'run-0008', candidates: [candidate()] },
      NOW,
    );
    expect(r).toMatchObject({ ok: false, code: 'CLIENT_PAUSED' });
    expect(db.tables.offer_batches ?? []).toHaveLength(0);
  });

  it('cuota diaria: excederla rechaza el envío completo', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    const c = client({ dailyCandidateCap: 2 });
    const first = await submitDealCandidates(sb, c, { idempotencyKey: 'run-q-1-key', candidates: [candidate()] }, NOW);
    expect(first.ok).toBe(true);
    const r = await submitDealCandidates(
      sb,
      c,
      {
        idempotencyKey: 'run-q-2-key',
        candidates: [
          candidate({ url: 'https://www.amazon.com.mx/dp/B0TESTBBBB' }),
          candidate({ url: 'https://www.amazon.com.mx/dp/B0TESTCCCC' }),
        ],
      },
      NOW,
    );
    expect(r).toMatchObject({ ok: false, code: 'QUOTA_EXCEEDED' });
    expect(db.tables.offer_batches).toHaveLength(1);
  });

  it('identidad ya abierta en otro lote => ALREADY_IN_REVIEW, sin duplicar', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    await submitDealCandidates(sb, client(), { idempotencyKey: 'run-o-1-key', candidates: [candidate()] }, NOW);
    const r = await submitDealCandidates(sb, client(), { idempotencyKey: 'run-o-2-key', candidates: [candidate({ price: 450 })] }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.accepted).toEqual([]);
    expect(r.data.rejected).toEqual([{ index: 0, code: 'ALREADY_IN_REVIEW' }]);
    expect(db.tables.offer_batch_items).toHaveLength(1);
    const second = db.tables.offer_batches.find((b) => b.mcp_idempotency_key === 'run-o-2-key');
    expect(second?.status).toBe('archived');
    const replay = await submitDealCandidates(sb, client(), { idempotencyKey: 'run-o-2-key', candidates: [candidate({ price: 450 })] }, NOW);
    expect(replay.ok && replay.replay).toBe(true);
  });

  it('todo inválido => envío registrado sin ítems, y la respuesta es reproducible', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    const input = { idempotencyKey: 'run-bad-1', candidates: [candidate({ url: 'https://evil.example/x' })] };
    const r = await submitDealCandidates(sb, client(), input, NOW);
    expect(r.ok && r.data.rejected).toEqual([{ index: 0, code: 'UNSUPPORTED_HOST' }]);
    expect(db.tables.offer_batch_items ?? []).toHaveLength(0);
    expect((await submitDealCandidates(sb, client(), input, NOW)).ok).toBe(true);
  });

  it('el servicio no hace fetch de ninguna URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const db = freshDb();
    await submitDealCandidates(memorySupabase(db), client(), { idempotencyKey: 'run-0009', candidates: [candidate()] }, NOW);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('get_submission_status', () => {
  it('sólo envíos propios; ajenos e inexistentes => NOT_FOUND idéntico', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    const r = await submitDealCandidates(sb, client(), { idempotencyKey: 'run-s-1-key', candidates: [candidate()] }, NOW);
    if (!r.ok) throw new Error('setup');
    const mine = await getSubmissionStatus(sb, client(), r.data.submissionId);
    expect(mine.ok && mine.data.candidates).toEqual([{ index: 0, state: 'received' }]);
    const other = client({ id: '22222222-2222-4222-8222-222222222222' });
    const theirs = await getSubmissionStatus(sb, other, r.data.submissionId);
    const missing = await getSubmissionStatus(sb, other, '33333333-3333-4333-8333-333333333333');
    expect(theirs).toEqual(missing);
    expect(theirs).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await getSubmissionStatus(sb, client(), 'no-uuid')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('refleja el avance del pipeline y los rechazos de entrada', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    const r = await submitDealCandidates(
      sb,
      client(),
      {
        idempotencyKey: 'run-s-2-key',
        candidates: [candidate(), candidate({ url: 'https://evil.example/x' }), candidate({ url: 'https://www.amazon.com.mx/Otro-Titulo/dp/B0TESTAAAA' })],
      },
      NOW,
    );
    if (!r.ok) throw new Error('setup');
    db.tables.offer_batch_items[0].status = 'NEEDS_REVIEW';
    const s = await getSubmissionStatus(sb, client(), r.data.submissionId);
    expect(s.ok && s.data.candidates).toEqual([
      { index: 0, state: 'in_review' },
      { index: 1, state: 'invalid', code: 'UNSUPPORTED_HOST' },
      { index: 2, state: 'duplicate', code: 'DUPLICATE_IN_REQUEST' },
    ]);
    const text = JSON.stringify(s);
    expect(text).not.toContain('identity_key');
    expect(text).not.toContain(BOT_AUTHOR);
  });

  it('mapa de estados del contrato', () => {
    const m = (status: string, duplicate_status: string | null = 'none') => mapBatchItemToCandidateState({ status, duplicate_status });
    expect(m('INGESTED')).toBe('received');
    expect(m('PROCESSING')).toBe('processing');
    expect(m('READY')).toBe('in_review');
    expect(m('NEEDS_REVIEW')).toBe('in_review');
    expect(m('APPROVED')).toBe('accepted');
    expect(m('PUBLISHED')).toBe('published');
    expect(m('REJECTED')).toBe('rejected');
    expect(m('ERROR')).toBe('invalid');
    expect(m('NEEDS_REVIEW', 'duplicate')).toBe('duplicate');
  });
});

describe('check_offer_exists', () => {
  function dbWithOffers(rows: Record<string, unknown>[]) {
    return createMemoryDb({ tables: { offers: rows } });
  }
  const URL = 'https://www.amazon.com.mx/dp/B0TESTAAAA';
  const base = { offer_url: URL, ingestion_identity_key: 'amz:B0TESTAAAA', deleted_at: null, bot_meta: null, expires_at: null };

  it('sólo catálogo público: approved/published sí; pending, borrada o vencida no', async () => {
    for (const [row, exists] of [
      [{ ...base, status: 'approved' }, true],
      [{ ...base, status: 'published' }, true],
      [{ ...base, status: 'pending' }, false],
      [{ ...base, status: 'rejected' }, false],
      [{ ...base, status: 'approved', deleted_at: '2026-10-01T00:00:00Z' }, false],
      [{ ...base, status: 'approved', expires_at: '2026-10-01T00:00:00Z' }, false],
    ] as const) {
      const r = await checkOfferExists(memorySupabase(dbWithOffers([row])), URL, NOW);
      expect(r).toEqual({ ok: true, data: { exists } });
    }
  });

  it('devuelve sólo exists; tienda no soportada => false; URL inválida => INVALID_INPUT', async () => {
    const sb = memorySupabase(dbWithOffers([{ ...base, status: 'approved', id: 'secret-offer-id', title: 'x' }]));
    const r = await checkOfferExists(sb, URL, NOW);
    expect(r).toEqual({ ok: true, data: { exists: true } });
    expect(await checkOfferExists(sb, 'https://evil.example/x', NOW)).toEqual({ ok: true, data: { exists: false } });
    expect(await checkOfferExists(sb, 'http://localhost/x', NOW)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await checkOfferExists(sb, `${URL}?tag=abc`, NOW)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
});

describe('get_submission_rules', () => {
  it('expone contrato público sin arquitectura interna', () => {
    const rules = buildSubmissionRules(client(), { dailyCap: 200, usedToday: 3, remainingToday: 197 });
    expect(rules.currency).toBe('MXN');
    expect(rules.limits.maxCandidatesPerCall).toBe(20);
    expect(rules.limits.callsPerMinute).toBe(10);
    expect(rules.candidate.required).toEqual(['url', 'title', 'price', 'currency', 'observedAt']);
    expect(rules.supportedStores).toContain('amazon.com.mx');
    expect(rules.supportedStores).toContain('mercadolibre.com.mx');
    expect(rules.tools.map((t) => t.name)).toEqual([...MCP_TOOLS]);
    const text = JSON.stringify(rules);
    for (const internal of ['offer_batches', 'supabase', 'ingestOfferObservation', 'service_role', 'machine_clients', 'Upstash']) {
      expect(text).not.toContain(internal);
    }
  });

  it('refleja el kill switch y el estado del cliente', () => {
    expect(buildSubmissionRules(client(), null).ingestEnabled).toBe(true);
    expect(buildSubmissionRules(client({ status: 'paused' }), null).ingestEnabled).toBe(false);
    process.env.MCP_INGEST_ENABLED = 'false';
    expect(buildSubmissionRules(client(), null).ingestEnabled).toBe(false);
  });
});
