import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const limiters: Record<string, Ratelimit> = {};

let hasWarnedNoRedis = false;

/** Ventana fija en memoria por instancia (fallback si no hay Upstash; en serverless no es global entre regiones). */
type MemBucket = { resetAt: number; count: number };
const memoryStore = new Map<string, MemBucket>();
const MEMORY_PRUNE_INTERVAL = 400;
let memoryTick = 0;

function durationToMs(window: Duration): number {
  const m = /^(\d+)\s*(s|m|h)$/i.exec(String(window));
  if (!m) return 60_000;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === 's') return n * 1000;
  if (u === 'm') return n * 60 * 1000;
  if (u === 'h') return n * 3600 * 1000;
  return 60_000;
}

function memoryAllow(key: string, limit: number, windowMs: number): boolean {
  memoryTick++;
  if (memoryTick % MEMORY_PRUNE_INTERVAL === 0) {
    const now = Date.now();
    for (const [k, b] of memoryStore) {
      if (now > b.resetAt) memoryStore.delete(k);
    }
  }
  const now = Date.now();
  let b = memoryStore.get(key);
  if (!b || now > b.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count < limit) {
    b.count++;
    return true;
  }
  return false;
}

function getRatelimit(key: string, limit: number, window: Duration): Ratelimit | null {
  if (limiters[key]) return limiters[key];
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!hasWarnedNoRedis && process.env.NODE_ENV === 'production') {
      hasWarnedNoRedis = true;
      console.warn(
        '[rateLimit] Sin Upstash Redis: se usa límite en memoria por instancia. Configura UPSTASH_* para escala multi-región y límites coherentes.'
      );
    }
    return null;
  }
  const redis = new Redis({ url, token });
  limiters[key] = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
  });
  return limiters[key];
}

function readPositiveIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function applyAdaptiveMultiplier(baseLimit: number): number {
  const multiplier = readPositiveIntEnv('RATE_LIMIT_MULTIPLIER') ?? 1;
  return Math.max(1, baseLimit * multiplier);
}

export type EnforceResult =
  | { success: true }
  | { success: false; status: 429 };

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/** Límite por defecto: 30 req/min (track-view, votes, upload) */
export async function enforceRateLimit(identifier: string): Promise<EnforceResult> {
  const defaultLimit = applyAdaptiveMultiplier(readPositiveIntEnv('RATE_LIMIT_DEFAULT_PER_MIN') ?? 30);
  const rl = getRatelimit('default', defaultLimit, '1 m');
  if (rl) {
    const { success } = await rl.limit(identifier);
    return success ? { success: true } : { success: false, status: 429 };
  }
  const ok = memoryAllow(`def:${identifier}`, defaultLimit, durationToMs('1 m'));
  return ok ? { success: true } : { success: false, status: 429 };
}

/** reports | comments | events | offers | parseOffer | feed (API feed público, alto por IP) */
export async function enforceRateLimitCustom(
  identifier: string,
  preset: 'reports' | 'comments' | 'events' | 'offers' | 'parseOffer' | 'feed'
): Promise<EnforceResult> {
  const configs: Record<string, [number, Duration, string]> = {
    reports: [10, '1 m', 'RATE_LIMIT_REPORTS_PER_MIN'],
    comments: [20, '1 m', 'RATE_LIMIT_COMMENTS_PER_MIN'],
    events: [60, '1 m', 'RATE_LIMIT_EVENTS_PER_MIN'],
    offers: [5, '1 m', 'RATE_LIMIT_OFFERS_PER_MIN'],
    parseOffer: [20, '1 m', 'RATE_LIMIT_PARSE_OFFER_PER_MIN'],
    feed: [120, '1 m', 'RATE_LIMIT_FEED_PER_MIN'],
  };
  const [baseLimit, window, envName] = configs[preset];
  const limit = applyAdaptiveMultiplier(readPositiveIntEnv(envName) ?? baseLimit);
  const rl = getRatelimit(`rl:${preset}`, limit, window);
  if (rl) {
    const { success } = await rl.limit(identifier);
    return success ? { success: true } : { success: false, status: 429 };
  }
  const ok = memoryAllow(`c:${preset}:${identifier}`, limit, durationToMs(window));
  return ok ? { success: true } : { success: false, status: 429 };
}
