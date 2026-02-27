import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const limiters: Record<string, Ratelimit> = {};

function getRatelimit(key: string, limit: number, window: Duration): Ratelimit | null {
  if (limiters[key]) return limiters[key];
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  limiters[key] = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
  });
  return limiters[key];
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
  const rl = getRatelimit('default', 30, '1 m');
  if (!rl) return { success: true };
  const { success } = await rl.limit(identifier);
  if (success) return { success: true };
  return { success: false, status: 429 };
}

/** reports: 10/min | comments: 20/min | events: 60/min | offers: 5/min */
export async function enforceRateLimitCustom(
  identifier: string,
  preset: 'reports' | 'comments' | 'events' | 'offers'
): Promise<EnforceResult> {
  const configs: Record<string, [number, Duration]> = {
    reports: [10, '1 m'],
    comments: [20, '1 m'],
    events: [60, '1 m'],
    offers: [5, '1 m'],
  };
  const [limit, window] = configs[preset];
  const rl = getRatelimit(`rl:${preset}`, limit, window);
  if (!rl) return { success: true };
  const { success } = await rl.limit(identifier);
  if (success) return { success: true };
  return { success: false, status: 429 };
}
