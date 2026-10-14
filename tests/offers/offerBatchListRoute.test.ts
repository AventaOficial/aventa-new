import { beforeEach, describe, expect, it, vi } from 'vitest';

const tables: Record<string, Record<string, unknown>[]> = {};

const fakeSupabase = {
  from(table: string) {
    return {
      select() {
        return {
          in(column: string, values: unknown[]) {
            const rows = (tables[table] ?? []).filter((row) => values.includes(row[column]));
            return Promise.resolve({ data: rows, error: null });
          },
        };
      },
    };
  },
};

const batches: Record<string, unknown>[] = [];

vi.mock('@/lib/offers/batch/http', () => ({
  requireBatchAuth: async () => ({ user: { id: 'mod' }, supabase: fakeSupabase }),
  jsonOk: (body: unknown) => Response.json(body),
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
}));

vi.mock('@/lib/offers/batch', () => ({
  listOfferBatches: async () => batches,
  createOfferBatch: async () => ({ ok: false, error: 'n/a', httpStatus: 400 }),
}));

import { GET } from '@/app/api/admin/offer-batch/route';

describe('GET /api/admin/offer-batch', () => {
  beforeEach(() => {
    batches.length = 0;
    for (const key of Object.keys(tables)) delete tables[key];
  });

  it('cada lote MCP lleva el hunter_code de su cliente aunque todos compartan autor', async () => {
    batches.push(
      { id: 'b-kai', created_by: 'bot', machine_client_id: 'mc-kai' },
      { id: 'b-xim', created_by: 'bot', machine_client_id: 'mc-xim' },
      { id: 'b-old', created_by: 'bot', machine_client_id: 'mc-old' },
      { id: 'b-human', created_by: 'u1', machine_client_id: null },
    );
    tables.machine_clients = [
      { id: 'mc-kai', hunter_code: 'kai' },
      { id: 'mc-xim', hunter_code: 'ximena' },
      { id: 'mc-old', hunter_code: null },
    ];
    tables.profiles = [{ id: 'bot', display_name: 'Aventa MCP Supply' }];

    const res = await GET(new Request('http://localhost/api/admin/offer-batch'));
    const body = (await res.json()) as { batches: { id: string; hunter_code: string | null }[] };
    const byId = Object.fromEntries(body.batches.map((row) => [row.id, row.hunter_code]));

    expect(byId).toEqual({ 'b-kai': 'kai', 'b-xim': 'ximena', 'b-old': null, 'b-human': null });
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });
});
