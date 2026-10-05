/**
 * Where the rate limiter is allowed to run.
 * LOCAL/TEST: memory fallback is allowed.
 * PRODUCTION + critical mutation: distributed backend required (fail-closed).
 * PRODUCTION + non-critical read: memory fallback allowed (fail-open) and metered.
 * DISTRIBUTED-ONLY presets: distributed backend required in every runtime, preview/staging included,
 * and only through a declared, verified Redis environment (`aventa:<env>:ratelimit`, lib/server/redisEnvironment.ts).
 */

export const DISTRIBUTED_ONLY_RATE_LIMIT_PRESETS = ['mcp'] as const;

export const CRITICAL_RATE_LIMIT_PRESETS = [
  'reports',
  'comments',
  'offers',
  'votes',
  'outbound',
  'accountDeletion',
  'auth',
  'mcp',
] as const;

export type CriticalRateLimitPreset = (typeof CRITICAL_RATE_LIMIT_PRESETS)[number];

export type RateLimitBackend = 'distributed' | 'memory' | 'deny';

export function decideRateLimitBackend(input: {
  hasDistributedBackend: boolean;
  production: boolean;
  critical: boolean;
  distributedOnly?: boolean;
}): RateLimitBackend {
  if (input.hasDistributedBackend) return 'distributed';
  if (input.distributedOnly) return 'deny';
  if (input.production && input.critical) return 'deny';
  return 'memory';
}
