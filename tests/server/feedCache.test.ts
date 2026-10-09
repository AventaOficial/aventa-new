import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/server/redisClient', () => ({
  getUpstashRedis: vi.fn(),
  isUpstashConfigured: vi.fn(() => true),
}));

import { getUpstashRedis } from '@/lib/server/redisClient';
import {
  getCachedHomeFeed,
  invalidateHomeFeedCache,
  setCachedHomeFeed,
} from '@/lib/server/feedCache';

describe('feedCache', () => {
  const store = new Map<string, unknown>();
  const mockRedis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(),
    incr: vi.fn(),
  };
  const prevEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    store.set('aventa:staging:environment', 'staging');
    vi.mocked(getUpstashRedis).mockReturnValue(mockRedis as never);
    process.env.VERCEL_ENV = 'preview';
    process.env.AVENTA_REDIS_ENVIRONMENT = 'staging';
    delete process.env.AVENTA_SUPABASE_TARGET;
    delete process.env.AVENTA_DEPLOYMENT_SURFACE;
    process.env.FEED_CACHE_ENABLED = 'true';
    process.env.FEED_CACHE_TTL_SECONDS = '45';
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('getCachedHomeFeed devuelve payload parseado', async () => {
    store.set('aventa:staging:feed:home:ver', 0);
    store.set(
      'aventa:staging:feed:home:v0:l20:ttrending:vvitales:pday:call:sall',
      JSON.stringify({ success: true, data: [{ id: '1' }], nextCursor: null })
    );
    const hit = await getCachedHomeFeed({
      limit: 20,
      type: 'trending',
      view: 'vitales',
      period: 'day',
    });
    expect(hit?.success).toBe(true);
    expect(hit?.data).toHaveLength(1);
  });

  it('getCachedHomeFeed acepta el objeto que Upstash ya deserializó', async () => {
    store.set('aventa:staging:feed:home:ver', '40');
    store.set('aventa:staging:feed:home:v40:l2:ttrending:vlatest:pmonth:call:sall', {
      success: true,
      data: [{ id: 'oferta-1' }],
      nextCursor: 'cursor',
    });
    const hit = await getCachedHomeFeed({
      limit: 2,
      type: 'trending',
      view: 'latest',
      period: 'month',
    });
    expect(hit?.data).toHaveLength(1);
    expect(hit?.nextCursor).toBe('cursor');
  });

  it('setCachedHomeFeed guarda con TTL bajo el namespace del entorno', async () => {
    store.set('aventa:staging:feed:home:ver', 2);
    await setCachedHomeFeed(
      { limit: 20, type: 'trending', view: null, period: 'day' },
      { success: true, data: [], nextCursor: null }
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('aventa:staging:feed:home:v2:'),
      expect.any(String),
      { ex: 45 }
    );
  });

  it('invalidateHomeFeedCache incrementa versión', async () => {
    const ok = await invalidateHomeFeedCache();
    expect(ok).toBe(true);
    expect(mockRedis.incr).toHaveBeenCalledWith('aventa:staging:feed:home:ver');
  });
});
