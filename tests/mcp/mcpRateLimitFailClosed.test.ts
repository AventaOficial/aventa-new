import { afterEach, describe, expect, it } from 'vitest';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { decideRateLimitBackend } from '@/lib/server/rateLimitPolicy';

const prevEnv = { ...process.env };
afterEach(() => {
  process.env = { ...prevEnv };
});

function withoutUpstash(vercelEnv: string | undefined) {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnv;
}

describe('rate limit mcp: sin backend distribuido nunca usa memoria', () => {
  it.each(['production', 'preview', 'development', undefined])('VERCEL_ENV=%s sin Upstash => 503', async (vercelEnv) => {
    withoutUpstash(vercelEnv);
    const r = await enforceRateLimitCustom(`mcp:test-${String(vercelEnv)}`, 'mcp');
    expect(r).toEqual({ success: false, status: 503, code: 'rate_limit_backend_unavailable' });
  });

  it('otros presets conservan su política (preview sin Upstash => memoria)', async () => {
    withoutUpstash('preview');
    expect(await enforceRateLimitCustom('feed:test', 'feed')).toEqual({ success: true });
    expect(await enforceRateLimitCustom('offers:test', 'offers')).toEqual({ success: true });
  });

  it('política: distributedOnly deniega en cualquier runtime; con backend usa distribuido', () => {
    for (const production of [true, false]) {
      for (const critical of [true, false]) {
        expect(decideRateLimitBackend({ hasDistributedBackend: false, production, critical, distributedOnly: true })).toBe('deny');
        expect(decideRateLimitBackend({ hasDistributedBackend: true, production, critical, distributedOnly: true })).toBe('distributed');
      }
    }
    expect(decideRateLimitBackend({ hasDistributedBackend: false, production: false, critical: true })).toBe('memory');
  });
});
