/**
 * M4.5/M4.6 — Payout provider selection (fail-closed).
 * Explicit PAYOUT_PROVIDER=stub|sandbox|real.
 * No silent real→stub/sandbox fallback.
 * Production: always blocked in M4.6 (activation gate not opened).
 */

import type { PayoutProvider } from './types';
import {
  createSandboxPayoutProvider,
  createStubCompatibleSandbox,
  type SandboxProviderOptions,
  PAYOUT_INTENT_PROVIDER_SANDBOX,
} from './sandboxProvider';
import { PAYOUT_INTENT_PROVIDER_STUB } from './types';
import { PAYOUT_INTENT_PROVIDER_MANUAL_SPEI } from './manualSpeiProvider';
import {
  createRealPayoutProvider,
  type RealProviderTransport,
} from './realProvider';
import {
  isRealProviderId,
  loadRealProviderConfig,
  PAYOUT_INTENT_PROVIDER_REAL,
} from './realProviderConfig';

export type PayoutProviderResolveOk = {
  ok: true;
  providerId: string;
  provider: PayoutProvider;
};

export type PayoutProviderResolveFail = {
  ok: false;
  reason:
    | 'provider_not_configured'
    | 'provider_forbidden_in_production'
    | 'provider_not_implemented'
    | 'credentials_missing'
    | 'api_url_missing'
    | 'invalid_provider'
    | 'invalid_config';
  message: string;
};

export type PayoutProviderResolveResult = PayoutProviderResolveOk | PayoutProviderResolveFail;

const ALLOWED_NON_REAL = new Set([
  'stub',
  'sandbox',
  PAYOUT_INTENT_PROVIDER_STUB,
  PAYOUT_INTENT_PROVIDER_SANDBOX,
  PAYOUT_INTENT_PROVIDER_MANUAL_SPEI,
]);

function isProductionEnv(env: NodeJS.ProcessEnv): boolean {
  const vercelEnv = (env.VERCEL_ENV ?? '').trim().toLowerCase();
  if (vercelEnv === 'production') return true;
  if (vercelEnv === 'preview' || vercelEnv === 'development') return false;
  return env.NODE_ENV === 'production';
}

export type ResolvePayoutProviderOptions = {
  sandboxOptions?: SandboxProviderOptions;
  /** Test-only injectable transport for real provider. */
  realTransport?: RealProviderTransport;
};

/**
 * Resolve provider for payout execution.
 * Production: always fail-closed (M4.6 does not open money activation).
 * Staging: stub|sandbox|manual_spei OR real with full credentials (no fallback).
 */
export function resolvePayoutProvider(
  env: NodeJS.ProcessEnv = process.env,
  sandboxOrOptions: SandboxProviderOptions | ResolvePayoutProviderOptions = {},
): PayoutProviderResolveResult {
  // Back-compat: second arg may be SandboxProviderOptions (M4.5) or options bag.
  const options: ResolvePayoutProviderOptions =
    sandboxOrOptions &&
    ('sandboxOptions' in sandboxOrOptions ||
      'realTransport' in sandboxOrOptions)
      ? (sandboxOrOptions as ResolvePayoutProviderOptions)
      : { sandboxOptions: sandboxOrOptions as SandboxProviderOptions };
  const sandboxOptions = options.sandboxOptions ?? {};

  const raw = (env.PAYOUT_PROVIDER ?? '').trim().toLowerCase();

  if (isProductionEnv(env)) {
    return {
      ok: false,
      reason: 'provider_forbidden_in_production',
      message: 'PAYOUT_PROVIDER blocked in production runtime (M4.6 — no activation gate)',
    };
  }

  if (!raw) {
    return {
      ok: false,
      reason: 'provider_not_configured',
      message: 'PAYOUT_PROVIDER must be set explicitly (stub|sandbox|real)',
    };
  }

  if (isRealProviderId(raw)) {
    const cfg = loadRealProviderConfig(env);
    if (!cfg.ok) {
      // Fail closed — NEVER fall back to sandbox/stub.
      return {
        ok: false,
        reason:
          cfg.reason === 'api_url_missing'
            ? 'api_url_missing'
            : cfg.reason === 'invalid_config'
              ? 'invalid_config'
              : 'credentials_missing',
        message: cfg.message,
      };
    }
    return {
      ok: true,
      providerId: PAYOUT_INTENT_PROVIDER_REAL,
      provider: createRealPayoutProvider(cfg.config, options.realTransport),
    };
  }

  if (!ALLOWED_NON_REAL.has(raw)) {
    return {
      ok: false,
      reason: 'invalid_provider',
      message: `Unknown PAYOUT_PROVIDER="${raw}". Allowed: stub|sandbox|real`,
    };
  }

  if (raw === 'stub' || raw === PAYOUT_INTENT_PROVIDER_STUB) {
    return {
      ok: true,
      providerId: PAYOUT_INTENT_PROVIDER_STUB,
      provider: createStubCompatibleSandbox(sandboxOptions),
    };
  }

  const provider = createSandboxPayoutProvider(sandboxOptions);
  if (raw === PAYOUT_INTENT_PROVIDER_MANUAL_SPEI) {
    return {
      ok: true,
      providerId: PAYOUT_INTENT_PROVIDER_MANUAL_SPEI,
      provider: { ...provider, id: PAYOUT_INTENT_PROVIDER_MANUAL_SPEI },
    };
  }

  return {
    ok: true,
    providerId: PAYOUT_INTENT_PROVIDER_SANDBOX,
    provider,
  };
}

/** Hard guard: adapters must never receive a Supabase client. */
export const PROVIDER_ADAPTER_MUST_NOT_MUTATE_DB = true as const;
