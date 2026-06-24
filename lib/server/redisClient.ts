import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

export function getUpstashRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export function isUpstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}
