import type { HunterBreakerState, HunterHealthStatus, HunterSourceHealth } from './types';

export const HUNTER_FAILURE_THRESHOLD = 3;

/** Cooldowns en ms según error. */
export function cooldownMsForErrorCode(errorCode: string | null | undefined): number {
  const code = (errorCode ?? '').trim();
  if (code === '429') return 120 * 60 * 1000;
  if (code === '401' || code === '403') return 60 * 60 * 1000;
  if (/^5\d\d$/.test(code)) return 10 * 60 * 1000;
  if (code === 'timeout' || code === 'network') return 10 * 60 * 1000;
  return 30 * 60 * 1000;
}

export function isCooldownElapsed(
  health: Pick<HunterSourceHealth, 'breakerState' | 'cooldownUntil'>,
  now: Date
): boolean {
  if (health.breakerState !== 'open') return true;
  if (!health.cooldownUntil) return true;
  return now.getTime() >= new Date(health.cooldownUntil).getTime();
}

/**
 * Decide si esta corrida debe ejecutar collect.
 * open + cooldown activo → no.
 * open + cooldown vencido → half_open (probe).
 */
export function shouldAttemptCollect(
  health: HunterSourceHealth,
  now: Date
): { attempt: boolean; nextBreaker: HunterBreakerState } {
  if (!health.enabled || health.status === 'disabled') {
    return { attempt: false, nextBreaker: health.breakerState };
  }
  if (health.breakerState === 'closed' || health.breakerState === 'half_open') {
    return { attempt: true, nextBreaker: health.breakerState };
  }
  // open
  if (isCooldownElapsed(health, now)) {
    return { attempt: true, nextBreaker: 'half_open' };
  }
  return { attempt: false, nextBreaker: 'open' };
}

export type BreakerTransitionInput = {
  previous: HunterSourceHealth;
  now: Date;
  collectOk: boolean;
  errorCode?: string | null;
  itemsFound: number;
  /** Si true, no cuenta como fallo (yield vacío sano). */
  softZeroResult?: boolean;
  probedAsHalfOpen: boolean;
};

export type BreakerTransitionResult = {
  breakerState: HunterBreakerState;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  status: HunterHealthStatus;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

export function applyBreakerTransition(input: BreakerTransitionInput): BreakerTransitionResult {
  const { previous, now, collectOk, errorCode, softZeroResult, probedAsHalfOpen } = input;
  const iso = now.toISOString();

  if (collectOk) {
    const zeroYield = softZeroResult && input.itemsFound === 0;
    return {
      breakerState: 'closed',
      consecutiveFailures: 0,
      cooldownUntil: null,
      status: zeroYield ? 'degraded' : 'healthy',
      lastSuccessAt: iso,
      lastFailureAt: previous.lastFailureAt,
    };
  }

  // Fallo real
  const failures = previous.consecutiveFailures + 1;
  const openBreaker = failures >= HUNTER_FAILURE_THRESHOLD || probedAsHalfOpen;
  const cooldownUntil = openBreaker
    ? new Date(now.getTime() + cooldownMsForErrorCode(errorCode)).toISOString()
    : previous.cooldownUntil;

  return {
    breakerState: openBreaker ? 'open' : previous.breakerState === 'half_open' ? 'open' : 'closed',
    consecutiveFailures: failures,
    cooldownUntil: openBreaker ? cooldownUntil : null,
    status: openBreaker ? 'down' : 'degraded',
    lastSuccessAt: previous.lastSuccessAt,
    lastFailureAt: iso,
  };
}

export function deriveDisplayStatus(health: HunterSourceHealth, now: Date): HunterHealthStatus {
  if (!health.enabled || health.status === 'disabled') return 'disabled';
  if (health.breakerState === 'open') {
    if (isCooldownElapsed(health, now)) return 'degraded'; // listo para half-open
    return 'down';
  }
  if (health.breakerState === 'half_open') return 'degraded';

  const lastSuccess = health.lastSuccessAt ? new Date(health.lastSuccessAt).getTime() : 0;
  const staleMs = health.expectedIntervalMs * 2;
  if (lastSuccess && now.getTime() - lastSuccess > staleMs) {
    return 'degraded';
  }
  if (health.status === 'degraded') return 'degraded';
  if (health.lastSuccessAt) return 'healthy';
  return health.status === 'down' ? 'down' : 'degraded';
}
