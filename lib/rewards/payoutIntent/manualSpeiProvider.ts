/**
 * Manual SPEI provider adapter.
 * Staging: stub/simulation only — never real bank transfer.
 * Outcomes: success | failure | unknown | initiated (no auto-complete).
 */

import type {
  PayoutIntentRow,
  PayoutProvider,
  PayoutProviderReconcileResult,
  PayoutProviderSubmitResult,
} from './types';

export const PAYOUT_INTENT_PROVIDER_MANUAL_SPEI = 'manual_spei' as const;

export type ManualSpeiSubmitScenario =
  | 'success'
  | 'failure'
  | 'unknown'
  | 'initiated';

export type ManualSpeiReconcileScenario = 'success' | 'failure' | 'unknown';

export type ManualSpeiProviderOptions = {
  /** Default success for happy-path admin when explicitly simulating. */
  submit?: ManualSpeiSubmitScenario;
  reconcile?: ManualSpeiReconcileScenario;
  /** When true, caller may write reward_payouts evidence after SUCCESS. Stub=false. */
  recordsHistoricalPayout?: boolean;
  speiReference?: string | null;
  /**
   * Stable provider reference for this claim (SPEI / bank ref).
   * Must stay stable across initiated → confirm for mismatch tests.
   */
  providerReference?: string | null;
};

export type ManualSpeiProvider = PayoutProvider & {
  recordsHistoricalPayout: boolean;
  speiReference: string | null;
  providerReference: string | null;
  scenario: ManualSpeiSubmitScenario;
};

function resolveRef(
  options: ManualSpeiProviderOptions,
  intent: PayoutIntentRow,
  fallback: string,
): string {
  if (options.providerReference?.trim()) return options.providerReference.trim();
  if (options.speiReference?.trim()) return options.speiReference.trim();
  if (typeof intent.meta?.provider_reference === 'string' && intent.meta.provider_reference.trim()) {
    return intent.meta.provider_reference.trim();
  }
  if (typeof intent.meta?.spei_reference === 'string' && intent.meta.spei_reference.trim()) {
    return intent.meta.spei_reference.trim();
  }
  return fallback;
}

/**
 * Stub/simulation provider. Never moves real money.
 * `initiated` → leave SUBMITTED (do not assume completed).
 * `unknown` → UNKNOWN via engine timeout mapping.
 */
export function createManualSpeiProvider(
  options: ManualSpeiProviderOptions = {},
): ManualSpeiProvider {
  const submitScenario = options.submit ?? 'success';
  const reconcileScenario = options.reconcile ?? 'unknown';
  const recordsHistoricalPayout = options.recordsHistoricalPayout === true;
  const speiReference = options.speiReference?.trim() || null;
  const providerReference = options.providerReference?.trim() || speiReference;

  return {
    id: PAYOUT_INTENT_PROVIDER_MANUAL_SPEI,
    recordsHistoricalPayout,
    speiReference,
    providerReference,
    scenario: submitScenario,
    async submit(intent: PayoutIntentRow): Promise<PayoutProviderSubmitResult> {
      const ref = resolveRef(options, intent, `manual_spei:${intent.idempotency_key}`);
      if (submitScenario === 'success') {
        return { outcome: 'success', externalRef: ref };
      }
      if (submitScenario === 'failure') {
        return { outcome: 'failure', reason: 'manual_spei_stub_failure' };
      }
      if (submitScenario === 'initiated') {
        return { outcome: 'initiated', externalRef: ref };
      }
      return { outcome: 'timeout', reason: 'manual_spei_stub_unknown' };
    },
    async reconcile(
      intent: PayoutIntentRow,
    ): Promise<PayoutProviderReconcileResult> {
      const ref = resolveRef(options, intent, `manual_spei:reconcile:${intent.idempotency_key}`);
      if (reconcileScenario === 'success') {
        return { outcome: 'success', externalRef: ref };
      }
      if (reconcileScenario === 'failure') {
        return { outcome: 'failure', reason: 'manual_spei_reconcile_failure' };
      }
      return { outcome: 'unknown', reason: 'manual_spei_still_unknown' };
    },
  };
}
