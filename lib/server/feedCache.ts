import type { GetHomeFeedSuccess } from '@/lib/offers/feedService';
import { isUpstashConfigured } from '@/lib/server/redisClient';
import { resolveRedisAccess } from '@/lib/server/redisEnvironment';
import { getAppRedis } from '@/lib/server/scopedRedis';

/** Sufijos relativos: el namespace del entorno lo pone getAppRedis(). */
const VERSION_KEY = 'feed:home:ver';

export type HomeFeedCacheParams = {
  limit: number;
  type: 'trending' | 'recent';
  view?: 'vitales' | 'top' | 'latest' | null;
  period?: 'day' | 'week' | 'month';
  category?: string | null;
  store?: string | null;
};

function feedCacheTtlSeconds(): number {
  const raw = process.env.FEED_CACHE_TTL_SECONDS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 45;
}

function isFeedCacheEnabled(): boolean {
  const flag = (process.env.FEED_CACHE_ENABLED ?? 'true').trim().toLowerCase();
  return flag !== 'false' && flag !== '0';
}

function buildParamsKey(params: HomeFeedCacheParams): string {
  const parts = [
    `l${params.limit}`,
    `t${params.type}`,
    `v${params.view ?? 'none'}`,
    `p${params.period ?? 'day'}`,
    `c${params.category?.trim() || 'all'}`,
    `s${params.store?.trim() || 'all'}`,
  ];
  return parts.join(':');
}

type AppRedis = NonNullable<Awaited<ReturnType<typeof getAppRedis>>>;

async function getCacheVersion(redis: AppRedis): Promise<number> {
  const v = await redis.get<number>(VERSION_KEY);
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function getCachedHomeFeed(
  params: HomeFeedCacheParams
): Promise<GetHomeFeedSuccess | null> {
  if (!isFeedCacheEnabled()) return null;
  const redis = await getAppRedis();
  if (!redis) return null;
  const version = await getCacheVersion(redis);
  const raw = await redis.get<string>(`feed:home:v${version}:${buildParamsKey(params)}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GetHomeFeedSuccess;
    if (parsed?.success === true && Array.isArray(parsed.data)) return parsed;
  } catch {
    return null;
  }
  return null;
}

export async function setCachedHomeFeed(
  params: HomeFeedCacheParams,
  payload: GetHomeFeedSuccess
): Promise<void> {
  if (!isFeedCacheEnabled()) return;
  const redis = await getAppRedis();
  if (!redis) return;
  const version = await getCacheVersion(redis);
  const ttl = feedCacheTtlSeconds();
  if (ttl <= 0) return;
  await redis.set(`feed:home:v${version}:${buildParamsKey(params)}`, JSON.stringify(payload), { ex: ttl });
}

/** Invalida todas las entradas del feed home (bump de versión). */
export async function invalidateHomeFeedCache(): Promise<boolean> {
  const redis = await getAppRedis();
  if (!redis) return false;
  await redis.incr(VERSION_KEY);
  return true;
}

export function feedCacheMeta(): { enabled: boolean; ttlSeconds: number; redis: boolean } {
  return {
    enabled: isFeedCacheEnabled(),
    ttlSeconds: feedCacheTtlSeconds(),
    redis: isUpstashConfigured() && resolveRedisAccess().mode !== 'none',
  };
}
