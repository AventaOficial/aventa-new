import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/offers/offerExtraction/extractOfferFromUrl', () => ({
  extractOfferFromUrl: vi.fn(async () => ({
    httpStatus: 200,
    body: {
      title: 'Audífonos inalámbricos',
      image: 'https://m.media-amazon.com/images/I/test.jpg',
      images: ['https://m.media-amazon.com/images/I/test.jpg'],
      store: 'Amazon',
      suggested_discount_price: 499,
      suggested_original_price: 899,
      suggested_category: 'Audio',
      reason: null,
      extraction_status: 'success',
      missing: [],
      diagnostics: { accessFailure: null, extractionErrorCode: null },
    },
    adapter: { provider: 'amazon', blockedByHostPolicy: false, priceSource: 'amazon_html', originalPriceSource: 'amazon_html' },
    core: { provider: 'amazon' },
  })),
}));
import type { MachineClientContext } from '@/lib/mcp/auth';
import { MCP_MAX_CANDIDATES_PER_CALL, MCP_PILOT_MAX_ACCEPTED_PER_RUN } from '@/lib/mcp/contract';
import { MCP_RUN_SLOT_TABLE, runSlotKey } from '@/lib/mcp/runCap';
import { getSubmissionStatus, submitDealCandidates, type McpOutcome, type SubmitResponse } from '@/lib/mcp/submissions';
import { createMemoryDb, mcpUniqueIndexes, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';

const NOW = new Date('2026-10-04T18:00:00.000Z');
const OBSERVED = '2026-10-04T17:00:00.000Z';
const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const CAP = MCP_PILOT_MAX_ACCEPTED_PER_RUN;
const PER_CALL = MCP_MAX_CANDIDATES_PER_CALL;

function client(id = CLIENT_A, over: Partial<MachineClientContext> = {}): MachineClientContext {
  return {
    id,
    name: 'Grok',
    scopes: ['candidates:submit', 'candidates:read', 'catalog:read'],
    status: 'active',
    authorProfileId: '0b0b0b0b-0000-4000-8000-000000000001',
    dailyCandidateCap: 1000,
    ...over,
  };
}

let asin = 0;
function freshCandidate(over: Record<string, unknown> = {}) {
  asin += 1;
  return {
    url: `https://www.amazon.com.mx/dp/B0RC${String(asin).padStart(6, '0')}`,
    title: 'Audífonos inalámbricos',
    price: 499,
    currency: 'MXN',
    observedAt: OBSERVED,
    ...over,
  };
}
const fresh = (n: number) => Array.from({ length: n }, () => freshCandidate());
const invalid = () => freshCandidate({ url: 'https://evil.example/x' });
function submit(db: MemoryDb, runId: unknown, idempotencyKey: string, candidates: unknown[], c = client()) {
  return submitDealCandidates(memorySupabase(db), c, { idempotencyKey, runId, candidates }, NOW);
}

function data(r: McpOutcome<SubmitResponse>): SubmitResponse {
  if (!r.ok) throw new Error(`esperaba ok, llegó ${r.code}`);
  return r.data;
}

/** Envía `n` candidatos nuevos en llamadas secuenciales de hasta PER_CALL; devuelve cuántos se aceptaron. */
async function fill(db: MemoryDb, runId: string, n: number, tag = 'fill', c = client()): Promise<number> {
  let accepted = 0;
  for (let sent = 0, call = 1; sent < n; call++) {
    const size = Math.min(PER_CALL, n - sent);
    const key = `${runId}:${tag}:${String(call).padStart(2, '0')}`;
    accepted += data(await submit(db, runId, key, fresh(size), c)).accepted.length;
    sent += size;
  }
  return accepted;
}

function acceptedIn(results: Array<McpOutcome<SubmitResponse>>): number {
  return results.reduce((n, r) => n + (r.ok ? r.data.accepted.length : 0), 0);
}

function heldSlots(db: MemoryDb, clientId: string, runId: string): number {
  const keys = new Set(Array.from({ length: CAP }, (_, i) => runSlotKey(clientId, runId, i + 1)));
  return (db.tables[MCP_RUN_SLOT_TABLE] ?? []).filter(
    (r) => keys.has(String(r.lock_key)) && String(r.expires_at) > NOW.toISOString(),
  ).length;
}

function itemsOfRun(db: MemoryDb, clientId: string, runId: string): number {
  const batchIds = new Set(
    (db.tables.offer_batches ?? [])
      .filter((b) => b.machine_client_id === clientId && b.mcp_run_id === runId)
      .map((b) => b.id),
  );
  return (db.tables.offer_batch_items ?? []).filter((it) => batchIds.has(it.batch_id)).length;
}

const freshDb = () => createMemoryDb({ unique: mcpUniqueIndexes() });

const prevEnv = { ...process.env };
beforeEach(() => {
  process.env.MCP_INGEST_ENABLED = 'true';
});
afterEach(() => {
  process.env = { ...prevEnv };
  vi.restoreAllMocks();
});

describe('cupo del piloto por runId: límites', () => {
  it('el cupo es 100 y exige varias llamadas de 20', () => {
    expect(CAP).toBe(100);
    expect(PER_CALL).toBe(20);
    expect(CAP).toBeGreaterThan(PER_CALL);
  });

  it('una corrida completa en llamadas de 20 => exactamente CAP aceptados y el siguiente RUN_CAP_REACHED', async () => {
    const db = freshDb();
    expect(await fill(db, 'run-full-calls', CAP)).toBe(CAP);
    expect(itemsOfRun(db, CLIENT_A, 'run-full-calls')).toBe(CAP);
    expect(heldSlots(db, CLIENT_A, 'run-full-calls')).toBe(CAP);
    const extra = data(await submit(db, 'run-full-calls', 'run-full-calls:extra', fresh(1)));
    expect(extra.rejected).toEqual([{ index: 0, code: 'RUN_CAP_REACHED' }]);
  });

  it('con 5 de cupo llegan 6 => 5 aceptados en orden de índice y el sexto RUN_CAP_REACHED', async () => {
    const db = freshDb();
    expect(await fill(db, 'run-1', CAP - 5)).toBe(CAP - 5);
    const r = data(await submit(db, 'run-1', 'run-1:last', fresh(6)));
    expect(r.accepted).toEqual([0, 1, 2, 3, 4].map((index) => ({ index })));
    expect(r.rejected).toEqual([{ index: 5, code: 'RUN_CAP_REACHED' }]);
    expect(r.quota.usedToday).toBe(CAP);
    expect(itemsOfRun(db, CLIENT_A, 'run-1')).toBe(CAP);
    expect(heldSlots(db, CLIENT_A, 'run-1')).toBe(CAP);
    const status = await getSubmissionStatus(memorySupabase(db), client(), r.submissionId);
    expect(status.ok && status.data.candidates[5]).toEqual({ index: 5, state: 'rejected', code: 'RUN_CAP_REACHED' });
  });

  it('llamada llena (20) con 5 de cupo => sólo 5 entran', async () => {
    const db = freshDb();
    await fill(db, 'run-20', CAP - 5);
    const r = data(await submit(db, 'run-20', 'run-20:last', fresh(PER_CALL)));
    expect(r.accepted).toHaveLength(5);
    expect(r.rejected.filter((x) => x.code === 'RUN_CAP_REACHED')).toHaveLength(PER_CALL - 5);
    expect(itemsOfRun(db, CLIENT_A, 'run-20')).toBe(CAP);
  });

  it('parcial: quedan 2 de cupo y llegan 4 => 2 aceptados y 2 RUN_CAP_REACHED, por índice', async () => {
    const db = freshDb();
    expect(await fill(db, 'run-p', CAP - 2)).toBe(CAP - 2);
    const r = data(await submit(db, 'run-p', 'run-p:last', fresh(4)));
    expect(r.accepted).toEqual([{ index: 0 }, { index: 1 }]);
    expect(r.rejected).toEqual([
      { index: 2, code: 'RUN_CAP_REACHED' },
      { index: 3, code: 'RUN_CAP_REACHED' },
    ]);
    expect(itemsOfRun(db, CLIENT_A, 'run-p')).toBe(CAP);
  });

  it('cupo agotado => el envío se registra (archivado) sin ítems y su replay es estable', async () => {
    const db = freshDb();
    await fill(db, 'run-full', CAP);
    const extra = fresh(2);
    const r = data(await submit(db, 'run-full', 'run-full:extra', extra));
    expect(r.accepted).toEqual([]);
    expect(r.rejected).toEqual([
      { index: 0, code: 'RUN_CAP_REACHED' },
      { index: 1, code: 'RUN_CAP_REACHED' },
    ]);
    const batch = db.tables.offer_batches.find((b) => b.mcp_idempotency_key === 'run-full:extra');
    expect(batch?.status).toBe('archived');
    const replay = await submit(db, 'run-full', 'run-full:extra', extra);
    expect(replay.ok && replay.replay).toBe(true);
    expect(data(replay)).toEqual(r);
    expect(itemsOfRun(db, CLIENT_A, 'run-full')).toBe(CAP);
  });
});

describe('cupo del piloto: qué cuenta', () => {
  it('inválidos y repetidos del envío no ocupan cupo', async () => {
    const db = freshDb();
    await fill(db, 'run-inv', CAP - 5);
    const valid = fresh(5);
    const r = data(await submit(db, 'run-inv', 'run-inv:mixed', [invalid(), ...valid, { ...valid[0] }, 'basura']));
    expect(r.accepted).toEqual([1, 2, 3, 4, 5].map((index) => ({ index })));
    expect(r.rejected).toEqual([
      { index: 0, code: 'UNSUPPORTED_HOST' },
      { index: 7, code: 'INVALID_CANDIDATE' },
    ]);
    expect(r.duplicatesInRequest).toEqual([{ index: 6, duplicateOf: 1 }]);
    expect(itemsOfRun(db, CLIENT_A, 'run-inv')).toBe(CAP);
    const onlyInvalid = data(await submit(db, 'run-inv', 'run-inv:only-invalid', [invalid()]));
    expect(onlyInvalid.rejected).toEqual([{ index: 0, code: 'UNSUPPORTED_HOST' }]);
  });

  it('un envío sólo con inválidos no toca los slots', async () => {
    const db = freshDb();
    await submit(db, 'run-only-inv', 'run-only-inv:001', [invalid(), invalid()]);
    expect(db.tables[MCP_RUN_SLOT_TABLE] ?? []).toHaveLength(0);
    expect(await fill(db, 'run-only-inv', CAP)).toBe(CAP);
  });

  it('ALREADY_IN_REVIEW libera su slot y otro envío de la misma corrida lo retoma', async () => {
    const db = freshDb();
    const open = freshCandidate();
    await submit(db, 'run-other', 'run-other:001', [open]);
    await fill(db, 'run-air', CAP - 5);
    const ys = fresh(5);
    const r = data(await submit(db, 'run-air', 'run-air:mixed', [{ ...open, price: 450 }, ...ys]));
    expect(r.accepted).toEqual([1, 2, 3, 4].map((index) => ({ index })));
    expect(r.rejected).toEqual([
      { index: 0, code: 'ALREADY_IN_REVIEW' },
      { index: 5, code: 'RUN_CAP_REACHED' },
    ]);
    expect(heldSlots(db, CLIENT_A, 'run-air')).toBe(CAP - 1);
    const retry = data(await submit(db, 'run-air', 'run-air:retry', [ys[4]]));
    expect(retry.accepted).toEqual([{ index: 0 }]);
    expect(heldSlots(db, CLIENT_A, 'run-air')).toBe(CAP);
    expect(data(await submit(db, 'run-air', 'run-air:extra', fresh(1))).rejected).toEqual([{ index: 0, code: 'RUN_CAP_REACHED' }]);
    expect(itemsOfRun(db, CLIENT_A, 'run-air')).toBe(CAP);
  });

  it('la cuota diaria se sigue aplicando antes del cupo y sin ocupar slots', async () => {
    const db = freshDb();
    const r = await submit(db, 'run-q', 'run-q:001', fresh(3), client(CLIENT_A, { dailyCandidateCap: 2 }));
    expect(r).toMatchObject({ ok: false, code: 'QUOTA_EXCEEDED' });
    expect(db.tables[MCP_RUN_SLOT_TABLE] ?? []).toHaveLength(0);
  });

  it('con la cuota diaria de producción (200) caben dos corridas completas y la tercera se rechaza', async () => {
    const db = freshDb();
    const prod = client(CLIENT_A, { dailyCandidateCap: 200 });
    expect(await fill(db, 'run-day-1', CAP, 'fill', prod)).toBe(CAP);
    expect(await fill(db, 'run-day-2', CAP, 'fill', prod)).toBe(CAP);
    const third = await submit(db, 'run-day-3', 'run-day-3:001', fresh(1), prod);
    expect(third).toMatchObject({ ok: false, code: 'QUOTA_EXCEEDED' });
    expect(heldSlots(db, CLIENT_A, 'run-day-3')).toBe(0);
  });

  it('sin runId => INVALID_INPUT y nada se escribe', async () => {
    const db = freshDb();
    for (const runId of [undefined, null, '', 'con espacio', 'x'.repeat(129), 42]) {
      expect(await submit(db, runId, 'run-none:001', fresh(1))).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    }
    expect(db.tables.offer_batches ?? []).toHaveLength(0);
    expect(db.tables[MCP_RUN_SLOT_TABLE] ?? []).toHaveLength(0);
  });
});

describe('cupo del piloto: reintentos', () => {
  it('misma llave + mismo payload => replay sin ocupar más cupo', async () => {
    const db = freshDb();
    const cands = fresh(3);
    const first = data(await submit(db, 'run-r', 'run-r:001', cands));
    for (let i = 0; i < 3; i++) {
      const again = await submit(db, 'run-r', 'run-r:001', cands);
      expect(again.ok && again.replay).toBe(true);
      expect(data(again)).toEqual(first);
    }
    expect(heldSlots(db, CLIENT_A, 'run-r')).toBe(3);
    expect(await fill(db, 'run-r', CAP - 3 + 1)).toBe(CAP - 3);
  });

  it('misma llave + payload distinto => IDEMPOTENCY_CONFLICT sin ocupar cupo', async () => {
    const db = freshDb();
    await submit(db, 'run-c', 'run-c:001', fresh(2));
    expect(await submit(db, 'run-c', 'run-c:001', fresh(3))).toMatchObject({ ok: false, code: 'IDEMPOTENCY_CONFLICT' });
    expect(heldSlots(db, CLIENT_A, 'run-c')).toBe(2);
  });

  it('llave distinta con el mismo runId no acepta más allá del cupo', async () => {
    const db = freshDb();
    const size = 7;
    const calls = Math.ceil(CAP / size) + 1;
    const results = [];
    for (let i = 1; i <= calls; i++) results.push(await submit(db, 'run-k', `run-k:${String(i).padStart(3, '0')}`, fresh(size)));
    expect(acceptedIn(results)).toBe(CAP);
    expect(itemsOfRun(db, CLIENT_A, 'run-k')).toBe(CAP);
  });

  it('reenviar los mismos candidatos con otra llave tras llenar el cupo => RUN_CAP_REACHED, no ALREADY_IN_REVIEW', async () => {
    const db = freshDb();
    const chunks = Array.from({ length: Math.ceil(CAP / PER_CALL) }, (_, i) => fresh(Math.min(PER_CALL, CAP - i * PER_CALL)));
    for (const [i, chunk] of chunks.entries()) await submit(db, 'run-same', `run-same:${String(i + 1).padStart(2, '0')}`, chunk);
    expect(itemsOfRun(db, CLIENT_A, 'run-same')).toBe(CAP);
    const r = data(await submit(db, 'run-same', 'run-same:again', chunks[0]));
    expect(r.accepted).toEqual([]);
    expect(new Set(r.rejected.map((x) => x.code))).toEqual(new Set(['RUN_CAP_REACHED']));
  });
});

describe('cupo del piloto: concurrencia', () => {
  it('8 llamadas simultáneas de 20 con llaves distintas y el mismo runId => exactamente CAP aceptados', async () => {
    const db = freshDb();
    const calls = 8;
    expect(calls * PER_CALL).toBeGreaterThan(CAP);
    const results = await Promise.all(
      Array.from({ length: calls }, (_, i) => submit(db, 'run-par', `run-par:${String(i).padStart(3, '0')}`, fresh(PER_CALL))),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(acceptedIn(results)).toBe(CAP);
    expect(itemsOfRun(db, CLIENT_A, 'run-par')).toBe(CAP);
    expect(heldSlots(db, CLIENT_A, 'run-par')).toBe(CAP);
    const capped = results.flatMap((r) => (r.ok ? r.data.rejected : [])).filter((x) => x.code === 'RUN_CAP_REACHED');
    expect(capped).toHaveLength(calls * PER_CALL - CAP);
  });

  it('llamadas simultáneas con la misma llave => un solo lote y los slots del perdedor se liberan', async () => {
    const db = freshDb();
    const cands = fresh(3);
    const results = await Promise.all([1, 2, 3].map(() => submit(db, 'run-same-key', 'run-same-key:001', cands)));
    expect(db.tables.offer_batches).toHaveLength(1);
    expect(itemsOfRun(db, CLIENT_A, 'run-same-key')).toBe(3);
    expect(heldSlots(db, CLIENT_A, 'run-same-key')).toBe(3);
    for (const r of results) {
      if (r.ok) expect(r.data.accepted).toHaveLength(3);
      else expect(r.code).toBe('INTERNAL_ERROR');
    }
    expect(await fill(db, 'run-same-key', CAP - 3 + 1)).toBe(CAP - 3);
  });

  it('carrera mixta de reintentos y llaves nuevas cerca del tope nunca pasa de CAP', async () => {
    const db = freshDb();
    await fill(db, 'run-mix', CAP - 5);
    const base = fresh(4);
    const results = await Promise.all([
      submit(db, 'run-mix', 'run-mix:001', base),
      submit(db, 'run-mix', 'run-mix:001', base),
      submit(db, 'run-mix', 'run-mix:002', fresh(4)),
      submit(db, 'run-mix', 'run-mix:003', fresh(4)),
      submit(db, 'run-mix', 'run-mix:002', fresh(4)),
    ]);
    expect(itemsOfRun(db, CLIENT_A, 'run-mix')).toBeLessThanOrEqual(CAP);
    expect(heldSlots(db, CLIENT_A, 'run-mix')).toBe(itemsOfRun(db, CLIENT_A, 'run-mix'));
    expect(results.some((r) => r.ok)).toBe(true);
  });
});

describe('cupo del piloto: aislamiento', () => {
  it('runId distintos del mismo cliente tienen cupos independientes', async () => {
    const db = freshDb();
    await fill(db, 'run-a', CAP);
    expect(await fill(db, 'run-b', CAP)).toBe(CAP);
    expect(data(await submit(db, 'run-a', 'run-a:extra', fresh(1))).accepted).toEqual([]);
  });

  it('el mismo runId en otro cliente no comparte cupo', async () => {
    const db = freshDb();
    await fill(db, 'shared-run', CAP, 'fill', client(CLIENT_A));
    expect(await fill(db, 'shared-run', CAP, 'fill', client(CLIENT_B))).toBe(CAP);
    expect(heldSlots(db, CLIENT_A, 'shared-run')).toBe(CAP);
    expect(heldSlots(db, CLIENT_B, 'shared-run')).toBe(CAP);
  });

  it('runIds que sólo difieren en sufijos no colisionan', async () => {
    const db = freshDb();
    await fill(db, 'r', CAP, 'suffix-r');
    expect(await fill(db, 'r:1', CAP, 'suffix-r1')).toBe(CAP);
    expect(await fill(db, 'r:1:1', CAP, 'suffix-r11')).toBe(CAP);
  });

  it('no toca los locks de ingesta', async () => {
    const db = freshDb();
    const ingestLock = { lock_key: 'ingest:ml_worker', holder: 'worker', acquired_at: NOW.toISOString(), expires_at: '2026-10-04T18:05:00.000Z' };
    db.tables[MCP_RUN_SLOT_TABLE] = [{ ...ingestLock }];
    await submit(db, 'run-iso', 'run-iso:001', fresh(3));
    expect(db.tables[MCP_RUN_SLOT_TABLE].find((r) => r.lock_key === 'ingest:ml_worker')).toEqual(ingestLock);
  });
});

describe('cupo del piloto: fallo de la primitiva', () => {
  it('si no se puede escribir el slot => INTERNAL_ERROR, sin lote ni ítems (fail-closed)', async () => {
    const db = freshDb();
    db.failOn[MCP_RUN_SLOT_TABLE] = { op: 'insert', error: { code: '42P01', message: 'relation does not exist' } };
    const r = await submit(db, 'run-down', 'run-down:001', fresh(2));
    expect(r).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
    expect(db.tables.offer_batches ?? []).toHaveLength(0);
    expect(db.tables.offer_batch_items ?? []).toHaveLength(0);
  });

  it('si falla la retoma de un slot liberado => INTERNAL_ERROR y se liberan los ya tomados', async () => {
    const db = freshDb();
    await fill(db, 'run-retake', CAP);
    db.failOn[MCP_RUN_SLOT_TABLE] = { op: 'update', error: { code: '08006', message: 'connection failure' } };
    const r = await submit(db, 'run-retake', 'run-retake:extra', fresh(1));
    expect(r).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
    expect(itemsOfRun(db, CLIENT_A, 'run-retake')).toBe(CAP);
  });

  it('si falla liberar un slot, la corrida acepta menos, nunca más', async () => {
    const db = freshDb();
    const open = freshCandidate();
    await submit(db, 'run-x', 'run-x:001', [open]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.failOn[MCP_RUN_SLOT_TABLE] = { op: 'update', error: { code: '08006', message: 'connection failure' } };
    const r = data(await submit(db, 'run-leak', 'run-leak:001', [{ ...open, price: 450 }, ...fresh(4)]));
    expect(r.accepted).toHaveLength(4);
    delete db.failOn[MCP_RUN_SLOT_TABLE];
    expect(heldSlots(db, CLIENT_A, 'run-leak')).toBe(5);
    expect(await fill(db, 'run-leak', CAP - 5 + 1)).toBe(CAP - 5);
    expect(heldSlots(db, CLIENT_A, 'run-leak')).toBe(CAP);
    expect(data(await submit(db, 'run-leak', 'run-leak:extra', fresh(1))).rejected).toEqual([{ index: 0, code: 'RUN_CAP_REACHED' }]);
    expect(itemsOfRun(db, CLIENT_A, 'run-leak')).toBe(CAP - 1);
  });
});
