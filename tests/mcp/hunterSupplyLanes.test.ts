import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMemoryDb, mcpUniqueIndexes, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';
import { generateMachineToken } from '@/lib/mcp/tokens';
import type { ValidCandidate } from '@/lib/mcp/candidates';
import type { PreparedMachineCandidate } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';

const owner = vi.hoisted(() => ({ result: { user: { id: 'owner-0000-4000-8000-000000000001' }, role: 'owner' } as Record<string, unknown> }));
const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/lib/server/requireAdmin', () => ({ requireOwner: vi.fn(async () => owner.result) }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => memorySupabase(state.db as MemoryDb) }));
vi.mock('@/lib/offers/batch/service', () => ({
  appendBatchEvent: vi.fn(async () => undefined),
  recountBatch: vi.fn(async () => undefined),
}));

const collection = await import('@/app/api/admin/machine-clients/route');
const single = await import('@/app/api/admin/machine-clients/[id]/route');
const { authenticateMachineClient } = await import('@/lib/mcp/auth');
const { enqueueHunterOffer } = await import('@/lib/offers/ingestion/enqueueHunterOffer');
const { loadOfferHunterCodes } = await import('@/lib/offers/offerHunterCodes');
const { parseMachineClientEdit, toPublicMachineClient } = await import('@/lib/mcp/machineClients');
const { supplyHunterProjection } = await import('@/lib/product/hunters/load');
const { teamAuthorCard } = await import('@/lib/product/presentation/teamAuthor');
const {
  SUPPLY_HUNTER_CODES,
  hunterByCode,
  hunterCodeFromBotMeta,
  presentAuthor,
  toSupplyHunterCode,
} = await import('@/lib/product/hunters/identity');

const OWNER_ID = 'owner-0000-4000-8000-000000000001';
const BOT_AUTHOR = 'b0b0b0b0-0000-4000-8000-00000000000b';
const HUMAN = 'cccccccc-0000-4000-8000-00000000000c';

const prevEnv = { ...process.env };
beforeEach(() => {
  owner.result = { user: { id: OWNER_ID }, role: 'owner' };
  process.env.MCP_BOT_AUTHOR_USER_IDS = BOT_AUTHOR;
  state.db = createMemoryDb({
    unique: mcpUniqueIndexes(),
    tables: {
      profiles: [{ id: BOT_AUTHOR, display_name: 'Aventa MCP Supply' }, { id: HUMAN, display_name: 'Ana' }],
      user_roles: [],
      machine_clients: [],
    },
  });
});
afterEach(() => {
  process.env = { ...prevEnv };
});

describe('hunters de suministro', () => {
  it('Ximena, Kai y Éléonore; un slug guardado se normaliza a su code', () => {
    expect([...SUPPLY_HUNTER_CODES]).toEqual(['ximena', 'kai', 'eleonore']);
    expect(toSupplyHunterCode('ximena-fuego')).toBe('ximena');
    expect(toSupplyHunterCode('eleonore-noir')).toBe('eleonore');
    expect(toSupplyHunterCode('KAI')).toBe('kai');
    expect(toSupplyHunterCode('kenji')).toBeNull();
    expect(toSupplyHunterCode(42)).toBeNull();
  });

  it('Éléonore y Kai usan sus imágenes, sin ícono inventado', () => {
    const eleonore = hunterByCode('eleonore')!;
    expect(eleonore.avatarUrl).toBe('/hunters/eleonore/avatar.jpg');
    expect(eleonore.coverUrl).toBe('/hunters/eleonore/cover.jpg');
    expect(eleonore.specialty).toMatch(/moda/i);
    const kai = hunterByCode('kai')!;
    expect(kai.avatarUrl).toBe('/hunters/kai/avatar.jpg');
    expect(kai.coverUrl).toBe('/hunters/kai/cover.jpg');
    expect(kai.icon).toBeNull();
    expect(kai.specialty).toMatch(/tecnolog/i);
    for (const code of ['eleonore', 'kai']) {
      for (const file of ['avatar.jpg', 'cover.jpg']) {
        expect(existsSync(join(process.cwd(), 'public/hunters', code, file))).toBe(true);
      }
    }
  });

  it('perfil público para los tres; otro hunter del canon sigue sin proyección', () => {
    expect(supplyHunterProjection('kai-shin')).toMatchObject({
      code: 'kai',
      status: 'active',
      avatarUrl: '/hunters/kai/avatar.jpg',
      coverUrl: '/hunters/kai/cover.jpg',
    });
    expect(supplyHunterProjection('eleonore-noir')).toMatchObject({ code: 'eleonore', avatarUrl: '/hunters/eleonore/avatar.jpg' });
    expect(supplyHunterProjection('ximena-fuego')).toMatchObject({ code: 'ximena' });
    expect(supplyHunterProjection('livia-samba')).toBeNull();
  });

  it('la ficha del equipo describe la especialidad de cada hunter', () => {
    expect(teamAuthorCard(hunterByCode('kai')!).functionLabel).toBe('Top tecnología');
    expect(teamAuthorCard(hunterByCode('eleonore')!).functionLabel).toBe('Moda, tenis y perfumes');
  });

  it('bot_meta.hunter_code sólo acepta codes de suministro', () => {
    expect(hunterCodeFromBotMeta({ hunter_code: 'kai' })).toBe('kai');
    expect(hunterCodeFromBotMeta({ hunter_code: 'kenji' })).toBeNull();
    expect(hunterCodeFromBotMeta({ hunter_code: '<script>' })).toBeNull();
    expect(hunterCodeFromBotMeta(null)).toBeNull();
    expect(hunterCodeFromBotMeta('kai')).toBeNull();
  });

  it('un bot sin code sigue presentándose como Ximena', () => {
    const presented = presentAuthor({ userId: BOT_AUTHOR, displayName: 'Aventa MCP Supply' });
    expect(presented.kind === 'hunter' && presented.hunter.code).toBe('ximena');
  });
});

