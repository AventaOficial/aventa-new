import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { isProductionRuntime } from '@/lib/server/moneyPathFreeze';
import { decideRateLimitBackend } from '@/lib/server/rateLimitPolicy';
import { incrementLaunchMetric } from '@/lib/observability/launchMetrics';

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
  const b = memoryStore.get(key);
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
        '[rateLimit] Sin Upstash Redis. Rutas no críticas usan memoria por instancia. Rutas críticas en producción responden 503 hasta configurar UPSTASH_*.'
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
  | { success: false; status: 429 | 503; code?: 'rate_limited' | 'rate_limit_backend_unavailable' };

const REDIS_LIMIT_TIMEOUT_MS = 1200;

function hasDistributedBackend(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function limitWithTimeout(rl: Ratelimit, identifier: string): Promise<'ok' | 'blocked' | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      rl.limit(identifier).then((value) => (value.success ? 'ok' : 'blocked') as 'ok' | 'blocked'),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), REDIS_LIMIT_TIMEOUT_MS);
      }),
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function enforceWithPolicy(
  identifier: string,
  presetKey: string,
  limit: number,
  window: Duration,
  critical: boolean
): Promise<EnforceResult> {
  const backend = decideRateLimitBackend({
    hasDistributedBackend: hasDistributedBackend(),
    production: isProductionRuntime(),
    critical,
  });

  if (backend === 'deny') {
    incrementLaunchMetric('rate_limit_backend_denied');
    incrementLaunchMetric('critical_errors');
    return { success: false, status: 503, code: 'rate_limit_backend_unavailable' };
  }

  if (backend === 'distributed') {
    const rl = getRatelimit(presetKey, limit, window);
    if (rl) {
      const outcome = await limitWithTimeout(rl, identifier);
      if (outcome === 'ok') return { success: true };
      if (outcome === 'blocked') {
        incrementLaunchMetric('rate_limit_blocks');
        return { success: false, status: 429, code: 'rate_limited' };
      }
      if (critical && isProductionRuntime()) {
        incrementLaunchMetric('rate_limit_backend_denied');
        return { success: false, status: 503, code: 'rate_limit_backend_unavailable' };
      }
    }
  }

  incrementLaunchMetric('rate_limit_memory_fallback');
  const ok = memoryAllow(`${presetKey}:${identifier}`, limit, durationToMs(window));
  if (ok) return { success: true };
  incrementLaunchMetric('rate_limit_blocks');
  return { success: false, status: 429, code: 'rate_limited' };
}

/** Límite por defecto: 30 req/min. critical=true en producción exige Upstash. */
export async function enforceRateLimit(
  identifier: string,
  opts?: { critical?: boolean }
): Promise<EnforceResult> {
  const defaultLimit = applyAdaptiveMultiplier(readPositiveIntEnv('RATE_LIMIT_DEFAULT_PER_MIN') ?? 30);
  return enforceWithPolicy(identifier, 'default', defaultLimit, '1 m', opts?.critical === true);
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

const CRITICAL_PRESETS = new Set(['reports', 'comments', 'offers']);

/** reports | comments | events | offers | parseOffer | feed | telemetryView | telemetryOutbound | clientEvents | clientEventAlerts | similarOffers | uploadImage */
export async function enforceRateLimitCustom(
  identifier: string,
  preset:
    | 'reports'
    | 'comments'
    | 'events'
    | 'offers'
    | 'parseOffer'
    | 'feed'
    | 'telemetryView'
    | 'telemetryOutbound'
    | 'clientEvents'
    | 'clientEventAlerts'
    | 'similarOffers'
    | 'uploadImage'
): Promise<EnforceResult> {
  const configs: Record<string, [number, Duration, string]> = {
    reports: [10, '1 m', 'RATE_LIMIT_REPORTS_PER_MIN'],
    comments: [20, '1 m', 'RATE_LIMIT_COMMENTS_PER_MIN'],
    events: [60, '1 m', 'RATE_LIMIT_EVENTS_PER_MIN'],
    offers: [5, '1 m', 'RATE_LIMIT_OFFERS_PER_MIN'],
    parseOffer: [20, '1 m', 'RATE_LIMIT_PARSE_OFFER_PER_MIN'],
    feed: [120, '1 m', 'RATE_LIMIT_FEED_PER_MIN'],
    telemetryView: [1, '30 m', 'RATE_LIMIT_TELEMETRY_VIEW_PER_WINDOW'],
    telemetryOutbound: [1, '10 m', 'RATE_LIMIT_TELEMETRY_OUTBOUND_PER_WINDOW'],
    clientEvents: [20, '1 m', 'RATE_LIMIT_CLIENT_EVENTS_PER_MIN'],
    clientEventAlerts: [1, '30 m', 'RATE_LIMIT_CLIENT_EVENT_ALERTS_PER_WINDOW'],
    similarOffers: [30, '1 m', 'RATE_LIMIT_SIMILAR_OFFERS_PER_MIN'],
    uploadImage: [15, '1 h', 'RATE_LIMIT_UPLOAD_IMAGE_PER_HOUR'],
  };
  const [baseLimit, window, envName] = configs[preset];
  const limit = applyAdaptiveMultiplier(readPositiveIntEnv(envName) ?? baseLimit);
  return enforceWithPolicy(identifier, `rl:${preset}`, limit, window, CRITICAL_PRESETS.has(preset));
}
