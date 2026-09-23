/**
 * Where the rate limiter is allowed to run.
 * LOCAL/TEST: memory fallback is allowed.
 * PRODUCTION + critical mutation: distributed backend required (fail-closed).
 * PRODUCTION + non-critical read: memory fallback allowed (fail-open) and metered.
 */

export const CRITICAL_RATE_LIMIT_PRESETS = [
  'reports',
  'comments',
  'offers',
  'votes',
  'outbound',
  'accountDeletion',
  'auth',
] as const;

export type CriticalRateLimitPreset = (typeof CRITICAL_RATE_LIMIT_PRESETS)[number];

export type RateLimitBackend = 'distributed' | 'memory' | 'deny';

export function decideRateLimitBackend(input: {
  hasDistributedBackend: boolean;
  production: boolean;
  critical: boolean;
}): RateLimitBackend {
  if (input.hasDistributedBackend) return 'distributed';
  if (input.production && input.critical) return 'deny';
  return 'memory';
}
