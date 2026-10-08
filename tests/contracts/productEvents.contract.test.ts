import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_FUNNEL_EVENTS,
  PRODUCT_ACTOR_CLASSES,
  PRODUCT_EVENT_VERSION,
  WRITABLE_PRODUCT_EVENTS,
  sanitizeFunnelMetadata,
} from '@/lib/analytics/funnelTaxonomy';
import {
  anonymousCookieOptions,
  createAnonymousId,
  ensureAnonymousCookie,
  isAnonymousId,
  readAnonymousId,
} from '@/lib/analytics/anonymousIdentity';
import { resolveProductActorClass } from '@/lib/analytics/productActorClass';
import {
  buildSearchMetadata,
  isPublicProductPath,
  loadMoreMetadata,
  phase1DedupeKey,
} from '@/lib/analytics/productEventContract';
import { incrementLaunchMetric, resetLaunchMetricsForTests, snapshotLaunchMetrics } from '@/lib/observability/launchMetrics';

const HUMAN = '11111111-1111-4111-8111-111111111111';
const MACHINE = '22222222-2222-4222-8222-222222222222';
const SYSTEM = '33333333-3333-4333-8333-333333333333';
const ANON = '44444444-4444-4444-8444-444444444444';
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  insertError: null as { code?: string; message: string } | null,
  machineAuthors: new Set<string>(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table === 'machine_clients') {
        return {
          select() {
            return {
              eq(_column: string, value: string) {
                return {
                  async limit() {
                    return {
                      data: db.machineAuthors.has(value) ? [{ id: 'mc-1' }] : [],
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'product_events') {
        return {
          async insert(row: Record<string, unknown>) {
            if (!db.insertError) db.rows.push(row);
            return { error: db.insertError };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { recordProductEvent } = await import('@/lib/analytics/recordProductEvent');
const { scheduleProductEvent } = await import('@/lib/analytics/scheduleProductEvent');

function src(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const prevEnv = { ...process.env };

beforeEach(() => {
  db.rows.length = 0;
  db.insertError = null;
  db.machineAuthors.clear();
  delete process.env.MCP_BOT_AUTHOR_USER_IDS;
  delete process.env.BOT_INGEST_USER_ID;
  delete process.env.BOT_INGEST_USER_ID_TECH;
  delete process.env.BOT_INGEST_USER_ID_STAPLES;
  resetLaunchMetricsForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...prevEnv };
  vi.restoreAllMocks();
});

describe('product event allowlist', () => {
  it('conserva los nombres ya persistibles y agrega solo los cuatro de comportamiento', () => {
    for (const name of ['page_view', 'feed_view', 'search', 'load_more', 'offer_view', 'offer_click', 'outbound_click', 'vote', 'save', 'comment', 'submission', 'signup', 'login']) {
      expect(CANONICAL_FUNNEL_EVENTS).toContain(name);
    }
    expect(WRITABLE_PRODUCT_EVENTS).toEqual([
      'page_view',
      'feed_view',
      'search',
      'load_more',
      'submission',
      'login',
      'hunter_intent',
    ]);
    expect(src('docs/supabase-migrations/20261008_hunter_intent_event.sql')).toMatch(/'hunter_intent'/);
    expect(src('docs/supabase-migrations/20261008_hunter_intent_event.sql')).not.toMatch(/creator_rewards|payout_intents|affiliate_ledger/i);
    expect(PRODUCT_EVENT_VERSION).toBe(1);
    expect(PRODUCT_ACTOR_CLASSES).toEqual(['HUMAN', 'MACHINE_HUNTER', 'SYSTEM', 'ANONYMOUS']);
  });

  it('la migración no recrea la tabla ni toca dinero, y el CHECK incluye la taxonomía', () => {
    const sql = src('docs/supabase-migrations/20261008_product_events_foundation.sql');
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/reward_outbound_clicks|creator_rewards|payout_intents|affiliate_ledger/i);
    expect(sql).toMatch(/actor_class text NOT NULL DEFAULT 'ANONYMOUS'/);
    expect(sql).toMatch(/event_version smallint NOT NULL DEFAULT 1/);
    expect(sql).toMatch(/NOT VALID/);
    expect(sql).toMatch(/idx_product_events_dedupe/);
    expect(sql).toMatch(/idx_product_events_user_time/);
    expect(sql).toMatch(/idx_product_events_anon_time/);
    expect(sql).toMatch(/WHERE anonymous_id IS NOT NULL/);
    expect(sql).toMatch(/idx_product_events_actor_name_time/);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON public.product_events TO service_role/);
    expect(sql).not.toMatch(/GRANT\s+UPDATE/i);
    for (const name of CANONICAL_FUNNEL_EVENTS) {
      expect(sql).toContain(`'${name}'`);
    }
  });

  it('rechaza vote, save, comment, signup, offer_view y outbound_click sin insertar', async () => {
    for (const event of ['vote', 'save', 'comment', 'signup', 'offer_view', 'outbound_click', 'favorite']) {
      const result = await recordProductEvent({ event, userId: HUMAN, metadata: { path: '/' }, nowMs: NOW });
      expect(result.ok).toBe(false);
    }
    expect(db.rows).toHaveLength(0);
  });
});

describe('actor_class', () => {
  const supabase = {
    from(table: string) {
      if (table !== 'machine_clients') throw new Error(table);
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                async limit() {
                  return { data: db.machineAuthors.has(value) ? [{ id: 'mc-1' }] : [], error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  it('ANONYMOUS cuando no hay usuario, aunque resolveActorType trataría el id vacío como HUMAN', async () => {
    expect(await resolveProductActorClass(supabase as never, null)).toBe('ANONYMOUS');
    expect(await resolveProductActorClass(supabase as never, '  ')).toBe('ANONYMOUS');
  });

  it('HUMAN, MACHINE_HUNTER y SYSTEM salen del resolver existente', async () => {
    expect(await resolveProductActorClass(supabase as never, HUMAN)).toBe('HUMAN');
    process.env.MCP_BOT_AUTHOR_USER_IDS = MACHINE;
    expect(await resolveProductActorClass(supabase as never, MACHINE)).toBe('MACHINE_HUNTER');
    delete process.env.MCP_BOT_AUTHOR_USER_IDS;
    db.machineAuthors.add(MACHINE);
    expect(await resolveProductActorClass(supabase as never, MACHINE)).toBe('MACHINE_HUNTER');
    process.env.BOT_INGEST_USER_ID = SYSTEM;
    expect(await resolveProductActorClass(supabase as never, SYSTEM)).toBe('SYSTEM');
  });

  it('guarda la clase al escribir y un cambio de entorno posterior no la reescribe', async () => {
    process.env.MCP_BOT_AUTHOR_USER_IDS = MACHINE;
    const wrote = await recordProductEvent({
      event: 'page_view',
      userId: MACHINE,
      anonymousId: ANON,
      metadata: { path: '/oferta/demo' },
      nowMs: NOW,
    });
    expect(wrote.ok).toBe(true);
    expect(db.rows[0]?.actor_class).toBe('MACHINE_HUNTER');
    expect(db.rows[0]?.event_version).toBe(1);
    delete process.env.MCP_BOT_AUTHOR_USER_IDS;
    expect(await resolveProductActorClass(supabase as never, MACHINE)).toBe('HUMAN');
    expect(db.rows[0]?.actor_class).toBe('MACHINE_HUNTER');
    expect(src('lib/analytics/recordProductEvent.ts')).not.toMatch(/\.update\(/);
  });

  it('el user_id autenticado manda sobre anonymous_id', async () => {
    const wrote = await recordProductEvent({
      event: 'page_view',
      userId: HUMAN,
      anonymousId: ANON,
      metadata: { path: '/' },
      nowMs: NOW,
    });
    expect(wrote.ok).toBe(true);
    expect(db.rows[0]).toMatchObject({
      actor_class: 'HUMAN',
      user_id: HUMAN,
      anonymous_id: ANON,
    });
  });
});

describe('anonymous cookie', () => {
  it('genera un id opaco httpOnly, Secure en producción y SameSite=Lax', () => {
    const id = createAnonymousId();
    expect(isAnonymousId(id)).toBe(true);
    expect(id).not.toMatch(/@|clabe|rfc/i);
    expect(anonymousCookieOptions('development')).toMatchObject({ httpOnly: true, secure: false, sameSite: 'lax' });
    expect(anonymousCookieOptions('production')).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
  });

  it('no rota un id válido y reemplaza uno inválido', () => {
    const jar = new Map<string, string>();
    const request = { cookies: { get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined) } };
    const response = {
      cookies: {
        set: (name: string, value: string) => {
          jar.set(name, value);
        },
      },
    };
    const first = ensureAnonymousCookie(request, response);
    const second = ensureAnonymousCookie(request, response);
    expect(second).toBe(first);
    jar.set('aventa_anon', 'not-an-id');
    const rotated = ensureAnonymousCookie(request, response);
    expect(rotated).not.toBe('not-an-id');
    expect(readAnonymousId(rotated)).toBe(rotated);
  });
});

describe('metadata y dedupe', () => {
  it('quita PII, IP, token, cookie, RFC y CLABE', () => {
    expect(
      sanitizeFunnelMetadata({
        path: '/descubre',
        email: 'a@b.com',
        ip: '1.1.1.1',
        token: 'sekret',
        cookie: 'session',
        authorization: 'Bearer x',
        clabe: '012345678901234567',
        rfc: 'XAXX010101000',
        password: 'no',
      }),
    ).toEqual({ path: '/descubre' });
  });

  it('page_view, feed_view, search y load_more quedan en filas distintas y con su dedupe', async () => {
    expect(
      await recordProductEvent({
        event: 'page_view',
        userId: HUMAN,
        metadata: { path: '/descubre' },
        source: 'document',
        nowMs: NOW,
      }),
    ).toEqual({ ok: true });
    expect(
      await recordProductEvent({
        event: 'feed_view',
        anonymousId: ANON,
        metadata: { feed_type: 'home', view: 'latest', period: 'week', result_count: 12 },
        source: 'api/feed/home',
        nowMs: NOW,
      }),
    ).toEqual({ ok: true });
    expect(
      await recordProductEvent({
        event: 'feed_view',
        userId: HUMAN,
        metadata: { feed_type: 'for_you', result_count: 4 },
        source: 'api/feed/for-you',
        nowMs: NOW,
      }),
    ).toEqual({ ok: true });
    const laptop = buildSearchMetadata('  laptop  ', 3);
    const audifonos = buildSearchMetadata('audifonos', 1);
    expect(laptop?.query_normalized).toBe('laptop');
    expect(
      phase1DedupeKey({ event: 'search', actor: HUMAN, metadata: { ...laptop! }, nowMs: NOW }),
    ).not.toBe(phase1DedupeKey({ event: 'search', actor: HUMAN, metadata: { ...audifonos! }, nowMs: NOW }));
    await recordProductEvent({ event: 'search', userId: HUMAN, metadata: laptop!, nowMs: NOW });
    await recordProductEvent({ event: 'search', userId: HUMAN, metadata: audifonos!, nowMs: NOW });
    const pageA = loadMoreMetadata({ feedType: 'home', cursor: 'cursor-page-2', view: 'latest' });
    const pageB = loadMoreMetadata({ feedType: 'home', cursor: 'cursor-page-3', view: 'latest' });
    expect(pageA?.cursor_fp).not.toBe(pageB?.cursor_fp);
    expect(pageA?.cursor_fp).not.toContain('cursor-page');
    expect(
      phase1DedupeKey({ event: 'load_more', actor: HUMAN, metadata: { ...pageA! }, nowMs: NOW }),
    ).not.toBe(phase1DedupeKey({ event: 'load_more', actor: HUMAN, metadata: { ...pageB! }, nowMs: NOW }));
    await recordProductEvent({ event: 'load_more', userId: HUMAN, metadata: pageA!, nowMs: NOW });
    await recordProductEvent({ event: 'load_more', userId: HUMAN, metadata: pageB!, nowMs: NOW });

    const names = db.rows.map((row) => row.event_name);
    expect(names).toEqual(['page_view', 'feed_view', 'feed_view', 'search', 'search', 'load_more', 'load_more']);
    const searchKeys = db.rows.filter((row) => row.event_name === 'search').map((row) => row.dedupe_key);
    expect(searchKeys[0]).not.toBe(searchKeys[1]);
    expect(String(searchKeys[0])).not.toContain('laptop');
    const moreKeys = db.rows.filter((row) => row.event_name === 'load_more').map((row) => row.dedupe_key);
    expect(moreKeys[0]).not.toBe(moreKeys[1]);
  });

  it('no guarda el texto cuando la búsqueda parece email o un número largo', () => {
    const email = buildSearchMetadata('persona@correo.com', 0);
    expect(JSON.stringify(email)).not.toContain('persona@correo.com');
    expect(email?.query_hash).toBeTruthy();
    const digits = buildSearchMetadata('012345678901234567', 0);
    expect(JSON.stringify(digits)).not.toContain('012345678901234567');
  });

  it('no cuenta admin, equipo ni team como page view público', () => {
    expect(isPublicProductPath('/')).toBe(true);
    expect(isPublicProductPath('/oferta/abc')).toBe(true);
    expect(isPublicProductPath('/admin/owner')).toBe(false);
    expect(isPublicProductPath('/equipo/moderacion')).toBe(false);
    expect(isPublicProductPath('/team/gate')).toBe(false);
    expect(isPublicProductPath('/operaciones')).toBe(false);
    expect(isPublicProductPath('/descubre?token=abc')).toBe(true);
    expect(isPublicProductPath('/admin?token=abc')).toBe(false);
  });
});

describe('rutas y firewall', () => {
  it('las rutas de negocio no escriben el mirror y el funnel lee la tabla autoritativa', () => {
    expect(src('app/api/votes/route.ts')).not.toContain('recordProductEvent');
    expect(src('app/api/offers/[offerId]/comments/route.ts')).not.toContain('recordProductEvent');
    expect(src('lib/offers/applyFavoriteToggle.ts')).not.toContain('recordProductEvent');
    expect(src('app/auth/callback/route.ts')).not.toContain("event: 'signup'");
    const funnel = src('lib/analytics/funnelSnapshot.ts');
    expect(funnel).toContain("countRows('profiles'");
    expect(funnel).toContain("countRows('offer_votes'");
    expect(funnel).toContain("countRows('offer_favorites'");
    expect(funnel).toContain("countRows('comments'");
    expect(funnel).not.toContain("countProductEvents('signup'");
    expect(funnel).not.toContain("countProductEvents('vote'");
    expect(funnel).not.toContain("countProductEvents('save'");
    expect(funnel).not.toContain("countProductEvents('comment'");
    expect(funnel).toContain('not D1/D7/D30');
  });

  it('instrumenta feed, search y page_view fuera del middleware', () => {
    expect(src('app/api/feed/home/route.ts')).toContain('observeFeedRequest');
    expect(src('app/api/feed/for-you/route.ts')).toContain("feedType: 'for_you'");
    expect(src('app/api/search/offers/route.ts')).toContain('observeSearchRequest');
    expect(src('app/components/analytics/ProductPageView.tsx')).toContain("event: 'page_view'");
    const middleware = src('middleware.ts');
    expect(middleware).toContain('ensureAnonymousCookie');
    expect(middleware).toContain('PRODUCT_PATH_HEADER');
    expect(src('lib/analytics/anonymousIdentity.ts')).toContain('x-aventa-pathname');
    expect(middleware).not.toContain('recordProductEvent');
    expect(middleware).not.toContain('product_events');
  });

  it('un fallo de insert no lanza y no abre rewards ni payout', async () => {
    db.insertError = { code: 'XX000', message: 'db down' };
    await expect(
      recordProductEvent({
        event: 'page_view',
        userId: HUMAN,
        metadata: { path: '/' },
        nowMs: NOW,
      }),
    ).resolves.toEqual({ ok: false });
    expect(snapshotLaunchMetrics().analytics_write_failed).toBeGreaterThan(0);

    expect(() =>
      scheduleProductEvent(async () => {
        throw new Error('observer');
      }),
    ).not.toThrow();

    const analytics = [
      'lib/analytics/recordProductEvent.ts',
      'lib/analytics/observeProductBehavior.ts',
      'lib/analytics/productActorClass.ts',
      'lib/analytics/scheduleProductEvent.ts',
    ]
      .map((file) => src(file))
      .join('\n');
    expect(analytics).not.toMatch(/lib\/rewards|lib\/economy|lib\/finance|recordAttributedClick|moneyPathFreeze|creator_rewards|payout_intents/);
    expect(src('lib/server/moneyPathFreeze.ts')).toContain('MONEY_PATH_FROZEN');
  });
});

describe('schedule no usa el contador de éxito como fallo', () => {
  it('el helper de métrica sigue disponible para el observer', () => {
    incrementLaunchMetric('analytics_events');
    expect(snapshotLaunchMetrics().analytics_events).toBe(1);
  });
});
