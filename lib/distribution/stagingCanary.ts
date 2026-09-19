/**
 * Distribution staging soak canary — hard guards for exactly-one staging destination.
 * Fail-closed. No production. No fan-out. Process-scoped engine enable only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractSupabaseProjectRef,
  isProductionSupabaseRef,
  isStagingSupabaseRef,
  PRODUCTION_SUPABASE_REF,
  resolveAventaSupabaseTarget,
  STAGING_SUPABASE_REF,
} from '@/lib/supabase/projectRefs';
import {
  assertStagingTelegramCredentialRef,
  resolveDeploymentSurface,
  STAGING_TELEGRAM_CREDENTIAL_REF,
} from './cronSafety';
import { isDistributionEngineEnabled } from './constants';

/** Canonical staging soak destination (P0-D3 seed, provisioned chat). */
export const STAGING_SOAK_CANARY_DESTINATION_ID =
  'c2222222-2222-4222-8222-222222222201' as const;

export const STAGING_SOAK_CANARY_DESTINATION_SLUG = 'telegram-staging-test' as const;

export const STAGING_SOAK_CANARY_PROVIDER = 'telegram' as const;

export type StagingSoakCanaryGuardsOk = {
  ok: true;
  target: 'staging';
  ref: string;
  destinationId: typeof STAGING_SOAK_CANARY_DESTINATION_ID;
  destinationSlug: string;
  provider: typeof STAGING_SOAK_CANARY_PROVIDER;
  credentialRef: typeof STAGING_TELEGRAM_CREDENTIAL_REF;
  externalDestinationKeyPrefix: string;
  activeDestinationCount: 1;
  engineEnabledInProcess: boolean;
};

export type StagingSoakCanaryGuardsFail = {
  ok: false;
  reason: string;
};

export type StagingSoakCanaryGuardsResult =
  | StagingSoakCanaryGuardsOk
  | StagingSoakCanaryGuardsFail;

/**
 * Pure env/target checks — no DB. Production / wrong ref abort.
 */
export function assertStagingSoakCanaryEnv(
  env: NodeJS.ProcessEnv = process.env,
): StagingSoakCanaryGuardsResult {
  const target = resolveAventaSupabaseTarget(env);
  if (target !== 'staging') {
    return { ok: false, reason: `target_not_staging:${target}` };
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const ref = extractSupabaseProjectRef(url);
  if (!ref || !isStagingSupabaseRef(ref)) {
    return {
      ok: false,
      reason: `supabase_ref_not_staging:expected=${STAGING_SUPABASE_REF}:got=${ref ?? 'null'}`,
    };
  }
  if (isProductionSupabaseRef(ref)) {
    return {
      ok: false,
      reason: `production_ref_forbidden:${PRODUCTION_SUPABASE_REF}`,
    };
  }

  const expected = (env.AVENTA_EXPECTED_SUPABASE_REF ?? '').trim().toLowerCase();
  if (expected && expected !== STAGING_SUPABASE_REF) {
    return {
      ok: false,
      reason: `expected_ref_mismatch:expected=${STAGING_SUPABASE_REF}:got=${expected}`,
    };
  }

  const surface = resolveDeploymentSurface(env);
  if (surface === 'production') {
    return { ok: false, reason: `deployment_surface_production` };
  }

  return {
    ok: true,
    target: 'staging',
    ref,
    destinationId: STAGING_SOAK_CANARY_DESTINATION_ID,
    destinationSlug: STAGING_SOAK_CANARY_DESTINATION_SLUG,
    provider: STAGING_SOAK_CANARY_PROVIDER,
    credentialRef: STAGING_TELEGRAM_CREDENTIAL_REF,
    externalDestinationKeyPrefix: '',
    activeDestinationCount: 1,
    engineEnabledInProcess: isDistributionEngineEnabled(env),
  };
}

/**
 * DB + env guards: exactly one active destination, allowlisted id/slug/credential.
 */
export async function assertStagingSoakCanaryGuards(
  supabase: SupabaseClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StagingSoakCanaryGuardsResult> {
  const envGuard = assertStagingSoakCanaryEnv(env);
  if (!envGuard.ok) return envGuard;

  const { data: active, error } = await supabase
    .from('distribution_destinations')
    .select(
      'id, slug, provider, status, credential_ref, external_destination_key, display_name',
    )
    .eq('status', 'active');

  if (error) {
    return { ok: false, reason: `destinations_load_failed:${error.message}` };
  }

  const rows = active ?? [];
  if (rows.length !== 1) {
    return {
      ok: false,
      reason: `active_destination_count_not_one:got=${rows.length}`,
    };
  }

  const dest = rows[0] as {
    id: string;
    slug: string;
    provider: string;
    status: string;
    credential_ref: string | null;
    external_destination_key: string;
    display_name: string;
  };

  if (dest.id !== STAGING_SOAK_CANARY_DESTINATION_ID) {
    return {
      ok: false,
      reason: `destination_not_allowlisted:got=${dest.id}`,
    };
  }
  if (dest.slug !== STAGING_SOAK_CANARY_DESTINATION_SLUG) {
    return { ok: false, reason: `destination_slug_mismatch:got=${dest.slug}` };
  }
  if (dest.provider !== STAGING_SOAK_CANARY_PROVIDER) {
    return { ok: false, reason: `provider_not_telegram:got=${dest.provider}` };
  }

  const cred = assertStagingTelegramCredentialRef(dest.credential_ref);
  if (!cred.ok) {
    return { ok: false, reason: cred.reason };
  }

  const chatKey = (dest.external_destination_key ?? '').trim();
  if (!chatKey || chatKey === 'STAGING_UNSET' || chatKey.startsWith('__')) {
    return { ok: false, reason: 'staging_chat_id_not_provisioned' };
  }
  // Telegram chat ids are numeric / -100… — reject obvious production secrets shapes.
  if (chatKey.includes(':') && /^\d+:/.test(chatKey)) {
    return { ok: false, reason: 'external_destination_key_looks_like_token' };
  }

  const tokenPresent = Boolean((env.TELEGRAM_BOT_TOKEN_STAGING ?? '').trim());
  if (!tokenPresent) {
    return { ok: false, reason: 'TELEGRAM_BOT_TOKEN_STAGING_missing' };
  }

  return {
    ok: true,
    target: 'staging',
    ref: envGuard.ref,
    destinationId: STAGING_SOAK_CANARY_DESTINATION_ID,
    destinationSlug: dest.slug,
    provider: STAGING_SOAK_CANARY_PROVIDER,
    credentialRef: STAGING_TELEGRAM_CREDENTIAL_REF,
    externalDestinationKeyPrefix: chatKey.slice(0, 12),
    activeDestinationCount: 1,
    engineEnabledInProcess: isDistributionEngineEnabled(env),
  };
}

/**
 * Canary process env: enables engine ONLY for this process copy.
 * Does not mutate caller's global intent beyond returned object.
 */
export function buildStagingSoakCanaryEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: base.NODE_ENV ?? 'development',
  };
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) env[k] = v;
  }
  env.AVENTA_SUPABASE_TARGET = 'staging';
  env.AVENTA_EXPECTED_SUPABASE_REF = STAGING_SUPABASE_REF;
  env.AVENTA_DEPLOYMENT_SURFACE = 'staging';
  env.DISTRIBUTION_ENGINE_ENABLED = 'true';
  env.VERCEL_ENV = '';
  return env;
}

export function isStagingSoakCanaryOfferId(raw: unknown): raw is string {
  return (
    typeof raw === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw.trim(),
    )
  );
}
