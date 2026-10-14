import { beforeEach, describe, expect, it, vi } from 'vitest';

/** POST /api/admin/moderation/offer-hunter contra Supabase simulado (sin base de datos real). */
const BOT = '11111111-1111-4111-8111-111111111111';
const DB_HUNTER = '55555555-5555-4555-8555-555555555555';
const HUMAN = '22222222-2222-4222-8222-222222222222';
const MOD = '99999999-9999-4999-8999-999999999999';

const state: {
  auth: { user: { id: string } } | { error: string; status: number };
  offer: Record<string, unknown> | null;
  updated: { id: string } | null;
  machineIds: string[] | null;
  updates: Array<{ patch: Record<string, unknown>; eq: Array<[string, unknown]> }>;
  invalidated: string[];
} = { auth: { user: { id: MOD } }, offer: null, updated: null, machineIds: [], updates: [], invalidated: [] };

vi.mock('@/lib/team/moderation/access', () => ({
  requireModerationActor: async () => state.auth,
}));
vi.mock('@/lib/offers/publicOfferCache', () => ({
  invalidatePublicOffer: (id: string) => state.invalidated.push(id),
}));
vi.mock('@/lib/offers/machineAuthors', () => ({
  loadMachineAuthorIds: async () => state.machineIds,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => {
      let patch: Record<string, unknown> | null = null;
      const eq: Array<[string, unknown]> = [];
      const b: Record<string, (...args: unknown[]) => unknown> = {
        select: () => b,
        update: (p: unknown) => {
          patch = p as Record<string, unknown>;
          return b;
        },
        eq: (col: unknown, val: unknown) => {
          eq.push([String(col), val]);
          return b;
        },
        maybeSingle: async () => {
          if (patch) {
            state.updates.push({ patch, eq });
            return { data: state.updated, error: null };
          }
          return { data: state.offer, error: null };
        },
      };
      return b;
    },
  }),
}));

import { POST } from '@/app/api/admin/moderation/offer-hunter/route';

function post(body: unknown) {
  return POST(new Request('http://localhost/api/admin/moderation/offer-hunter', { method: 'POST', body: JSON.stringify(body) }));
}

describe('POST offer-hunter', () => {
  beforeEach(() => {
    vi.stubEnv('BOT_INGEST_USER_ID', BOT);
    vi.stubEnv('MCP_BOT_AUTHOR_USER_IDS', '');
    state.auth = { user: { id: MOD } };
    state.offer = { id: 'o1', status: 'approved', created_by: BOT, bot_meta: { price_policy: 'x', hunter_code: 'ximena' }, deleted_at: null };
    state.updated = { id: 'o1' };
    state.machineIds = [];
    state.updates = [];
    state.invalidated = [];
  });

  it('sin moderador no toca nada', async () => {
    state.auth = { error: 'No autorizado', status: 401 };
    const res = await post({ id: 'o1', hunterCode: 'kai' });
    expect(res.status).toBe(401);
    expect(state.updates).toHaveLength(0);
  });

  it('rechaza hunters fuera del catálogo', async () => {
    const res = await post({ id: 'o1', hunterCode: 'grok' });
    expect(res.status).toBe(400);
    expect(state.updates).toHaveLength(0);
  });

  it('cambia solo bot_meta.hunter_code, conserva el resto, deja rastro e invalida caché', async () => {
    const res = await post({ id: 'o1', hunterCode: 'kai' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, hunterCode: 'kai', from: 'ximena' });
    expect(state.updates).toHaveLength(1);
    const { patch, eq } = state.updates[0];
    expect(Object.keys(patch)).toEqual(['bot_meta']);
    const meta = patch.bot_meta as Record<string, unknown>;
    expect(meta.price_policy).toBe('x');
    expect(meta.hunter_code).toBe('kai');
    expect(meta.hunter_code_change).toMatchObject({ from: 'ximena', to: 'kai', by: MOD });
    expect(eq).toEqual([
      ['id', 'o1'],
      ['status', 'approved'],
    ]);
    expect(state.invalidated).toEqual(['o1']);
  });

  it('una oferta sin sello cuenta como Ximena', async () => {
    state.offer = { ...state.offer, bot_meta: { enrichment: {} } };
    const res = await post({ id: 'o1', hunterCode: 'eleonore' });
    expect(await res.json()).toMatchObject({ from: 'ximena', hunterCode: 'eleonore' });
  });

  it('si ya tiene ese hunter no escribe', async () => {
    const res = await post({ id: 'o1', hunterCode: 'ximena' });
    expect(await res.json()).toMatchObject({ unchanged: true });
    expect(state.updates).toHaveLength(0);
  });

  it('ofertas de personas no tienen hunter', async () => {
    state.offer = { ...state.offer, created_by: HUMAN };
    const res = await post({ id: 'o1', hunterCode: 'kai' });
    expect(res.status).toBe(400);
    expect(state.updates).toHaveLength(0);
  });

  it('acepta autores registrados solo en machine_clients', async () => {
    state.offer = { ...state.offer, created_by: DB_HUNTER };
    state.machineIds = [DB_HUNTER];
    expect((await post({ id: 'o1', hunterCode: 'kai' })).status).toBe(200);
  });

  it('si no se puede verificar el autor, no escribe', async () => {
    state.offer = { ...state.offer, created_by: DB_HUNTER };
    state.machineIds = null;
    expect((await post({ id: 'o1', hunterCode: 'kai' })).status).toBe(503);
    expect(state.updates).toHaveLength(0);
  });

  it('rechazadas o borradas no se editan', async () => {
    state.offer = { ...state.offer, status: 'rejected' };
    expect((await post({ id: 'o1', hunterCode: 'kai' })).status).toBe(404);
    state.offer = { ...state.offer, status: 'approved', deleted_at: '2026-10-12T00:00:00Z' };
    expect((await post({ id: 'o1', hunterCode: 'kai' })).status).toBe(404);
    expect(state.updates).toHaveLength(0);
  });

  it('si el estado cambió entre lectura y escritura responde 409 y no invalida', async () => {
    state.updated = null;
    expect((await post({ id: 'o1', hunterCode: 'kai' })).status).toBe(409);
    expect(state.invalidated).toHaveLength(0);
  });
});
