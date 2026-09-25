/**
 * Day 6 — Canonical per-source discovery outcomes.
 *
 * Never map BLOCKED_EXTERNAL / BLOCKED_AUTH to FAILED.
 * Empty yield is NO_RESULTS, not SUCCESS and not FAILED.
 */

export const SOURCE_DISCOVERY_STATUSES = [
  'SUCCESS',
  'PARTIAL',
  'BLOCKED_EXTERNAL',
  'BLOCKED_AUTH',
  'NO_RESULTS',
  'FAILED',
  'SKIPPED',
  'DEGRADED',
] as const;

export type SourceDiscoveryStatus = (typeof SOURCE_DISCOVERY_STATUSES)[number];

/** Legacy continuous-discovery statuses (Day 3). */
export type LegacyDiscoveryStatus =
  | 'success'
  | 'blocked'
  | 'retryable'
  | 'failed'
  | 'skipped'
  | 'empty';

/**
 * Classify from Hunter run error codes / HTTP signals.
 * Auth failures stay BLOCKED_AUTH; anti-bot / IP / robots stay BLOCKED_EXTERNAL.
 */
export function classifySourceDiscoveryStatus(input: {
  skippedDisabled?: boolean;
  skippedByBreaker?: boolean;
  ok?: boolean;
  itemsFound?: number;
  errorCode?: string | null;
  errorMessageSafe?: string | null;
}): SourceDiscoveryStatus {
  if (input.skippedDisabled) return 'SKIPPED';
  if (input.skippedByBreaker) return 'DEGRADED';

  const code = `${input.errorCode ?? ''} ${input.errorMessageSafe ?? ''}`.toLowerCase();
  const auth =
    code.includes('401') ||
    code.includes('unauthorized') ||
    code.includes('oauth') ||
    code.includes('missing_credentials') ||
    code.includes('token');
  const external =
    code.includes('403') ||
    code.includes('blocked') ||
    code.includes('captcha') ||
    code.includes('robots') ||
    code.includes('anti-bot') ||
    code.includes('challenge');

  if (input.ok === false) {
    if (auth) return 'BLOCKED_AUTH';
    if (external) return 'BLOCKED_EXTERNAL';
    if (code.includes('429') || code.includes('timeout') || /5\d\d/.test(code)) {
      return 'DEGRADED';
    }
    return 'FAILED';
  }

  const found = input.itemsFound ?? 0;
  if (found === 0) return 'NO_RESULTS';
  return 'SUCCESS';
}

export function legacyStatusFromCanonical(
  status: SourceDiscoveryStatus,
): LegacyDiscoveryStatus {
  switch (status) {
    case 'SUCCESS':
    case 'PARTIAL':
      return 'success';
    case 'BLOCKED_EXTERNAL':
    case 'BLOCKED_AUTH':
      return 'blocked';
    case 'DEGRADED':
      return 'retryable';
    case 'NO_RESULTS':
      return 'empty';
    case 'SKIPPED':
      return 'skipped';
    case 'FAILED':
    default:
      return 'failed';
  }
}

export function isCycleTerminatingSourceStatus(status: SourceDiscoveryStatus): boolean {
  // No source status alone terminates the multi-source cycle.
  void status;
  return false;
}

/** Operator one-liner: why this source produced zero offers. */
export function explainZeroYield(status: SourceDiscoveryStatus, errorCode?: string | null): string {
  switch (status) {
    case 'SKIPPED':
      return 'Source disabled or not configured — cycle continued with other sources.';
    case 'BLOCKED_AUTH':
      return `Auth/credentials blocked (${errorCode ?? 'auth'}) — not a product failure.`;
    case 'BLOCKED_EXTERNAL':
      return `External/network block (${errorCode ?? 'blocked'}) — isolation kept cycle alive.`;
    case 'DEGRADED':
      return `Source degraded/cooldown (${errorCode ?? 'degraded'}) — retry later.`;
    case 'NO_RESULTS':
      return 'Source responded with zero product candidates.';
    case 'FAILED':
      return `Source failed (${errorCode ?? 'failed'}) — other sources unaffected.`;
    case 'PARTIAL':
      return 'Partial yield — some candidates dropped before funnel.';
    case 'SUCCESS':
      return 'Source succeeded; zero offers means loss downstream (identity/DQE/S6.1/write).';
    default:
      return 'Unknown source status.';
  }
}
