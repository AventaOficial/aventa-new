/**
 * M4.5 — Deterministic sandbox payout provider (staging/tests only).
 * Never moves money. Never holds credentials. Never mutates DB.
 * Implements the canonical PayoutProvider interface (no parallel abstraction).
 */

import type {
  PayoutIntentRow,
  PayoutProvider,
  PayoutProviderReconcileResult,
  PayoutProviderSubmitResult,
} from './types';
import { PAYOUT_INTENT_PROVIDER_STUB } from './types';

export const PAYOUT_INTENT_PROVIDER_SANDBOX = 'sandbox' as const;

export type SandboxSubmitScenario =
  | 'immediate_success'
  | 'initiated'
  | 'failure'
  | 'timeout'
  | 'unknown'
  | 'unavailable'
  | 'malformed';

export type SandboxReconcileScenario =
  | 'success'
  | 'failure'
  | 'unknown'
  | 'unavailable'
  | 'malformed'
  | 'duplicate';

export type SandboxProviderOptions = {
  submit?: SandboxSubmitScenario;
  reconcile?: SandboxReconcileScenario;
  /** Stable provider reference for this claim. Deterministic when set. */
  providerReference?: string | null;
  /**
   * When true, reconcile success returns a DIFFERENT provider reference
   * (for mismatch tests). Default false.
   */
  mismatchProviderReference?: boolean;
  /** Force amount in reference payload checks via note — engine validates amount from intent. */
  label?: string;
};

export type SandboxPayoutProvider = PayoutProvider & {
  kind: 'sandbox';
  submitScenario: SandboxSubmitScenario;
  reconcileScenario: SandboxReconcileScenario;
  providerReference: string | null;
};

function stableRef(options: SandboxProviderOptions, intent: PayoutIntentRow): string {
  if (options.providerReference?.trim()) return options.providerReference.trim();
  if (typeof intent.meta?.provider_reference === 'string' && intent.meta.provider_reference.trim()) {
    return intent.meta.provider_reference.trim();
  }
  return `sandbox:${intent.idempotency_key}`;
}

/**
 * Deterministic sandbox. Scenario controlled explicitly — no Math.random().
 */
export function createSandboxPayoutProvider(
  options: SandboxProviderOptions = {},
): SandboxPayoutProvider {
  const submitScenario = options.submit ?? 'initiated';
  const reconcileScenario = options.reconcile ?? 'unknown';
  const configuredRef = options.providerReference?.trim() || null;

  return {
    id: PAYOUT_INTENT_PROVIDER_SANDBOX,
    kind: 'sandbox',
    submitScenario,
    reconcileScenario,
    providerReference: configuredRef,
    async submit(intent: PayoutIntentRow): Promise<PayoutProviderSubmitResult> {
      if (submitScenario === 'unavailable') {
        return { outcome: 'timeout', reason: 'sandbox_provider_unavailable' };
      }
      if (submitScenario === 'malformed') {
        // Represent malformed as timeout/unknown — never invent SUCCESS.
        return { outcome: 'timeout', reason: 'sandbox_malformed_response' };
      }
      const ref = stableRef(options, intent);
      if (submitScenario === 'immediate_success') {
        return { outcome: 'success', externalRef: ref };
      }
      if (submitScenario === 'failure') {
        return { outcome: 'failure', reason: 'sandbox_failure' };
      }
      if (submitScenario === 'initiated') {
        return { outcome: 'initiated', externalRef: ref };
      }
      // timeout | unknown
      return { outcome: 'timeout', reason: 'sandbox_timeout' };
    },
    async reconcile(intent: PayoutIntentRow): Promise<PayoutProviderReconcileResult> {
      if (reconcileScenario === 'unavailable') {
        return { outcome: 'unknown', reason: 'sandbox_reconcile_unavailable' };
      }
      if (reconcileScenario === 'malformed') {
        return { outcome: 'unknown', reason: 'sandbox_reconcile_malformed' };
      }
      const ref = options.mismatchProviderReference
        ? `sandbox:MISMATCH:${intent.idempotency_key}`
        : stableRef(options, intent);
      if (reconcileScenario === 'success' || reconcileScenario === 'duplicate') {
        return { outcome: 'success', externalRef: ref };
      }
      if (reconcileScenario === 'failure') {
        return { outcome: 'failure', reason: 'sandbox_reconcile_failure' };
      }
      return { outcome: 'unknown', reason: 'sandbox_still_unknown' };
    },
  };
}

/** Alias: stub id resolves to sandbox for staging selection compatibility. */
export function createStubCompatibleSandbox(
  options: SandboxProviderOptions = {},
): SandboxPayoutProvider {
  const p = createSandboxPayoutProvider(options);
  return {
    ...p,
    id: PAYOUT_INTENT_PROVIDER_STUB,
  };
}
