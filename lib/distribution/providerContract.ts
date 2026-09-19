/**
 * Distribution provider adapter contract — C1/C2/C3 authority.
 *
 * Adapters are the ONLY layer that may call external messaging APIs.
 * Core drain/enqueue/reclaim/opsSurface must NOT import provider HTTP.
 *
 * Register new providers via `getDistributionProviderAdapter` overrides in tests,
 * then add a factory in `providers/registry.ts` when implementation is ready.
 */

import { DISTRIBUTION_PROVIDERS } from './constants';
import type {
  DistributionProviderAdapter,
  DistributionPublishFailure,
  DistributionPublishInput,
  DistributionPublishResult,
  DistributionPublishSuccess,
  DistributionPublishUnknown,
} from './providers/types';

/** Required methods every adapter must expose. */
export const DISTRIBUTION_PROVIDER_ADAPTER_REQUIRED = {
  provider: 'readonly DistributionProvider id',
  publish:
    '(input: DistributionPublishInput) => Promise<DistributionPublishResult>',
  health: 'optional — (credentialRef) => Promise<{ ok, detail }>; never log secrets',
} as const;

/**
 * UNKNOWN_OUTCOME semantics (C3).
 *
 * When the provider may have accepted the message but the engine cannot prove
 * success or definite failure (timeout, lost response, missing message id):
 * - Return `{ ok: false, unknownOutcome: true, code, message }`.
 * - Do NOT set `retryable: true` on the same result.
 * - Drain persists `status=unknown_outcome` via `markPublishingUnknownOutcome`.
 * - Drain/reclaim NEVER auto-retry unknown rows.
 * - Operator may call `releaseUnknownOutcomeToRetryable` only after reconcile.
 */
export const DISTRIBUTION_UNKNOWN_OUTCOME_SEMANTICS = {
  adapterReturn: {
    ok: false,
    unknownOutcome: true,
    code: 'provider-specific stable code',
    message: 'redacted, no tokens',
  },
  notEquivalentTo: ['failed', 'retryable', 'published'],
  drainBehavior: 'CAS publishing → unknown_outcome + unknown_outcome event',
  reclaimBehavior:
    'expired lease + publish_attempt evidence → unknown_outcome (not failed)',
  operatorRecovery: 'releaseUnknownOutcomeToRetryable (ops only, CAS)',
} as const;

export type DistributionProviderContractViolation = {
  ok: false;
  violations: string[];
};

export function isDistributionPublishSuccess(
  result: DistributionPublishResult,
): result is DistributionPublishSuccess {
  return result.ok === true;
}

export function isDistributionPublishUnknown(
  result: DistributionPublishResult,
): result is DistributionPublishUnknown {
  return result.ok === false && result.unknownOutcome === true;
}

export function isDistributionPublishFailure(
  result: DistributionPublishResult,
): result is DistributionPublishFailure {
  return result.ok === false && result.unknownOutcome !== true;
}

/**
 * Structural validation — runtime guard for registry/tests.
 * Does not invoke publish (no side effects).
 */
export function validateDistributionProviderAdapter(
  adapter: unknown,
): { ok: true; adapter: DistributionProviderAdapter } | DistributionProviderContractViolation {
  const violations: string[] = [];

  if (!adapter || typeof adapter !== 'object') {
    return { ok: false, violations: ['adapter must be a non-null object'] };
  }

  const a = adapter as Partial<DistributionProviderAdapter>;

  if (typeof a.provider !== 'string' || !a.provider.trim()) {
    violations.push('adapter.provider must be a non-empty string');
  } else if (!(DISTRIBUTION_PROVIDERS as readonly string[]).includes(a.provider)) {
    violations.push(
      `adapter.provider must be one of: ${DISTRIBUTION_PROVIDERS.join(', ')}`,
    );
  }

  if (typeof a.publish !== 'function') {
    violations.push('adapter.publish must be a function');
  }

  if (a.health !== undefined && typeof a.health !== 'function') {
    violations.push('adapter.health must be a function when provided');
  }

  if (violations.length > 0) {
    return { ok: false, violations };
  }

  return { ok: true, adapter: adapter as DistributionProviderAdapter };
}

export function assertDistributionProviderAdapter(
  adapter: unknown,
): DistributionProviderAdapter {
  const result = validateDistributionProviderAdapter(adapter);
  if (!result.ok) {
    throw new Error(
      `Invalid distribution provider adapter: ${result.violations.join('; ')}`,
    );
  }
  return result.adapter;
}

/**
 * Validates a publish result shape (adapter unit tests / controlled scenarios).
 */
export function validateDistributionPublishResult(
  result: DistributionPublishResult,
): { ok: true } | DistributionProviderContractViolation {
  const violations: string[] = [];

  if (result.ok === true) {
    if (typeof result.externalMessageId !== 'string' || !result.externalMessageId.trim()) {
      violations.push('success.externalMessageId must be a non-empty string');
    }
    if (typeof result.provider !== 'string' || !result.provider.trim()) {
      violations.push('success.provider must be a non-empty string');
    }
    return violations.length ? { ok: false, violations } : { ok: true };
  }

  if (result.unknownOutcome === true) {
    if ('retryable' in result && (result as { retryable?: boolean }).retryable === true) {
      violations.push('unknownOutcome results must not set retryable: true');
    }
    if (typeof result.code !== 'string' || !result.code.trim()) {
      violations.push('unknownOutcome.code must be a non-empty string');
    }
    if (typeof result.message !== 'string') {
      violations.push('unknownOutcome.message must be a string');
    }
    return violations.length ? { ok: false, violations } : { ok: true };
  }

  const failure = result as DistributionPublishFailure;
  if (typeof failure.retryable !== 'boolean') {
    violations.push('failure.retryable must be boolean');
  }
  if (typeof failure.code !== 'string' || !failure.code.trim()) {
    violations.push('failure.code must be a non-empty string');
  }
  if (typeof failure.message !== 'string') {
    violations.push('failure.message must be a string');
  }

  return violations.length ? { ok: false, violations } : { ok: true };
}

/** Documented publish input fields adapters must accept (renderer supplies text). */
export type DistributionProviderContractPublishInput = DistributionPublishInput;

/**
 * Compile-time anchor: every registered provider enum value should eventually
 * have an adapter factory. Tests assert telegram + controlled satisfy the contract.
 */
export type DistributionProviderAdapterContract = DistributionProviderAdapter;