describe('autenticación MCP con hunter', () => {
  function seed(db: MemoryDb, over: Record<string, unknown> = {}) {
    const t = generateMachineToken();
    db.tables.machine_clients.push({
      id: `c-${t.prefix}`,
      name: 'grok-tech',
      token_prefix: t.prefix,
      token_hash: t.hash,
      scopes: ['candidates:submit'],
      status: 'active',
      author_profile_id: BOT_AUTHOR,
      daily_candidate_cap: 50,
      expires_at: null,
      revoked_at: null,
      ...over,
    });
    return t;
  }

  it('el cliente lleva el code guardado; un valor fuera de formato no pasa', async () => {
    const db = state.db as MemoryDb;
    const kai = seed(db, { hunter_code: 'kai' });
    const legacy = seed(db, { hunter_code: 'ximena-fuego' });
    const bad = seed(db, { hunter_code: '<b>' });
    const none = seed(db);
    const sb = memorySupabase(db) as unknown as SupabaseClient;
    expect(await authenticateMachineClient(sb, `Bearer ${kai.token}`)).toMatchObject({ ok: true, client: { hunterCode: 'kai' } });
    expect(await authenticateMachineClient(sb, `Bearer ${legacy.token}`)).toMatchObject({ ok: true, client: { hunterCode: 'ximena-fuego' } });
    expect(await authenticateMachineClient(sb, `Bearer ${bad.token}`)).toMatchObject({ ok: true, client: { hunterCode: null } });
    expect(await authenticateMachineClient(sb, `Bearer ${none.token}`)).toMatchObject({ ok: true, client: { hunterCode: null } });
  });

  it('sin la columna hunter_code, la autenticación sigue funcionando', async () => {
    const t = generateMachineToken();
    const row = {
      id: 'c1', name: 'grok', token_hash: t.hash, scopes: ['candidates:submit'], status: 'active',
      author_profile_id: BOT_AUTHOR, daily_candidate_cap: 10, expires_at: null, revoked_at: null,
    };
    const selects: string[] = [];
    const sb = {
      from: () => ({
        select: (columns: string) => {
          selects.push(columns);
          const chain = {
            eq: () => chain,
            maybeSingle: async () =>
              columns.includes('hunter_code')
                ? { data: null, error: { message: 'column machine_clients.hunter_code does not exist' } }
                : { data: row, error: null },
          };
          return chain;
        },
      }),
    } as unknown as SupabaseClient;
    expect(await authenticateMachineClient(sb, `Bearer ${t.token}`)).toMatchObject({ ok: true, client: { id: 'c1', hunterCode: null } });
    expect(selects).toHaveLength(2);
    expect(selects[1]).not.toContain('hunter_code');
  });
});

