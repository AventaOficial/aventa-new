import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state: {
  rpcRows: Row[];
  rpcError: { message: string } | null;
  rpcArgs: Record<string, unknown> | null;
  votes: Row[];
  votesError: { message: string } | null;
  machineClients: Row[];
  machineClientsError: { message: string } | null;
  ilikeRows: Row[];
  ilikeNot: unknown[][];
  voteQueries: number;
} = {
  rpcRows: [],
  rpcError: null,
  rpcArgs: null,
  votes: [],
  votesError: null,
  machineClients: [],
  machineClientsError: null,
  ilikeRows: [],
  ilikeNot: [],
  voteQueries: 0,
};

function tableBuilder(table: string) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['select', 'is', 'or', 'eq', 'order']) builder[m] = () => builder;
  builder.not = (...args: unknown[]) => {
    if (table === 'offers') state.ilikeNot.push(args);
    return builder;
  };
  builder.in = (...args: unknown[]) => {
    if (table === 'ofertas_ranked_general') {
      state.voteQueries += 1;
      const ids = new Set(args[1] as string[]);
      return Promise.resolve({
        data: state.votesError ? null : state.votes.filter((v) => ids.has(String(v.id))),
        error: state.votesError,
      });
    }
    return builder;
  };
  builder.limit = async () => {
    if (table === 'machine_clients') return { data: state.machineClients, error: state.machineClientsError };
    return { data: state.ilikeRows, error: null };
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => {
  const client = () => ({
    from: (table: string) => tableBuilder(table),
    rpc: async (_name: string, args: Record<string, unknown>) => {
      state.rpcArgs = args;
      return { data: state.rpcError ? null : state.rpcRows, error: state.rpcError };
    },
  });
  return { createServerClient: client, createInteractiveServerClient: client };
});

import { searchPublicOffers } from '@/lib/offers/searchPublicOffers';
import { resetMachineAuthorCacheForTests } from '@/lib/offers/machineAuthors';
import { mapOfferToCard, type RankedOfferSource } from '@/lib/offers/transform';

const HUNTER = '55555555-5555-4555-8555-555555555555';
const HUMAN = '22222222-2222-4222-8222-222222222222';

function hit(id: string, createdBy: string | null, rank = 0.06): Row {
  return { id, title: `Café ${id}`, price: 100, original_price: null, created_at: '2026-10-11T10:00:00Z', created_by: createdBy, rank };
}

