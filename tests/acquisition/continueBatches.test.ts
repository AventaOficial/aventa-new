import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { continuePendingBatches, listPendingAcquisitionBatchIds } from '@/lib/acquisition/continueBatches';
import type { ProcessChunkResult } from '@/lib/offers/batch/service';

type Row = {
  id: string;
  batchId: string;
  status: 'INGESTED' | 'PROCESSING' | 'READY' | 'NEEDS_REVIEW' | 'ERROR';
  lease: string | null;
  createdAt: string;
};

function chunkResult(partial: Partial<ProcessChunkResult>): ProcessChunkResult {
  return {
    claimed: 0,
    processed: 0,
    remaining: 0,
    reclaimed: 0,
    batch: null,
    items: [],
    ...partial,
  };
}

function world(rows: Row[]) {
  let chain = Promise.resolve();
  const calls: string[] = [];

  function exclusive<T>(fn: () => T): Promise<T> {
    const run = chain.then(fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function processChunk(batchId: string): Promise<ProcessChunkResult> {
    return exclusive(() => {
      calls.push(batchId);
      const now = Date.now();
      let reclaimed = 0;
      for (const row of rows) {
        if (
          row.batchId === batchId &&
          row.status === 'PROCESSING' &&
          row.lease != null &&
          Date.parse(row.lease) < now
        ) {
          row.status = 'INGESTED';
          row.lease = null;
          reclaimed += 1;
        }
      }
      const taken = rows.filter((row) => row.batchId === batchId && row.status === 'INGESTED').slice(0, 4);
      for (const row of taken) {
        row.status = row.id.startsWith('err-') ? 'ERROR' : 'READY';
      }
      const remaining = rows.filter(
        (row) => row.batchId === batchId && (row.status === 'INGESTED' || row.status === 'PROCESSING'),
      ).length;
      return chunkResult({
        claimed: taken.length,
        processed: taken.length,
        remaining,
        reclaimed,
        items: taken.map((row) => ({ status: row.status })) as ProcessChunkResult['items'],
      });
    });
  }

  return { rows, calls, processChunk };
}

function ingested(batchId: string, count: number, prefix = 'item'): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${batchId}-${index}`,
    batchId,
    status: 'INGESTED' as const,
    lease: null,
    createdAt: `2026-09-27T18:${String(index).padStart(2, '0')}:00.000Z`,
  }));
}

describe('continuación de lotes', () => {
  it('un lote de 100 ítems termina en varias ejecuciones, cada una con su presupuesto', async () => {
    const store = world(ingested('A', 100));
    const passes: number[] = [];
    let guard = 0;
    while (store.rows.some((row) => row.status === 'INGESTED') && guard < 40) {
      const report = await continuePendingBatches({
        listPendingBatchIds: async () => ['A'],
        processChunk: store.processChunk,
        maxChunks: 3,
      });
      passes.push(report.claimed);
      guard += 1;
    }
    expect(passes[0]).toBe(12);
    expect(passes.length).toBeGreaterThan(1);
    expect(store.rows.every((row) => row.status === 'READY')).toBe(true);
    expect(store.rows).toHaveLength(100);
  });

  it('la siguiente ejecución no vuelve a tomar ítems que ya quedaron READY', async () => {
    const store = world(ingested('A', 8));
    await continuePendingBatches({
      listPendingBatchIds: async () => ['A'],
      processChunk: store.processChunk,
      maxChunks: 1,
    });
    const ready = store.rows.filter((row) => row.status === 'READY').map((row) => row.id);
    expect(ready).toHaveLength(4);
    await continuePendingBatches({
      listPendingBatchIds: async () => ['A'],
      processChunk: store.processChunk,
      maxChunks: 1,
    });
    const stillReady = ready.every((id) => store.rows.find((row) => row.id === id)?.status === 'READY');
    expect(stillReady).toBe(true);
    expect(store.rows.filter((row) => row.status === 'READY')).toHaveLength(8);
  });

  it('dos ejecuciones concurrentes no procesan el mismo ítem', async () => {
    const store = world(ingested('A', 20));
    const [left, right] = await Promise.all([
      continuePendingBatches({
        listPendingBatchIds: async () => ['A'],
        processChunk: store.processChunk,
        maxChunks: 5,
      }),
      continuePendingBatches({
        listPendingBatchIds: async () => ['A'],
        processChunk: store.processChunk,
        maxChunks: 5,
      }),
    ]);
    expect(left.processed + right.processed).toBe(20);
    expect(store.rows.filter((row) => row.status === 'READY')).toHaveLength(20);
  });

  it('un lease vencido vuelve a la cola y se procesa', async () => {
    const store = world([
      {
        id: 'stuck-1',
        batchId: 'A',
        status: 'PROCESSING',
        lease: '2020-01-01T00:00:00.000Z',
        createdAt: '2026-09-27T18:00:00.000Z',
      },
    ]);
    const report = await continuePendingBatches({
      listPendingBatchIds: async () => ['A'],
      processChunk: store.processChunk,
      maxChunks: 1,
    });
    expect(report.reclaimed).toBe(1);
    expect(report.ready).toBe(1);
    expect(store.rows[0]?.status).toBe('READY');
  });

  it('un ítem ERROR no impide procesar los demás', async () => {
    const rows = ingested('A', 5);
    rows[0] = { ...rows[0]!, id: 'err-A-0' };
    const store = world(rows);
    const report = await continuePendingBatches({
      listPendingBatchIds: async () => ['A'],
      processChunk: store.processChunk,
      maxChunks: 3,
    });
    expect(report.errored).toBe(1);
    expect(report.ready).toBe(4);
    expect(store.rows.filter((row) => row.status === 'INGESTED')).toHaveLength(0);
  });

  it('un lote grande no se come el presupuesto del lote chico', async () => {
    const store = world([...ingested('A', 100), ...ingested('B', 5)]);
    const report = await continuePendingBatches({
      listPendingBatchIds: async () => ['A', 'B'],
      processChunk: store.processChunk,
      maxChunks: 3,
    });
    expect(store.calls.slice(0, 3)).toEqual(['A', 'B', 'A']);
    expect(report.stoppedBecause).toBe('budget');
    expect(store.rows.filter((row) => row.batchId === 'B' && row.status === 'READY').length).toBe(4);
  });

  it('sin trabajo termina sin error', async () => {
    const report = await continuePendingBatches({
      listPendingBatchIds: async () => [],
      processChunk: async () => chunkResult({}),
      maxChunks: 3,
    });
    expect(report.ok).toBe(true);
    expect(report.chunks).toBe(0);
    expect(report.stoppedBecause).toBe('idle');
  });

  it('el plazo detiene la ejecución y deja el resto', async () => {
    let clock = 0;
    const store = world(ingested('A', 20));
    const report = await continuePendingBatches({
      listPendingBatchIds: async () => ['A'],
      processChunk: async (batchId) => {
        clock += 10;
        return store.processChunk(batchId);
      },
      maxChunks: 5,
      deadlineMs: 5,
      now: () => clock,
    });
    expect(report.chunks).toBe(1);
    expect(report.stoppedBecause).toBe('deadline');
    expect(store.rows.filter((row) => row.status === 'INGESTED').length).toBe(16);
  });

  it('un fallo de un lote no detiene al otro', async () => {
    const store = world(ingested('B', 2));
    const report = await continuePendingBatches({
      listPendingBatchIds: async () => ['A', 'B'],
      processChunk: async (batchId) => {
        if (batchId === 'A') throw new Error('db down');
        return store.processChunk(batchId);
      },
      maxChunks: 3,
    });
    expect(report.chunkFailures).toBe(1);
    expect(report.ready).toBe(2);
  });

  it('la lista incluye INGESTED y PROCESSING con lease vencido', async () => {
    const rows = [
      { batch_id: 'old', created_at: '2026-09-27T18:00:00.000Z', status: 'INGESTED', lease_expires_at: null },
      { batch_id: 'stuck', created_at: '2026-09-27T18:01:00.000Z', status: 'PROCESSING', lease_expires_at: '2020-01-01T00:00:00.000Z' },
      { batch_id: 'live', created_at: '2026-09-27T18:02:00.000Z', status: 'PROCESSING', lease_expires_at: '2099-01-01T00:00:00.000Z' },
    ];
    const supabase = {
      from() {
        const state: { eqs: Array<[string, string]>; lt: [string, string] | null } = { eqs: [], lt: null };
        const api = {
          select() {
            return api;
          },
          eq(column: string, value: string) {
            state.eqs.push([column, value]);
            return api;
          },
          lt(column: string, value: string) {
            state.lt = [column, value];
            return api;
          },
          order() {
            return api;
          },
          limit() {
            return api;
          },
          then(resolve: (value: { data: typeof rows; error: null }) => unknown) {
            let data = rows.filter((row) => state.eqs.every(([column, value]) => row[column as 'status'] === value));
            if (state.lt) {
              const [column, value] = state.lt;
              data = data.filter((row) => String(row[column as 'lease_expires_at']) < value);
            }
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return api;
      },
    };
    const ids = await listPendingAcquisitionBatchIds(supabase as never, new Date('2026-09-27T19:00:00.000Z'));
    expect(ids).toEqual(['old', 'stuck']);
  });

  it('el cron reutiliza el claim existente y no publica', () => {
    const route = readFileSync('app/api/cron/acquisition-continue/route.ts', 'utf8');
    const job = readFileSync('lib/acquisition/continueBatches.ts', 'utf8');
    const claim = readFileSync('lib/offers/batch/service.ts', 'utf8');
    const vercel = readFileSync('vercel.json', 'utf8');
    expect(route).toContain('requireCronSecret');
    expect(route).toContain('maxDuration = 60');
    expect(route).toContain('runAcquisitionContinuation');
    expect(route).not.toMatch(/insertIngestedOffer\s*\(/);
    expect(route).not.toMatch(/createCommunityOfferPending\s*\(/);
    expect(route).not.toContain('extractOfferFromUrl');
    expect(job).toContain('processOfferBatchChunk');
    expect(job).not.toMatch(/insertIngestedOffer\s*\(/);
    expect(job).not.toMatch(/createCommunityOfferPending\s*\(/);
    expect(job).not.toContain('extractOfferFromUrl');
    expect(claim).toContain('extractOfferFromUrl');
    expect(claim).toContain(".eq('status', 'INGESTED')");
    expect(claim).toContain(".lt('lease_expires_at', nowIso)");
    expect(vercel).toContain('/api/cron/acquisition-continue');
  });
});