describe('el hunter del cliente queda en bot_meta', () => {
  const candidate: ValidCandidate = {
    index: 0,
    url: 'https://www.amazon.com.mx/dp/B0TECHAAAA',
    identityKey: 'amz:B0TECHAAAA',
    title: 'Audífonos inalámbricos',
    price: 900,
    originalPrice: null,
    note: null,
    hunterComment: null,
    observedAt: '2026-10-13T17:00:00Z',
  };
  const prepared: PreparedMachineCandidate = {
    pageKind: 'PRODUCT', product: true, title: 'Audífonos inalámbricos con cancelación de ruido',
    imageUrl: 'https://m.media-amazon.com/images/I/a.jpg', imageUrls: [], store: 'Amazon', price: 900,
    originalPrice: null, priceSource: 'amazon_html', originalPriceSource: null, category: 'Tecnología',
    currency: 'MXN', retailer: 'amazon', imageFailure: null, fetched: true,
  };

  async function botMeta(hunterCode?: string | null) {
    const chain = { eq: () => chain };
    const supabase = { from: () => ({ update: () => chain }) } as unknown as SupabaseClient;
    const ingest = vi.fn(async () => ({ ok: true as const, offerId: 'o1' }));
    await enqueueHunterOffer(
      supabase,
      { batchId: 'b1', createdBy: BOT_AUTHOR, machineClientId: 'mc1', hunterCode, candidate },
      {
        negativeMemory: async () => ({ suppressed: false, reason: null, fingerprint: null }),
        prepare: async () => prepared,
        ingest: ingest as never,
        lowQualityTitle: () => false,
      },
    );
    return (ingest.mock.calls[0] as unknown as [unknown, { offerExtras: { bot_meta: Record<string, unknown> } }])[1].offerExtras.bot_meta;
  }

  it('con hunter: se estampa su code; sin hunter o fuera de suministro: no hay rastro', async () => {
    expect((await botMeta('kai')).hunter_code).toBe('kai');
    expect((await botMeta('ximena-fuego')).hunter_code).toBe('ximena');
    expect(await botMeta('livia')).not.toHaveProperty('hunter_code');
    expect(await botMeta(null)).not.toHaveProperty('hunter_code');
    expect(await botMeta()).not.toHaveProperty('hunter_code');
  });
});

describe('lectura pública del hunter de la oferta', () => {
  function fake(rows: unknown[], error: unknown = null) {
    const calls: { columns: string; ids: string[] }[] = [];
    const sb = {
      from: () => ({
        select: (columns: string) => ({
          in: async (_col: string, ids: string[]) => {
            calls.push({ columns, ids });
            return { data: rows, error };
          },
        }),
      }),
    };
    return { sb, calls };
  }

  it('sólo consulta ofertas de autores máquina e ignora codes desconocidos', async () => {
    const { sb, calls } = fake([
      { id: 'o1', hunter_code: 'eleonore' },
      { id: 'o2', hunter_code: 'kenji' },
    ]);
    const codes = await loadOfferHunterCodes(sb, [
      { id: 'o1', created_by: BOT_AUTHOR },
      { id: 'o2', created_by: BOT_AUTHOR },
      { id: 'o3', created_by: HUMAN },
    ]);
    expect(calls).toEqual([{ columns: 'id, hunter_code:bot_meta->>hunter_code', ids: ['o1', 'o2'] }]);
    expect([...codes]).toEqual([['o1', 'eleonore']]);
  });

  it('sin bots no consulta; si falla, cae al predeterminado', async () => {
    const empty = fake([]);
    expect((await loadOfferHunterCodes(empty.sb, [{ id: 'o3', created_by: HUMAN }])).size).toBe(0);
    expect(empty.calls).toHaveLength(0);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = fake([], { message: 'boom' });
    expect((await loadOfferHunterCodes(failing.sb, [{ id: 'o1', created_by: BOT_AUTHOR }])).size).toBe(0);
    spy.mockRestore();
  });
});

