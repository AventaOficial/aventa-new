/**
 * Stub payout provider — staging/tests only.
 * Never moves real money. timeout → UNKNOWN (never auto-FAILED).
 */

import type {
  PayoutIntentRow,
  PayoutProvider,
  PayoutProviderReconcileResult,
  PayoutProviderSubmitResult,
} from './types';
import { PAYOUT_INTENT_PROVIDER_STUB } from './types';

export type StubSubmitScenario = 'success' | 'failure' | 'timeout';
export type StubReconcileScenario = 'success' | 'failure' | 'unknown';

export function createStubPayoutProvider(options: {
  submit: StubSubmitScenario;
  /** Used when submit was timeout / reconcile called. Default unknown. */
  reconcile?: StubReconcileScenario;
}): PayoutProvider {
  const reconcileScenario = options.reconcile ?? 'unknown';
  return {
    id: PAYOUT_INTENT_PROVIDER_STUB,
    async submit(_intent: PayoutIntentRow): Promise<PayoutProviderSubmitResult> {
      if (options.submit === 'success') {
        return { outcome: 'success', externalRef: 'stub:success' };
      }
      if (options.submit === 'failure') {
        return { outcome: 'failure', reason: 'stub_failure' };
      }
      return { outcome: 'timeout', reason: 'stub_timeout' };
    },
    async reconcile(
      _intent: PayoutIntentRow,
    ): Promise<PayoutProviderReconcileResult> {
      if (reconcileScenario === 'success') {
        return { outcome: 'success', externalRef: 'stub:reconcile_success' };
      }
      if (reconcileScenario === 'failure') {
        return { outcome: 'failure', reason: 'stub_reconcile_failure' };
      }
      return { outcome: 'unknown', reason: 'stub_still_unknown' };
    },
  };
}
