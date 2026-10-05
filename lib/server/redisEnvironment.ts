/**
 * Entorno lógico del Redis de Upstash. Contrato: docs/SYSTEMS/MCP_GROK_BOTS.md §14.
 *
 * Production y Staging/Preview pueden compartir el mismo Redis físico. El aislamiento es lógico:
 * cada proceso sólo construye keys bajo `aventa:<entorno>:` y el entorno sale de una declaración
 * explícita (AVENTA_REDIS_ENVIRONMENT), nunca de la URL de Redis. VERCEL_ENV, la surface y el target
 * de Supabase sólo validan esa declaración: cualquier discrepancia deja el proceso sin Redis.
 * Este módulo es puro: no conecta ni lee Redis.
 */

import { resolveAventaSupabaseTarget } from '@/lib/supabase/projectRefs';

export const REDIS_ENVIRONMENTS = ['staging', 'production'] as const;
export type RedisEnvironment = (typeof REDIS_ENVIRONMENTS)[number];

export type RedisMarkerResult = 'match' | 'missing' | 'mismatch' | 'unreachable' | 'not_checked';

export type RedisEnvironmentFailure =
  | 'undeclared'
  | 'declared_invalid'
  | 'vercel_env_invalid'
  | 'surface_invalid'
  | 'local_production_refused'
  | 'vercel_env_mismatch'
  | 'supabase_target_invalid'
  | 'supabase_target_mismatch';

export type RedisEnvironmentResolution =
  | { ok: true; environment: RedisEnvironment }
  | { ok: false; reason: RedisEnvironmentFailure };

/**
 * `scoped`: keys bajo `aventa:<entorno>:` y marcador verificado.
 * `legacy_production`: Aventa Production sin AVENTA_REDIS_ENVIRONMENT; conserva sus keys históricas
 * hasta que el operador declare `production`. Nunca habilita MCP.
 * `none`: el proceso no debe usar Redis.
 */
export type RedisAccess =
  | { mode: 'scoped'; environment: RedisEnvironment }
  | { mode: 'legacy_production' }
  | { mode: 'none'; reason: RedisEnvironmentFailure };

function read(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? '').trim().toLowerCase();
}

/** Entorno que exige el runtime según Vercel. null si la combinación no es válida. */
function runtimeEnvironment(
  env: NodeJS.ProcessEnv,
): { ok: true; environment: RedisEnvironment; local: boolean } | { ok: false; reason: RedisEnvironmentFailure } {
  const vercelEnv = read(env, 'VERCEL_ENV');
  const surface = read(env, 'AVENTA_DEPLOYMENT_SURFACE');
  if (surface && surface !== 'staging') return { ok: false, reason: 'surface_invalid' };
  if (vercelEnv === 'production') {
    return { ok: true, environment: surface === 'staging' ? 'staging' : 'production', local: false };
  }
  if (vercelEnv === 'preview') return { ok: true, environment: 'staging', local: false };
  if (vercelEnv === 'development' || vercelEnv === '') return { ok: true, environment: 'staging', local: true };
  return { ok: false, reason: 'vercel_env_invalid' };
}

export function resolveRedisEnvironment(env: NodeJS.ProcessEnv = process.env): RedisEnvironmentResolution {
  const declared = read(env, 'AVENTA_REDIS_ENVIRONMENT');
  if (!declared) return { ok: false, reason: 'undeclared' };
  if (declared !== 'staging' && declared !== 'production') return { ok: false, reason: 'declared_invalid' };

  const runtime = runtimeEnvironment(env);
  if (!runtime.ok) return runtime;
  if (runtime.local && declared === 'production') return { ok: false, reason: 'local_production_refused' };
  if (runtime.environment !== declared) return { ok: false, reason: 'vercel_env_mismatch' };

  let supabaseTarget: string;
  try {
    supabaseTarget = resolveAventaSupabaseTarget(env);
  } catch {
    return { ok: false, reason: 'supabase_target_invalid' };
  }
  if (supabaseTarget !== declared) return { ok: false, reason: 'supabase_target_mismatch' };

  return { ok: true, environment: declared };
}

/** Sólo Aventa Production canónica, sin declaración, conserva el modo histórico. */
function isCanonicalProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  if (read(env, 'VERCEL_ENV') !== 'production' || read(env, 'AVENTA_DEPLOYMENT_SURFACE')) return false;
  try {
    return resolveAventaSupabaseTarget(env) === 'production';
  } catch {
    return false;
  }
}

export function resolveRedisAccess(env: NodeJS.ProcessEnv = process.env): RedisAccess {
  const resolution = resolveRedisEnvironment(env);
  if (resolution.ok) return { mode: 'scoped', environment: resolution.environment };
  if (resolution.reason === 'undeclared' && isCanonicalProductionRuntime(env)) return { mode: 'legacy_production' };
  return { mode: 'none', reason: resolution.reason };
}

export function redisNamespace(environment: RedisEnvironment): `aventa:${RedisEnvironment}` {
  return `aventa:${environment}`;
}

export function redisEnvironmentMarkerKey(environment: RedisEnvironment): string {
  return `${redisNamespace(environment)}:environment`;
}

export function rateLimitPrefix(environment: RedisEnvironment): string {
  return `${redisNamespace(environment)}:ratelimit`;
}

/**
 * Key absoluta dentro del namespace del entorno. El sufijo es relativo: un sufijo que ya empieza por
 * `aventa:` (p. ej. una key copiada de otro entorno) se rechaza en vez de anidarse.
 */
export function scopedRedisKey(environment: RedisEnvironment, suffix: string): string {
  const s = suffix.trim();
  if (!s || s.startsWith(':') || /^aventa:/i.test(s)) {
    throw new Error('redis key suffix must be relative to the environment namespace');
  }
  return `${redisNamespace(environment)}:${s}`;
}

export function isKeyInEnvironment(environment: RedisEnvironment, key: string): boolean {
  return key.startsWith(`${redisNamespace(environment)}:`);
}