describe('searchPublicOffers', () => {
  beforeEach(() => {
    state.rpcRows = [];
    state.rpcError = null;
    state.rpcArgs = null;
    state.votes = [];
    state.votesError = null;
    state.machineClients = [{ author_profile_id: HUNTER }];
    state.machineClientsError = null;
    state.ilikeRows = [];
    state.ilikeNot = [];
    state.voteQueries = 0;
    resetMachineAuthorCacheForTests();
    vi.stubEnv('BOT_INGEST_USER_ID', '');
    vi.stubEnv('MCP_BOT_AUTHOR_USER_IDS', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('usa los votos reales de la vista del feed, no el rank de texto, con una sola lectura', async () => {
    state.rpcRows = [hit('a', HUMAN, 0.0607), hit('b', HUNTER, 0.05)];
    state.votes = [
      { id: 'a', up_votes: 3, down_votes: 1, score: 5, ranking_momentum: 7, ranking_blend: 9 },
      { id: 'b', up_votes: 0, down_votes: 0, score: 0, ranking_momentum: 0, ranking_blend: 0 },
    ];
    const { hits, engine } = await searchPublicOffers({ query: 'cafe', limit: 12 });
    expect(engine).toBe('fts');
    expect(state.voteQueries).toBe(1);
    const a = hits.find((h) => h.id === 'a')!;
    expect([a.up_votes, a.down_votes, a.score, a.ranking_momentum, a.rank]).toEqual([3, 1, 5, 7, 0.0607]);
    const card = mapOfferToCard(a as unknown as RankedOfferSource);
    const feedCard = mapOfferToCard({ ...a, rank: undefined } as unknown as RankedOfferSource);
    expect(card.votes).toEqual(feedCard.votes);
    expect(card.votes.score).toBe(7);
  });

  it('si no se pueden leer los votos, no muestra el rank como puntaje', async () => {
    state.rpcRows = [hit('a', HUMAN, 0.0607)];
    state.votesError = { message: 'boom' };
    const { hits } = await searchPublicOffers({ query: 'cafe', limit: 12 });
    expect(hits[0].ranking_momentum).toBeNull();
    expect(mapOfferToCard(hits[0] as unknown as RankedOfferSource).votes.score).toBe(0);
  });

  it('fuera de Recientes no excluye Hunters ni consulta machine_clients', async () => {
    state.machineClientsError = { message: 'no debería leerse' };
    state.rpcRows = [hit('h', HUNTER), hit('c', HUMAN)];
    const { hits } = await searchPublicOffers({ query: 'cafe', limit: 12 });
    expect(hits.map((h) => h.id)).toEqual(['h', 'c']);
    expect(state.rpcArgs?.p_limit).toBe(12);
  });

  it('en Recientes excluye Hunters y autores vacíos, pide más filas y respeta el límite', async () => {
    state.rpcRows = [hit('h1', HUNTER), hit('c1', HUMAN), hit('x', null), hit('h2', HUNTER), hit('c2', HUMAN), hit('c3', HUMAN)];
    const { hits } = await searchPublicOffers({ query: 'cafe', limit: 2, communityOnly: true });
    expect(hits.map((h) => h.id)).toEqual(['c1', 'c2']);
    expect(state.rpcArgs?.p_limit).toBe(50);
  });

  it('en Recientes, si machine_clients falla, no devuelve resultados', async () => {
    state.machineClientsError = { message: 'timeout' };
    state.rpcRows = [hit('h1', HUNTER)];
    const result = await searchPublicOffers({ query: 'cafe', limit: 12, communityOnly: true });
    expect(result).toEqual({ hits: [], engine: 'unavailable' });
    expect(state.rpcArgs).toBeNull();
  });

  it('en Recientes, con el tope de la RPC lleno de Hunters, no se queda con una página corta', async () => {
    state.rpcRows = [hit('c1', HUMAN), ...Array.from({ length: 49 }, (_, i) => hit(`h${i}`, HUNTER))];
    state.ilikeRows = [hit('c1', HUMAN), hit('c2', HUMAN), hit('c3', HUMAN)];
    const { hits, engine } = await searchPublicOffers({ query: 'cafe', limit: 3, communityOnly: true });
    expect(engine).toBe('ilike');
    expect(hits.map((h) => h.id)).toEqual(['c1', 'c2', 'c3']);
    expect(state.ilikeNot).toContainEqual(['created_by', 'in', `(${HUNTER})`]);
  });

  it('en Recientes, sin tope lleno, la RPC ya vio todas las coincidencias aunque la página sea corta', async () => {
    state.rpcRows = [hit('c1', HUMAN), hit('h1', HUNTER)];
    state.ilikeRows = [hit('otro', HUMAN)];
    const { hits, engine } = await searchPublicOffers({ query: 'cafe', limit: 12, communityOnly: true });
    expect(engine).toBe('fts');
    expect(hits.map((h) => h.id)).toEqual(['c1']);
  });

  it('el respaldo ilike de Recientes filtra autores en la consulta', async () => {
    state.rpcRows = [hit('h1', HUNTER)];
    state.ilikeRows = [hit('c1', HUMAN)];
    const { hits, engine } = await searchPublicOffers({ query: 'cafe', limit: 12, communityOnly: true });
    expect(engine).toBe('ilike');
    expect(hits.map((h) => h.id)).toEqual(['c1']);
    expect(state.ilikeNot).toContainEqual(['created_by', 'is', null]);
    expect(state.ilikeNot).toContainEqual(['created_by', 'in', `(${HUNTER})`]);
  });
});
