/**
 * Fail-closed gates for Distribution drain cron / automated soak.
 *
 * Staging Vercel project (`aventa-staging`) uses VERCEL_ENV=production for its
 * own Production deployment (required for Vercel Cron). Isolation is NOT
 * "VERCEL_ENV !== production" alone — it is:
 *   AVENTA_DEPLOYMENT_SURFACE=staging
 *   + AVENTA_SUPABASE_TARGET=staging
 *   + staging Supabase ref
 *   + AVENTA_EXPECTED_SUPABASE_REF=oojshofrpbfwsiypcecr
 *
 * The Production app project (`aventa-new` / aventaofertas.com) must NOT set
 * AVENTA_DEPLOYMENT_SURFACE=staging — drain then aborts.
 */

import {
  extractSupabaseProjectRef,
  isProductionSupabaseRef,
  isStagingSupabaseRef,
  resolveAventaSupabaseTarget,
  STAGING_SUPABASE_REF,
  PRODUCTION_SUPABASE_REF,
} from '@/lib/supabase/projectRefs';
import { isDistributionEngineEnabled } from './constants';

/** Only allowed Telegram credential_ref name on staging surface. */
export const STAGING_TELEGRAM_CREDENTIAL_REF = 'TELEGRAM_BOT_TOKEN_STAGING' as const;

export type DistributionDrainGateResult =
  | { ok: true }
  | { ok: false; reason: string; httpStatus: 200 | 401 | 403 | 409 | 503 };

export function resolveDeploymentSurface(
  env: NodeJS.ProcessEnv = process.env,
): 'staging' | 'production' | 'unknown' {
  const raw = (env.AVENTA_DEPLOYMENT_SURFACE ?? '').trim().toLowerCase();
  if (raw === 'staging' || raw === 'stage') return 'staging';
  if (raw === 'production' || raw === 'prod') return 'production';
  // Infer from explicit target when surface unset (local/dev).
  const target = resolveAventaSupabaseTarget(env);
  if (target === 'staging' && (env.VERCEL_ENV ?? '').trim() === '') return 'staging';
  if (target === 'production') return 'production';
  return 'unknown';
}

/**
 * Hard abort conditions for GET/POST /api/cron/distribution-drain.
 */
export function assertDistributionDrainAllowed(
  env: NodeJS.ProcessEnv = process.env,
): DistributionDrainGateResult {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const ref = extractSupabaseProjectRef(url);
  const target = resolveAventaSupabaseTarget(env);
  const surface = resolveDeploymentSurface(env);
  const expected = (env.AVENTA_EXPECTED_SUPABASE_REF ?? '').trim().toLowerCase();

  // Absolute: never drain against production Supabase.
  if (isProductionSupabaseRef(ref)) {
    return {
      ok: false,
      reason: `production_supabase_ref_forbidden:${PRODUCTION_SUPABASE_REF}`,
      httpStatus: 503,
    };
  }

  if (target !== 'staging') {
    return {
      ok: false,
      reason: `target_not_staging:${target}`,
      httpStatus: 503,
    };
  }

  if (!ref || !isStagingSupabaseRef(ref)) {
    return {
      ok: false,
      reason: `supabase_ref_not_staging:expected=${STAGING_SUPABASE_REF}:got=${ref ?? 'null'}`,
      httpStatus: 503,
    };
  }

  if (expected && expected !== STAGING_SUPABASE_REF) {
    return {
      ok: false,
      reason: `expected_ref_mismatch:expected=${STAGING_SUPABASE_REF}:got=${expected}`,
      httpStatus: 503,
    };
  }

  // Dedicated staging Vercel project sets AVENTA_DEPLOYMENT_SURFACE=staging.
  // aventa-new Production must not set that — blocks mistaken Production cron.
  if (surface !== 'staging') {
    return {
      ok: false,
      reason: `deployment_surface_not_staging:${surface}`,
      httpStatus: 503,
    };
  }

  if (!isDistributionEngineEnabled(env)) {
    return {
      ok: false,
      reason: 'flag_disabled',
      httpStatus: 200,
    };
  }

  return { ok: true };
}

/**
 * Staging Telegram destinations must use the staging credential env name only.
 * Does not read or return the token value.
 */
export function assertStagingTelegramCredentialRef(
  credentialRef: string | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  const ref = (credentialRef ?? '').trim();
  if (!ref) return { ok: false, reason: 'missing_credential_ref' };
  if (ref.includes(':') && /^\d+:/.test(ref)) {
    return { ok: false, reason: 'credential_ref_looks_like_token' };
  }
  if (ref !== STAGING_TELEGRAM_CREDENTIAL_REF) {
    return {
      ok: false,
      reason: `credential_ref_not_staging:expected=${STAGING_TELEGRAM_CREDENTIAL_REF}:got=${ref}`,
    };
  }
  return { ok: true };
}

/**
 * Safe diagnostic snapshot — never includes secret values.
 */
export function buildDistributionEnvHealth(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const ref = extractSupabaseProjectRef(url);
  const gate = assertDistributionDrainAllowed(env);
  return {
    vercel_env: (env.VERCEL_ENV ?? '').trim() || null,
    deployment_surface: resolveDeploymentSurface(env),
    aventa_supabase_target: resolveAventaSupabaseTarget(env),
    expected_supabase_ref: (env.AVENTA_EXPECTED_SUPABASE_REF ?? '').trim() || null,
    resolved_supabase_ref: ref,
    supabase_host_present: Boolean(url.trim()),
    distribution_engine_enabled: isDistributionEngineEnabled(env),
    cron_secret_configured: Boolean((env.CRON_SECRET ?? '').trim()),
    telegram_staging_token_configured: Boolean(
      (env.TELEGRAM_BOT_TOKEN_STAGING ?? '').trim(),
    ),
    telegram_staging_chat_id_configured: Boolean(
      (env.TELEGRAM_STAGING_CHAT_ID ?? '').trim(),
    ),
    drain_gate: gate.ok
      ? { allowed: true }
      : { allowed: false, reason: gate.reason, httpStatus: gate.httpStatus },
    production_ref: PRODUCTION_SUPABASE_REF,
    staging_ref: STAGING_SUPABASE_REF,
  };
}
