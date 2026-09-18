/**
 * Canonical Supabase project refs — environment isolation.
 * Never invent refs. Legacy project promoted to STAGING (no third environment).
 */

export const PRODUCTION_SUPABASE_REF = 'mkgsrpsuvedwwlzmzmzh' as const;
export const STAGING_SUPABASE_REF = 'oojshofrpbfwsiypcecr' as const;

export type AventaSupabaseTarget = 'production' | 'staging';

export function extractSupabaseProjectRef(
  url: string | null | undefined,
): string | null {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const m = /^([a-z0-9-]+)\.supabase\.co$/i.exec(host);
    return m ? m[1].toLowerCase() : null;
  } catch {
    const stripped = raw.replace(/^https?:\/\//i, '').split('/')[0] ?? '';
    const m = /^([a-z0-9-]+)\.supabase\.co$/i.exec(stripped);
    return m ? m[1].toLowerCase() : null;
  }
}

export function isProductionSupabaseRef(ref: string | null | undefined): boolean {
  return String(ref ?? '').toLowerCase() === PRODUCTION_SUPABASE_REF;
}

export function isStagingSupabaseRef(ref: string | null | undefined): boolean {
  return String(ref ?? '').toLowerCase() === STAGING_SUPABASE_REF;
}

/** CI / placeholder URLs must not trigger hard env binding. */
export function isCiOrPlaceholderSupabaseUrl(url: string | null | undefined): boolean {
  const u = String(url ?? '').toLowerCase();
  return (
    u.includes('example.supabase.co') ||
    u.includes('tu-proyecto.supabase.co') ||
    u.includes('placeholder')
  );
}

/**
 * Resolve which Supabase target this process must use.
 * Explicit AVENTA_SUPABASE_TARGET wins; unknown explicit values fail closed.
 * Preview + local/dev → staging. Vercel production → production.
 */
export function resolveAventaSupabaseTarget(
  env: NodeJS.ProcessEnv = process.env,
): AventaSupabaseTarget {
  const explicit = (env.AVENTA_SUPABASE_TARGET ?? '').trim().toLowerCase();
  if (explicit) {
    if (explicit === 'production' || explicit === 'prod') return 'production';
    if (explicit === 'staging' || explicit === 'stage') return 'staging';
    throw new Error(
      `ABORT: invalid AVENTA_SUPABASE_TARGET="${explicit}". Allowed: staging|production.`,
    );
  }

  const vercelEnv = (env.VERCEL_ENV ?? '').trim().toLowerCase();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview' || vercelEnv === 'development') return 'staging';

  // Local / unset VERCEL_ENV → staging (not production).
  return 'staging';
}

export type SupabaseRefGuardResult =
  | { ok: true; ref: string; target: AventaSupabaseTarget }
  | { ok: false; error: string; ref: string | null; target: AventaSupabaseTarget };

/**
 * Fail-closed: staging ops must never hit production.
 * Production target must only use production ref.
 */
export function evaluateSupabaseUrlForTarget(input: {
  url: string | null | undefined;
  target?: AventaSupabaseTarget;
  env?: NodeJS.ProcessEnv;
  /** When set, URL ref must equal this (extra check for scripts). */
  expectedRef?: string | null;
}): SupabaseRefGuardResult {
  const env = input.env ?? process.env;
  if ((env.AVENTA_SKIP_SUPABASE_REF_GUARD ?? '').trim() === '1') {
    const ref = extractSupabaseProjectRef(input.url) ?? 'skipped';
    return { ok: true, ref, target: input.target ?? resolveAventaSupabaseTarget(env) };
  }

  let target: AventaSupabaseTarget;
  try {
    target = input.target ?? resolveAventaSupabaseTarget(env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      ref: extractSupabaseProjectRef(input.url),
      target: 'staging',
    };
  }

  if (isCiOrPlaceholderSupabaseUrl(input.url)) {
    return {
      ok: true,
      ref: extractSupabaseProjectRef(input.url) ?? 'placeholder',
      target,
    };
  }

  const ref = extractSupabaseProjectRef(input.url);

  if (!ref) {
    return {
      ok: false,
      error:
        'ABORT: cannot parse Supabase project-ref from NEXT_PUBLIC_SUPABASE_URL (expected https://<ref>.supabase.co).',
      ref: null,
      target,
    };
  }

  // Production refusal first when target is staging (explicit fail-closed message).
  if (target === 'staging') {
    if (isProductionSupabaseRef(ref)) {
      return {
        ok: false,
        error:
          `ABORT: staging/local/preview refused against PRODUCTION Supabase (${PRODUCTION_SUPABASE_REF}). ` +
          `Use staging project ${STAGING_SUPABASE_REF}. ` +
          `Override only with AVENTA_SUPABASE_TARGET=production (deploy) or AVENTA_ALLOW_LOCAL_PRODUCTION=1 (explicit local prod — discouraged).`,
        ref,
        target,
      };
    }
    if (!isStagingSupabaseRef(ref)) {
      return {
        ok: false,
        error:
          `ABORT: staging target requires project-ref ${STAGING_SUPABASE_REF}, got "${ref}".`,
        ref,
        target,
      };
    }
  }

  if (target === 'production') {
    if (!isProductionSupabaseRef(ref)) {
      return {
        ok: false,
        error:
          `ABORT: production target requires project-ref ${PRODUCTION_SUPABASE_REF}, got "${ref}".`,
        ref,
        target,
      };
    }
  }

  const expected =
    (input.expectedRef ?? env.AVENTA_EXPECTED_SUPABASE_REF ?? '').trim().toLowerCase() ||
    null;

  if (expected && ref !== expected) {
    return {
      ok: false,
      error: `ABORT: Supabase ref "${ref}" !== AVENTA_EXPECTED_SUPABASE_REF/expected "${expected}".`,
      ref,
      target,
    };
  }

  return { ok: true, ref, target };
}

/**
 * Local exception: developer explicitly opts into production DB.
 * Still never used by assertStagingOnly.
 */
export function resolveAventaSupabaseTargetWithLocalOverride(
  env: NodeJS.ProcessEnv = process.env,
): AventaSupabaseTarget {
  const vercelEnv = (env.VERCEL_ENV ?? '').trim().toLowerCase();
  if (
    !vercelEnv &&
    (env.AVENTA_ALLOW_LOCAL_PRODUCTION ?? '').trim() === '1'
  ) {
    return 'production';
  }
  return resolveAventaSupabaseTarget(env);
}

export function assertSupabaseUrlForProcess(
  url: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const target = resolveAventaSupabaseTargetWithLocalOverride(env);
  const result = evaluateSupabaseUrlForTarget({ url, target, env });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.ref;
}

/** Scripts/tests that must only touch staging. Always refuse production. */
export function assertStagingSupabaseUrl(
  url: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const result = evaluateSupabaseUrlForTarget({
    url,
    target: 'staging',
    env,
    expectedRef: env.AVENTA_EXPECTED_SUPABASE_REF?.trim() || STAGING_SUPABASE_REF,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  if (isProductionSupabaseRef(result.ref)) {
    throw new Error(
      `ABORT: staging-only operation refused against PRODUCTION (${PRODUCTION_SUPABASE_REF}).`,
    );
  }
  return result.ref;
}