describe('Owner: clientes MCP por hunter', () => {
  const valid = { name: 'grok-tech', authorProfileId: BOT_AUTHOR, scopes: ['candidates:submit', 'catalog:read'] };
  const post = (body: unknown) =>
    collection.POST(
      new Request('https://aventa.test/api/admin/machine-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  const patch = (id: string, body: unknown) =>
    single.PATCH(
      new Request(`https://aventa.test/api/admin/machine-clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );

  it('crea con hunter y rechaza uno que no es de suministro', async () => {
    const res = await post({ ...valid, hunterCode: 'kai' });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { client: { hunterCode: string } }).client.hunterCode).toBe('kai');
    expect((state.db as MemoryDb).tables.machine_clients[0].hunter_code).toBe('kai');
    for (const hunterCode of ['kenji', 'ximena-fuego', 'KAI ', 7]) {
      expect((await post({ ...valid, hunterCode })).status).toBe(400);
    }
    expect((state.db as MemoryDb).tables.machine_clients).toHaveLength(1);
  });

  it('el listado trae opciones de hunter y autores por nombre, sin token ni hash', async () => {
    await post({ ...valid, hunterCode: 'eleonore' });
    const body = (await (await collection.GET(new Request('https://aventa.test/x'))).json()) as {
      clients: { hunterCode: string }[];
      hunters: { code: string; displayName: string }[];
      authors: { id: string; displayName: string | null }[];
      hunterCodeReady: boolean;
    };
    expect(body.hunterCodeReady).toBe(true);
    expect(body.clients[0].hunterCode).toBe('eleonore');
    expect(body.hunters.map((h) => h.code)).toEqual(['ximena', 'kai', 'eleonore']);
    expect(body.authors).toEqual([{ id: BOT_AUTHOR, displayName: 'Aventa MCP Supply' }]);
    expect(JSON.stringify(body)).not.toMatch(/token_hash|avk_[0-9a-f]{12}_/);
  });

  it('editar cambia nombre, hunter, cuota y vencimiento; no toca token, scopes ni autor', async () => {
    await post({ ...valid, hunterCode: 'ximena' });
    const before = { ...(state.db as MemoryDb).tables.machine_clients[0] };
    const id = String(before.id);
    const res = await patch(id, {
      action: 'edit',
      name: 'grok-moda',
      hunterCode: 'eleonore',
      dailyCandidateCap: 80,
      scopes: ['admin'],
      authorProfileId: HUMAN,
      token_hash: 'x',
    });
    expect(res.status).toBe(200);
    const row = (state.db as MemoryDb).tables.machine_clients[0];
    expect(row).toMatchObject({ name: 'grok-moda', hunter_code: 'eleonore', daily_candidate_cap: 80 });
    expect(row.scopes).toEqual(before.scopes);
    expect(row.author_profile_id).toBe(BOT_AUTHOR);
    expect(row.token_hash).toBe(before.token_hash);
    expect(row.status).toBe('active');

    expect((await patch(id, { action: 'edit', hunterCode: null })).status).toBe(200);
    expect((state.db as MemoryDb).tables.machine_clients[0].hunter_code).toBeNull();
  });

  it('editar valida y no aplica a revocados', async () => {
    await post(valid);
    const id = String((state.db as MemoryDb).tables.machine_clients[0].id);
    for (const body of [
      { action: 'edit' },
      { action: 'edit', name: '' },
      { action: 'edit', hunterCode: 'kenji' },
      { action: 'edit', dailyCandidateCap: 0 },
      { action: 'edit', expiresAt: '2000-01-01T00:00:00Z' },
    ]) {
      expect((await patch(id, body)).status).toBe(400);
    }
    expect((await patch(id, { action: 'revoke' })).status).toBe(200);
    expect((await patch(id, { action: 'edit', name: 'otro' })).status).toBe(409);
    expect((state.db as MemoryDb).tables.machine_clients[0].name).toBe('grok-tech');
  });

  it('un slug guardado se muestra al Owner con su code', async () => {
    (state.db as MemoryDb).tables.machine_clients.push({ id: 'legacy', name: 'v2', scopes: [], status: 'active', hunter_code: 'ximena-fuego' });
    const body = (await (await collection.GET(new Request('https://aventa.test/x'))).json()) as { clients: { hunterCode: string }[] };
    expect(body.clients[0].hunterCode).toBe('ximena');
  });

  it('la capa MCP no conoce el canon: sin política, ningún hunter se admite', () => {
    expect(parseMachineClientEdit({ hunterCode: 'kai' })).toEqual({ ok: false, error: 'Hunter no permitido' });
    expect(parseMachineClientEdit({ hunterCode: 'kai' }, new Date(), { allowedHunterCodes: ['kai'] })).toEqual({
      ok: true,
      patch: { hunter_code: 'kai' },
    });
    expect(parseMachineClientEdit({ expiresAt: null })).toEqual({ ok: true, patch: { expires_at: null } });
    expect(toPublicMachineClient({ id: 'x', hunter_code: 'Robert); drop' }).hunterCode).toBeNull();
  });
});
