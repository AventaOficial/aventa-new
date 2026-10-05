/**
 * Lectura (sólo GET, vía REST) del marcador de entorno del Redis para el preflight.
 * Con un Redis físico compartido cada entorno tiene su propio marcador, fijado a mano por el operador:
 *   SET aventa:staging:environment staging
 *   SET aventa:production:environment production
 * Nunca hay una key global con dos valores posibles. El runtime verifica el mismo marcador
 * (lib/server/scopedRedis.ts).
 */

import {
  redisEnvironmentMarkerKey,
  type RedisEnvironment,
  type RedisMarkerResult,
} from '@/lib/server/redisEnvironment';

export type { RedisMarkerResult };

/** Sólo GET de `aventa:<expected>:environment`. Nunca devuelve el valor leído ni las credenciales. */
export async function readRedisEnvironmentMarker(
  env: NodeJS.ProcessEnv,
  expected: RedisEnvironment,
  fetchImpl: typeof fetch = fetch,
): Promise<RedisMarkerResult> {
  const url = (env.UPSTASH_REDIS_REST_URL ?? '').trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
  if (!url || !token) return 'not_checked';
  try {
    if (new URL(url).protocol !== 'https:') return 'unreachable';
  } catch {
    return 'unreachable';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const key = encodeURIComponent(redisEnvironmentMarkerKey(expected));
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/get/${key}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return 'unreachable';
    const body = (await res.json()) as { result?: unknown };
    if (body.result == null) return 'missing';
    return String(body.result).trim().toLowerCase() === expected ? 'match' : 'mismatch';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}
