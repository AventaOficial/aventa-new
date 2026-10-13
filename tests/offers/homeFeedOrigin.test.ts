import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getHomeFeed contra un cliente Supabase simulado en memoria (sin base de datos real).
 * El builder aplica los filtros que importan aquí (`not is null`, `not in`, `lt` del cursor)
 * para comprobar que Recientes excluye a los autores automáticos antes de paginar.
 */
type Call = { table: string; method: string; args: unknown[] };
type Row = Record<string, unknown>;
const state: {
  rows: Row[];
  error: { message: string } | null;
  machineClients: Row[];
  machineClientsError: { code?: string; message: string } | null;
  calls: Call[];
} = {
  rows: [],
  error: null,
  machineClients: [],
  machineClientsError: null,
  calls: [],
};

function parseInList(raw: unknown): string[] {
  return String(raw).replace(/^\(|\)$/g, '').split(',').filter(Boolean);
}

function queryBuilder(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['select', 'in', 'or', 'gte', 'eq', 'order', 'is']) {
    builder[method] = (...args: unknown[]) => {
      state.calls.push({ table, method, args });
      return builder;
    };
  }
  builder.not = (...args: unknown[]) => {
    state.calls.push({ table, method: 'not', args });
    const [col, op, value] = args as [string, string, unknown];
    if (op === 'is' && value === null) filters.push((row) => row[col] != null);
    if (op === 'in') {
      const ids = new Set(parseInList(value));
      filters.push((row) => !ids.has(String(row[col])));
    }
    return builder;
  };
  builder.lt = (...args: unknown[]) => {
    state.calls.push({ table, method: 'lt', args });
    const [col, value] = args as [string, string];
    filters.push((row) => Date.parse(String(row[col])) < Date.parse(value));
    return builder;
  };
  builder.limit = async (...args: unknown[]) => {
    state.calls.push({ table, method: 'limit', args });
    if (table === 'machine_clients') {
      return { data: state.machineClientsError ? null : state.machineClients, error: state.machineClientsError };
    }
    if (state.error) return { data: null, error: state.error };
    const n = Number(args[0]);
    return { data: state.rows.filter((row) => filters.every((f) => f(row))).slice(0, n), error: null };
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => {
  const client = () => ({
    from: (table: string) => {
      state.calls.push({ table, method: 'from', args: [table] });
      return queryBuilder(table);
    },
  });
  return { createServerClient: client, createInteractiveServerClient: client };
});

import { getHomeFeed, isCommunityOnlyFeed } from '@/lib/offers/feedService';
import { resetMachineAuthorCacheForTests } from '@/lib/offers/machineAuthors';
import { mapOfferToCard, type FeedApiItemShape } from '@/lib/offers/transform';
import { processHomeFeedList } from '@/lib/offers/homeFeedClient';

const BOT = '11111111-1111-4111-8111-111111111111';
const MCP_AUTHOR = '44444444-4444-4444-8444-444444444444';
const DB_HUNTER = '55555555-5555-4555-8555-555555555555';
const HUMAN = '22222222-2222-4222-8222-222222222222';
const HUMAN_2 = '33333333-3333-4333-8333-333333333333';

function row(id: string, createdBy: string | null, displayName: string, createdAt: string, extra: Row = {}) {
  return {
    id,
    title: `Arroz 1 kg ${id}`,
    price: 30,
    original_price: null,
    offer_url: 'https://www.walmart.com.mx/ip/123',
    created_at: createdAt,
    score: 0,
    up_votes: 0,
    down_votes: 0,
    ranking_blend: null,
    ranking_momentum: null,
    image_url: null,
    image_urls: [],
    store: 'Walmart',
    category: 'supermercado',
    created_by: createdBy,
    expires_at: null,
    profiles: { display_name: displayName, avatar_url: null, leader_badge: null, ml_tracking_tag: null, slug: null },
    ...extra,
  };
}

const offersQueried = () => state.calls.some((c) => c.table === 'ofertas_ranked_general' && c.method === 'limit');

