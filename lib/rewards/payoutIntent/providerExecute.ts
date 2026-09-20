/**
 * M4.5 — Provider execution boundary.
 * Calls PayoutProvider adapter → normalizes → engine transitions.
 * Provider never touches creator_rewards / payout_intents / ledger directly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  submitPayoutIntent,
  reconcilePayoutIntent,
  type PayoutIntentOpResult,
} from './engine';
import type { PayoutProvider } from './types';
import {
  normalizeSubmitResult,
  normalizeReconcileResult,
  type NormalizedProviderResult,
} from './providerNormalize';
import { loadPayoutIntent } from './engine';
import {
  resolvePayoutProvider,
  type PayoutProviderResolveResult,
} from './resolveProvider';
import type { SandboxProviderOptions } from './sandboxProvider';

export type ProviderExecuteResult =
  | {
      ok: true;
      intentResult: PayoutIntentOpResult & { ok: true };
      normalized: NormalizedProviderResult;
      providerId: string;
    }
  | {
      ok: false;
      reason: string;
      message?: string;
      resolve?: PayoutProviderResolveResult;
      intentResult?: PayoutIntentOpResult;
      normalized?: NormalizedProviderResult;
    };

/**
 * Submit via resolved/injected provider. Does not auto-PAID on initiated/unknown.
 */
export async function executeProviderSubmit(
  supabase: SupabaseClient,
  input: {
    intentId: string;
    actorId?: string | null;
    /** Inject for tests; otherwise resolve from PAYOUT_PROVIDER. */
    provider?: PayoutProvider;
    sandboxOptions?: SandboxProviderOptions;
    env?: NodeJS.ProcessEnv;
  },
): Promise<ProviderExecuteResult> {
  let provider = input.provider;
  let providerId = provider?.id ?? '';

  if (!provider) {
    const resolved = resolvePayoutProvider(input.env ?? process.env, input.sandboxOptions);
    if (!resolved.ok) {
      return {
        ok: false,
        reason: resolved.reason,
        message: resolved.message,
        resolve: resolved,
      };
    }
    provider = resolved.provider;
    providerId = resolved.providerId;
  } else {
    providerId = provider.id;
  }

  const before = await loadPayoutIntent(supabase, input.intentId);
  if (!before) {
    return { ok: false, reason: 'intent_not_found' };
  }

  // Peek normalize of what submit would return — actual path goes through engine
  // which calls provider.submit once. We call via engine only (single submit).
  const intentResult = await submitPayoutIntent(supabase, {
    intentId: input.intentId,
    provider,
    actorId: input.actorId,
  });

  const after = intentResult.ok
    ? intentResult.intent
    : before;

  // Reconstruct normalized view from resulting status for callers/tests.
  let normalized: NormalizedProviderResult;
  if (after.status === 'SUCCEEDED') {
    normalized = normalizeSubmitResult(before, providerId, {
      outcome: 'success',
      externalRef:
        typeof after.meta.provider_reference === 'string'
          ? after.meta.provider_reference
          : null,
    });
  } else if (after.status === 'FAILED') {
    normalized = normalizeSubmitResult(before, providerId, {
      outcome: 'failure',
      reason: 'provider_failure',
    });
  } else if (after.status === 'UNKNOWN') {
    normalized = normalizeSubmitResult(before, providerId, {
      outcome: 'timeout',
      reason: 'provider_timeout',
    });
  } else if (
    after.status === 'SUBMITTED' &&
    after.meta.awaiting_confirmation === true
  ) {
    normalized = normalizeSubmitResult(before, providerId, {
      outcome: 'initiated',
      externalRef:
        typeof after.meta.provider_reference === 'string'
          ? after.meta.provider_reference
          : null,
    });
  } else {
    normalized = normalizeSubmitResult(before, providerId, {
      outcome: 'timeout',
      reason: 'unexpected_post_submit_status',
    });
  }

  if (!intentResult.ok) {
    return {
      ok: false,
      reason: intentResult.reason,
      message: intentResult.message,
      intentResult,
      normalized,
    };
  }

  return {
    ok: true,
    intentResult,
    normalized,
    providerId,
  };
}

/**
 * Reconcile via provider. UNKNOWN → evidence → applyProviderConfirmation inside engine.
 * Never auto-retries submit.
 */
export async function executeProviderReconcile(
  supabase: SupabaseClient,
  input: {
    intentId: string;
    actorId?: string | null;
    provider?: PayoutProvider;
    sandboxOptions?: SandboxProviderOptions;
    env?: NodeJS.ProcessEnv;
  },
): Promise<ProviderExecuteResult> {
  let provider = input.provider;
  let providerId = provider?.id ?? '';

  if (!provider) {
    const resolved = resolvePayoutProvider(input.env ?? process.env, input.sandboxOptions);
    if (!resolved.ok) {
      return {
        ok: false,
        reason: resolved.reason,
        message: resolved.message,
        resolve: resolved,
      };
    }
    provider = resolved.provider;
    providerId = resolved.providerId;
  } else {
    providerId = provider.id;
  }

  const before = await loadPayoutIntent(supabase, input.intentId);
  if (!before) return { ok: false, reason: 'intent_not_found' };

  const intentResult = await reconcilePayoutIntent(supabase, {
    intentId: input.intentId,
    provider,
    actorId: input.actorId,
  });

  const after = intentResult.ok ? intentResult.intent : before;
  let normalized: NormalizedProviderResult;
  if (after.status === 'SUCCEEDED') {
    normalized = normalizeReconcileResult(before, providerId, {
      outcome: 'success',
      externalRef:
        typeof after.meta.provider_reference === 'string'
          ? after.meta.provider_reference
          : null,
    });
  } else if (after.status === 'FAILED') {
    normalized = normalizeReconcileResult(before, providerId, {
      outcome: 'failure',
      reason: 'reconcile_failure',
    });
  } else {
    normalized = normalizeReconcileResult(before, providerId, {
      outcome: 'unknown',
      reason: 'still_unknown',
    });
  }

  if (!intentResult.ok) {
    return {
      ok: false,
      reason: intentResult.reason,
      message: intentResult.message,
      intentResult,
      normalized,
    };
  }

  return { ok: true, intentResult, normalized, providerId };
}
