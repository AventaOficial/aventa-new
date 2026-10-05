import type { Redis } from '@upstash/redis';
import { getUpstashRedis } from '@/lib/server/redisClient';
import {
  isKeyInEnvironment,
  redisEnvironmentMarkerKey,
  resolveRedisAccess,
  scopedRedisKey,
  type RedisEnvironment,
  type RedisMarkerResult,
} from '@/lib/server/redisEnvironment';

/**
 * Acceso de la app a Redis con aislamiento por entorno (Redis físico compartido).
 * Fuera de este módulo y de rateLimit.ts nadie debe construir keys de Redis.
 */

const MARKER_TTL_MS = 60_000;
const MARKER_TIMEOUT_MS = 1200;
const verifiedUntil = new Map<RedisEnvironment, number>();

type RedisReader = Pick<Redis, 'get'>;

/** Lee `aventa:<entorno>:environment`. Sólo un `match` se cachea, y sólo 60 s por instancia. */
export async function verifyRuntimeRedisMarker(redis: RedisReader, environment: RedisEnvironment): Promise<RedisMarkerResult> {
  const now = Date.now();
  if ((verifiedUntil.get(environment) ?? 0) > now) return 'match';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      redis.get<unknown>(redisEnvironmentMarkerKey(environment)).then((value) => ({ value })),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), MARKER_TIMEOUT_MS);
      }),
    ]);
    if (outcome === 'timeout') return 'unreachable';
    if (outcome.value == null) return 'missing';
    if (String(outcome.value).trim().toLowerCase() !== environment) return 'mismatch';
    verifiedUntil.set(environment, now + MARKER_TTL_MS);
    return 'match';
  } catch {
    return 'unreachable';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type AppRedis = {
  /** `legacy` sólo en Aventa Production sin AVENTA_REDIS_ENVIRONMENT (keys históricas `aventa:<sufijo>`). */
  mode: 'scoped' | 'legacy_production';
  key(suffix: string): string;
  get<T>(suffix: string): Promise<T | null>;
  set(suffix: string, value: string, opts: { ex: number }): Promise<unknown>;
  incr(suffix: string): Promise<number>;
};

function wrap(redis: Redis, mode: AppRedis['mode'], key: (suffix: string) => string): AppRedis {
  return {
    mode,
    key,
    get: <T>(suffix: string) => redis.get<T>(key(suffix)),
    set: (suffix, value, opts) => redis.set(key(suffix), value, opts),
    incr: (suffix) => redis.incr(key(suffix)),
  };
}

function scopedKeyBuilder(environment: RedisEnvironment) {
  return (suffix: string) => {
    const key = scopedRedisKey(environment, suffix);
    if (!isKeyInEnvironment(environment, key)) throw new Error('redis key escaped its environment namespace');
    return key;
  };
}

function legacyKeyBuilder(suffix: string): string {
  const s = suffix.trim();
  if (!s || /^aventa:/i.test(s)) throw new Error('redis key suffix must be relative');
  return `aventa:${s}`;
}

/**
 * Redis de la app o null (sin Upstash, entorno no declarado/inconsistente o marcador que no coincide).
 * null significa "sin Redis": el llamador decide su degradación, nunca otro namespace.
 */
export async function getAppRedis(): Promise<AppRedis | null> {
  const access = resolveRedisAccess();
  if (access.mode === 'none') return null;
  const redis = getUpstashRedis();
  if (!redis) return null;
  if (access.mode === 'legacy_production') return wrap(redis, 'legacy_production', legacyKeyBuilder);
  if ((await verifyRuntimeRedisMarker(redis, access.environment)) !== 'match') return null;
  return wrap(redis, 'scoped', scopedKeyBuilder(access.environment));
}
