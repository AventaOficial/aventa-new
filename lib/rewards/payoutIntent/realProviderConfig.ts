/**
 * M4.6 — Real payout provider configuration (server-side only).
 * Credentials never hardcoded. Missing config → fail closed (no sandbox fallback).
 */

export const PAYOUT_INTENT_PROVIDER_REAL = 'real' as const;

export type RealProviderConfig = {
  apiUrl: string;
  apiKey: string;
  /** Required for webhook ingress; optional for submit/reconcile-only. */
  webhookSecret: string | null;
  timeoutMs: number;
};

export type RealProviderConfigResult =
  | { ok: true; config: RealProviderConfig }
  | {
      ok: false;
      reason: 'credentials_missing' | 'api_url_missing' | 'invalid_config';
      message: string;
    };

const REAL_ALIASES = new Set(['real', 'spei', 'bank', 'live']);

export function isRealProviderId(raw: string): boolean {
  return REAL_ALIASES.has(raw.trim().toLowerCase());
}

/**
 * Load real-provider config from env. Does not invent credentials.
 * Requires PAYOUT_PROVIDER_API_URL + PAYOUT_PROVIDER_API_KEY.
 */
export function loadRealProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): RealProviderConfigResult {
  const apiUrl = (env.PAYOUT_PROVIDER_API_URL ?? '').trim().replace(/\/+$/, '');
  const apiKey = (
    env.PAYOUT_PROVIDER_API_KEY ??
    env.PAYOUT_SPEI_API_KEY ??
    ''
  ).trim();
  const webhookSecret = (env.PAYOUT_PROVIDER_WEBHOOK_SECRET ?? '').trim() || null;
  const timeoutRaw = Number(env.PAYOUT_PROVIDER_TIMEOUT_MS ?? 15_000);
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 1_000 && timeoutRaw <= 60_000
      ? Math.floor(timeoutRaw)
      : 15_000;

  if (!apiUrl) {
    return {
      ok: false,
      reason: 'api_url_missing',
      message: 'PAYOUT_PROVIDER_API_URL required for real provider',
    };
  }
  if (!/^https:\/\//i.test(apiUrl)) {
    return {
      ok: false,
      reason: 'invalid_config',
      message: 'PAYOUT_PROVIDER_API_URL must be https',
    };
  }
  if (!apiKey) {
    return {
      ok: false,
      reason: 'credentials_missing',
      message: 'PAYOUT_PROVIDER_API_KEY required for real provider',
    };
  }

  return {
    ok: true,
    config: { apiUrl, apiKey, webhookSecret, timeoutMs },
  };
}

/** Redact secrets from any loggable structure. */
export function redactProviderSecrets<T extends Record<string, unknown>>(
  value: T,
): T {
  const out = { ...value };
  for (const key of Object.keys(out)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('key') ||
      lower.includes('secret') ||
      lower.includes('authorization') ||
      lower.includes('password') ||
      lower.includes('token')
    ) {
      (out as Record<string, unknown>)[key] = '[redacted]';
    }
  }
  return out;
}
