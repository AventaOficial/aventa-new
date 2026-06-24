import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/redisClient', () => ({
  getUpstashRedis: vi.fn(),
}));

import { getUpstashRedis } from '@/lib/server/redisClient';
import {
  getCachedHomeFeed,
  invalidateHomeFeedCache,
  setCachedHomeFeed,
} from '@/lib/server/feedCache';

describe('feedCache', () => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUpstashRedis).mockReturnValue(mockRedis as never);
    process.env.FEED_CACHE_ENABLED = 'true';
    process.env.FEED_CACHE_TTL_SECONDS = '45';
  });

  it('getCachedHomeFeed devuelve payload parseado', async () => {
    mockRedis.get.mockResolvedValueOnce(0).mockResolvedValueOnce(
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

  it('setCachedHomeFeed guarda con TTL', async () => {
    mockRedis.get.mockResolvedValue(2);
    await setCachedHomeFeed(
      { limit: 20, type: 'trending', view: null, period: 'day' },
      { success: true, data: [], nextCursor: null }
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('aventa:feed:home:v2:'),
      expect.any(String),
      { ex: 45 }
    );
  });

  it('invalidateHomeFeedCache incrementa versión', async () => {
    const ok = await invalidateHomeFeedCache();
    expect(ok).toBe(true);
    expect(mockRedis.incr).toHaveBeenCalledWith('aventa:feed:home:ver');
  });
});
