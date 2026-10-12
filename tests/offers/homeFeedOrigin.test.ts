import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getHomeFeed contra un cliente Supabase simulado en memoria (sin base de datos real):
 * cada método del builder se registra y `limit()` resuelve las filas del fixture.
 */
type Call = { method: string; args: unknown[] };
const state: { rows: Record<string, unknown>[]; error: { message: string } | null; calls: Call[] } = {
  rows: [],
  error: null,
  calls: [],
};

function queryBuilder() {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['select', 'not', 'in', 'or', 'gte', 'eq', 'order', 'lt']) {
    builder[method] = (...args: unknown[]) => {
      state.calls.push({ method, args });
      return builder;
    };
  }
  builder.limit = async (...args: unknown[]) => {
    state.calls.push({ method: 'limit', args });
    return { data: state.rows, error: state.error };
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => {
  const client = () => ({
    from: (table: string) => {
      state.calls.push({ method: 'from', args: [table] });
      return queryBuilder();
    },
  });
  return { createServerClient: client, createInteractiveServerClient: client };
});

import { getHomeFeed } from '@/lib/offers/feedService';
import { mapOfferToCard, type FeedApiItemShape } from '@/lib/offers/transform';
import { processHomeFeedList } from '@/lib/offers/homeFeedClient';

const BOT = '11111111-1111-4111-8111-111111111111';
const MCP_AUTHOR = '44444444-4444-4444-8444-444444444444';
const HUMAN = '22222222-2222-4222-8222-222222222222';

function row(id: string, createdBy: string | null, displayName: string, createdAt: string, extra: Record<string, unknown> = {}) {
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

describe('getHomeFeed: origen por id de autor', () => {
  beforeEach(() => {
    state.rows = [];
    state.error = null;
    state.calls = [];
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
    const result = await getHomeFeed({ view: 'latest', period: 'week', limit: 10 });
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

  it('sin ids configurados todo es comunidad', async () => {
    vi.stubEnv('BOT_INGEST_USER_ID', '');
    vi.stubEnv('MCP_BOT_AUTHOR_USER_IDS', '');
    state.rows = [row('bot', BOT, 'Aventa Bot', '2026-10-11T10:00:00Z')];
    const result = await getHomeFeed({ view: 'latest', period: 'week' });
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

  it('el origen llega a la card y Recientes limita rachas de máquina', async () => {
    state.rows = [
      row('m1', BOT, 'Ximena', '2026-10-11T10:00:00Z'),
      row('m2', BOT, 'Ximena', '2026-10-11T09:00:00Z'),
      row('m3', MCP_AUTHOR, 'Cazador', '2026-10-11T08:00:00Z'),
      row('c1', HUMAN, 'Aventa Bot', '2026-10-11T07:00:00Z'),
    ];
    const result = await getHomeFeed({ view: 'latest', period: 'week' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const cards = result.data.map((o) => mapOfferToCard(o as unknown as FeedApiItemShape));
    expect(cards.map((c) => c.origin)).toEqual(['machine', 'machine', 'machine', 'community']);
    expect(processHomeFeedList(cards, 'latest', 10).map((c) => c.id)).toEqual(['m1', 'm2', 'c1', 'm3']);
  });
});