describe('Recientes: solo publicaciones de la comunidad', () => {
  beforeEach(() => {
    state.rows = [];
    state.error = null;
    state.machineClients = [{ author_profile_id: DB_HUNTER }];
    state.machineClientsError = null;
    state.calls = [];
    resetMachineAuthorCacheForTests();
    vi.stubEnv('BOT_INGEST_USER_ID', BOT);
    vi.stubEnv('BOT_INGEST_USER_ID_TECH', '');
    vi.stubEnv('BOT_INGEST_USER_ID_STAPLES', '');
    vi.stubEnv('MCP_BOT_AUTHOR_USER_IDS', `  ${MCP_AUTHOR} ,`);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('excluye en la consulta a autores de entorno y de machine_clients; conserva a la comunidad', async () => {
    state.rows = [
      row('bot', BOT, 'Ximena', '2026-10-11T10:00:00Z'),
      row('mcp', MCP_AUTHOR, 'Cazador', '2026-10-11T09:00:00Z'),
      row('hunter_db', DB_HUNTER, 'Aventa MCP Supply', '2026-10-11T08:30:00Z'),
      row('impostor', HUMAN, 'Aventa Bot', '2026-10-11T08:00:00Z'),
      row('ana', HUMAN_2, 'Ana', '2026-10-11T07:00:00Z'),
    ];
    const result = await getHomeFeed({ view: 'latest', period: 'week', limit: 10 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((o) => [o.id, o.origin])).toEqual([
      ['impostor', 'community'],
      ['ana', 'community'],
    ]);
    const notIn = state.calls.find((c) => c.table === 'ofertas_ranked_general' && c.method === 'not' && c.args[1] === 'in');
    expect(parseInList(notIn?.args[2]).sort()).toEqual([BOT, MCP_AUTHOR, DB_HUNTER].sort());
  });

  it('el filtro va antes del límite: la página se llena con comunidad y el cursor sigue sin Hunters', async () => {
    state.rows = [
      row('h1', DB_HUNTER, 'Hunter', '2026-10-11T10:00:00Z'),
      row('c1', HUMAN, 'Ana', '2026-10-11T09:00:00Z'),
      row('h2', DB_HUNTER, 'Hunter', '2026-10-11T08:00:00Z'),
      row('c2', HUMAN_2, 'Luis', '2026-10-11T07:00:00Z'),
      row('h3', MCP_AUTHOR, 'Hunter', '2026-10-11T06:00:00Z'),
      row('c3', HUMAN, 'Ana', '2026-10-11T05:00:00Z'),
    ];
    const first = await getHomeFeed({ view: 'latest', period: 'week', limit: 2 });
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.data.map((o) => o.id)).toEqual(['c1', 'c2']);
    expect(first.nextCursor).toBe('2026-10-11T07:00:00Z');

    const second = await getHomeFeed({ view: 'latest', period: 'week', limit: 2, cursor: first.nextCursor });
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.data.map((o) => o.id)).toEqual(['c3']);
    expect(second.nextCursor).toBeNull();
  });

  it('si machine_clients falla, Recientes cierra el paso y no consulta ofertas', async () => {
    state.machineClientsError = { code: '57014', message: 'timeout' };
    state.rows = [row('h1', DB_HUNTER, 'Hunter', '2026-10-11T10:00:00Z')];
    const result = await getHomeFeed({ view: 'latest', period: 'week' });
    expect(result).toEqual({ success: false, error: 'machine_authors_unavailable' });
    expect(offersQueried()).toBe(false);
  });

  it('un fallo no queda en caché: la siguiente lectura correcta vuelve a abrir Recientes', async () => {
    state.machineClientsError = { message: 'boom' };
    expect((await getHomeFeed({ view: 'latest', period: 'week' })).success).toBe(false);
    state.machineClientsError = null;
    state.rows = [row('c1', HUMAN, 'Ana', '2026-10-11T09:00:00Z')];
    const ok = await getHomeFeed({ view: 'latest', period: 'week' });
    expect(ok.success && ok.data.map((o) => o.id)).toEqual(['c1']);
  });

  it('el orden cronológico sin vista (type=recent) aplica la misma regla', async () => {
    expect(isCommunityOnlyFeed(null, 'recent')).toBe(true);
    expect(isCommunityOnlyFeed('latest', 'trending')).toBe(true);
    expect(isCommunityOnlyFeed('vitales', 'trending')).toBe(false);
    expect(isCommunityOnlyFeed('top', 'trending')).toBe(false);
    state.rows = [row('h1', DB_HUNTER, 'Hunter', '2026-10-11T10:00:00Z'), row('c1', HUMAN, 'Ana', '2026-10-11T09:00:00Z')];
    const result = await getHomeFeed({ type: 'recent' });
    expect(result.success && result.data.map((o) => o.id)).toEqual(['c1']);
  });

  it('Día a día y Top no consultan machine_clients ni excluyen Hunters', async () => {
    state.rows = [row('h1', DB_HUNTER, 'Hunter', '2026-10-11T10:00:00Z', { up_votes: 1 })];
    const vitales = await getHomeFeed({ view: 'vitales', period: 'week' });
    const top = await getHomeFeed({ view: 'top', period: 'week' });
    expect(vitales.success && vitales.data.map((o) => o.id)).toEqual(['h1']);
    expect(top.success && top.data.map((o) => o.id)).toEqual(['h1']);
    expect(state.calls.some((c) => c.table === 'machine_clients')).toBe(false);
  });
});

describe('getHomeFeed: origen por id de autor', () => {
  beforeEach(() => {
    state.rows = [];
    state.error = null;
    state.machineClients = [];
    state.machineClientsError = null;
    state.calls = [];
    resetMachineAuthorCacheForTests();
    vi.stubEnv('BOT_INGEST_USER_ID', BOT);
    vi.stubEnv('BOT_INGEST_USER_ID_TECH', '');
    vi.stubEnv('BOT_INGEST_USER_ID_STAPLES', '');
    vi.stubEnv('MCP_BOT_AUTHOR_USER_IDS', `  ${MCP_AUTHOR} ,`);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('marca máquina solo a ids configurados, aunque el nombre visible diga otra cosa', async () => {
    state.rows = [
      row('bot', BOT, 'Ximena', '2026-10-11T10:00:00Z'),
      row('mcp', MCP_AUTHOR, 'Cazador', '2026-10-11T09:00:00Z'),
      row('impostor', HUMAN, 'Aventa Bot', '2026-10-11T08:00:00Z'),
      row('sin_autor', null, 'Usuario', '2026-10-11T07:00:00Z'),
      row('autor_vacio', '   ', 'Usuario', '2026-10-11T06:00:00Z'),
    ];
    const result = await getHomeFeed({ view: 'vitales', period: 'week', limit: 10 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((o) => [o.id, o.origin])).toEqual([
      ['bot', 'machine'],
      ['mcp', 'machine'],
      ['impostor', 'community'],
      ['sin_autor', 'community'],
      ['autor_vacio', 'community'],
    ]);
    expect(result.data.find((o) => o.id === 'autor_vacio')?.created_by).toBeNull();
  });

  it('sin ids configurados todo es comunidad en el origen de la card', async () => {
    vi.stubEnv('BOT_INGEST_USER_ID', '');
    vi.stubEnv('MCP_BOT_AUTHOR_USER_IDS', '');
    state.rows = [row('bot', BOT, 'Aventa Bot', '2026-10-11T10:00:00Z')];
    const result = await getHomeFeed({ view: 'vitales', period: 'week' });
    expect(result.success && result.data[0].origin).toBe('community');
  });

  it('pide created_by y expires_at y normaliza la vigencia a ISO', async () => {
    state.rows = [
      row('vigente', HUMAN, 'Ana', '2026-10-11T10:00:00Z', { expires_at: '2026-10-20 00:00:00+00' }),
      row('sin_vigencia', HUMAN, 'Ana', '2026-10-11T09:00:00Z'),
    ];
    const result = await getHomeFeed({ view: 'vitales', period: 'week' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((o) => o.expires_at)).toEqual(['2026-10-20T00:00:00.000Z', null]);
    const select = state.calls.find((c) => c.method === 'select')?.args[0] as string;
    expect(select).toMatch(/\bcreated_by\b/);
    expect(select).toMatch(/\bexpires_at\b/);
    expect(state.calls.find((c) => c.method === 'from')?.args[0]).toBe('ofertas_ranked_general');
  });

  it('un error de la consulta no produce datos', async () => {
    state.error = { message: 'boom' };
    const result = await getHomeFeed({ view: 'latest', period: 'week' });
    expect(result.success).toBe(false);
  });

  it('el origen llega a la card y Recientes descarta en el cliente cualquier oferta de máquina', async () => {
    state.rows = [row('m1', BOT, 'Ximena', '2026-10-11T10:00:00Z'), row('c1', HUMAN, 'Ana', '2026-10-11T07:00:00Z')];
    const result = await getHomeFeed({ view: 'vitales', period: 'week' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const cards = result.data.map((o) => mapOfferToCard(o as unknown as FeedApiItemShape));
    expect(cards.map((c) => c.origin)).toEqual(['machine', 'community']);
    expect(processHomeFeedList(cards, 'latest', 10).map((c) => c.id)).toEqual(['c1']);
  });
});
