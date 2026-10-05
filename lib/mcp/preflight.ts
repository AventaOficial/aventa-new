import {
  redisEnvironmentMarkerKey,
  resolveRedisEnvironment,
  type RedisEnvironment,
  type RedisMarkerResult,
} from '@/lib/server/redisEnvironment';
import {
  extractSupabaseProjectRef,
  isProductionSupabaseRef,
  isStagingSupabaseRef,
  PRODUCTION_SUPABASE_REF,
  resolveAventaSupabaseTarget,
  STAGING_SUPABASE_REF,
} from '@/lib/supabase/projectRefs';

/**
 * Preflight de entorno para MCP (staging y, en sólo lectura, production). Sólo lee variables y el
 * marcador de Redis del propio entorno: nunca escribe ni devuelve valores secretos.
 * Contrato: docs/SYSTEMS/MCP_GROK_BOTS.md §14.
 */

export type PreflightStatus = 'PRESENT' | 'MISSING' | 'INVALID';

/** `block`: inseguro desplegar. `activation`: seguro desplegar con MCP apagado, pero no listo para activar. */
export type PreflightSeverity = 'block' | 'activation';

export type PreflightCheck = {
  name: string;
  status: PreflightStatus;
  ok: boolean;
  severity: PreflightSeverity;
  note: string;
};

export type PreflightVerdict = 'BLOCKED' | 'NOT_READY' | 'READY';

export type PreflightReport = { verdict: PreflightVerdict; checks: PreflightCheck[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERCEL_ENVS = new Set(['production', 'preview', 'development']);

function read(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? '').trim();
}

function check(
  name: string,
  status: PreflightStatus,
  ok: boolean,
  severity: PreflightSeverity,
  note: string,
): PreflightCheck {
  return { name, status, ok, severity, note };
}

function checkVercelEnv(env: NodeJS.ProcessEnv): PreflightCheck {
  const value = read(env, 'VERCEL_ENV').toLowerCase();
  const surface = read(env, 'AVENTA_DEPLOYMENT_SURFACE').toLowerCase();
  if (!value) return check('VERCEL_ENV', 'MISSING', true, 'block', 'local (sin Vercel)');
  if (!VERCEL_ENVS.has(value)) return check('VERCEL_ENV', 'INVALID', false, 'block', 'valor desconocido');
  if (value === 'production' && surface !== 'staging') {
    return check('VERCEL_ENV', 'INVALID', false, 'block', 'production sin AVENTA_DEPLOYMENT_SURFACE=staging: es Aventa Production');
  }
  return check('VERCEL_ENV', 'PRESENT', true, 'block', value);
}

function checkSurface(env: NodeJS.ProcessEnv): PreflightCheck {
  const value = read(env, 'AVENTA_DEPLOYMENT_SURFACE').toLowerCase();
  if (!value) return check('AVENTA_DEPLOYMENT_SURFACE', 'MISSING', true, 'block', 'sin definir');
  if (value === 'staging') return check('AVENTA_DEPLOYMENT_SURFACE', 'PRESENT', true, 'block', 'staging');
  return check('AVENTA_DEPLOYMENT_SURFACE', 'INVALID', false, 'block', 'debe ser staging o no existir');
}

function checkTarget(env: NodeJS.ProcessEnv): PreflightCheck {
  let target: string;
  try {
    target = resolveAventaSupabaseTarget(env);
  } catch {
    return check('AVENTA_SUPABASE_TARGET', 'INVALID', false, 'block', 'valor no permitido');
  }
  const status: PreflightStatus = read(env, 'AVENTA_SUPABASE_TARGET') ? 'PRESENT' : 'MISSING';
  if (target !== 'staging') return check('AVENTA_SUPABASE_TARGET', 'INVALID', false, 'block', `resuelve a ${target}`);
  return check('AVENTA_SUPABASE_TARGET', status, true, 'block', 'resuelve a staging');
}

function checkSupabaseUrl(env: NodeJS.ProcessEnv): PreflightCheck {
  const url = read(env, 'NEXT_PUBLIC_SUPABASE_URL');
  if (!url) return check('NEXT_PUBLIC_SUPABASE_URL', 'MISSING', false, 'block', 'sin definir');
  const ref = extractSupabaseProjectRef(url);
  if (isProductionSupabaseRef(ref)) return check('NEXT_PUBLIC_SUPABASE_URL', 'INVALID', false, 'block', 'apunta a PRODUCCIÓN');
  if (!isStagingSupabaseRef(ref)) return check('NEXT_PUBLIC_SUPABASE_URL', 'INVALID', false, 'block', 'no es el proyecto staging');
  return check('NEXT_PUBLIC_SUPABASE_URL', 'PRESENT', true, 'block', 'staging');
}

function checkExpectedRef(env: NodeJS.ProcessEnv): PreflightCheck {
  const value = read(env, 'AVENTA_EXPECTED_SUPABASE_REF').toLowerCase();
  if (!value) return check('AVENTA_EXPECTED_SUPABASE_REF', 'MISSING', false, 'block', `requerido: ${STAGING_SUPABASE_REF}`);
  if (value !== STAGING_SUPABASE_REF) return check('AVENTA_EXPECTED_SUPABASE_REF', 'INVALID', false, 'block', 'no es staging');
  return check('AVENTA_EXPECTED_SUPABASE_REF', 'PRESENT', true, 'block', 'staging');
}

function checkIngestFlag(env: NodeJS.ProcessEnv): PreflightCheck {
  const value = read(env, 'MCP_INGEST_ENABLED').toLowerCase();
  if (!value) return check('MCP_INGEST_ENABLED', 'MISSING', true, 'block', 'apagado (sin definir)');
  if (value === 'false' || value === '0') return check('MCP_INGEST_ENABLED', 'PRESENT', true, 'block', 'apagado');
  if (value === 'true' || value === '1') {
    return check('MCP_INGEST_ENABLED', 'INVALID', false, 'block', 'encendido: debe seguir apagado en esta fase');
  }
  return check('MCP_INGEST_ENABLED', 'INVALID', false, 'block', 'valor no reconocido');
}

function checkUpstashUrl(env: NodeJS.ProcessEnv): PreflightCheck {
  const value = read(env, 'UPSTASH_REDIS_REST_URL');
  if (!value) return check('UPSTASH_REDIS_REST_URL', 'MISSING', false, 'activation', 'sin backend distribuido: MCP responde 503');
  let ok = false;
  try {
    const u = new URL(value);
    ok = u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.');
  } catch {
    ok = false;
  }
  if (!ok) return check('UPSTASH_REDIS_REST_URL', 'INVALID', false, 'activation', 'debe ser una URL https');
  return check('UPSTASH_REDIS_REST_URL', 'PRESENT', true, 'activation', 'definida');
}

function checkUpstashToken(env: NodeJS.ProcessEnv): PreflightCheck {
  const raw = env.UPSTASH_REDIS_REST_TOKEN ?? '';
  if (!raw.trim()) return check('UPSTASH_REDIS_REST_TOKEN', 'MISSING', false, 'activation', 'sin backend distribuido: MCP responde 503');
  if (raw.trim().length < 20 || /\s/.test(raw.trim())) {
    return check('UPSTASH_REDIS_REST_TOKEN', 'INVALID', false, 'activation', 'formato no válido');
  }
  return check('UPSTASH_REDIS_REST_TOKEN', 'PRESENT', true, 'activation', 'definido');
}

function checkBotAuthors(env: NodeJS.ProcessEnv): PreflightCheck {
  const raw = read(env, 'MCP_BOT_AUTHOR_USER_IDS');
  if (!raw) return check('MCP_BOT_AUTHOR_USER_IDS', 'MISSING', false, 'activation', 'sin autor bot: no se puede crear el cliente');
  const ids = raw.split(',').map((v) => v.trim());
  if (ids.some((id) => !UUID_RE.test(id))) return check('MCP_BOT_AUTHOR_USER_IDS', 'INVALID', false, 'activation', 'algún valor no es uuid');
  const ingest = new Set(
    ['BOT_INGEST_USER_ID', 'BOT_INGEST_USER_ID_TECH', 'BOT_INGEST_USER_ID_STAPLES'].map((n) => read(env, n).toLowerCase()).filter(Boolean),
  );
  if (ids.some((id) => ingest.has(id.toLowerCase()))) {
    return check('MCP_BOT_AUTHOR_USER_IDS', 'INVALID', false, 'activation', 'reutiliza un autor de ingesta: debe ser dedicado');
  }
  return check('MCP_BOT_AUTHOR_USER_IDS', 'PRESENT', true, 'activation', `${ids.length} autor(es)`);
}

const REDIS_FAILURE_NOTES: Record<string, string> = {
  declared_invalid: 'valor no permitido (staging|production)',
  vercel_env_invalid: 'VERCEL_ENV desconocido',
  surface_invalid: 'AVENTA_DEPLOYMENT_SURFACE no válida',
  local_production_refused: 'production sólo en Vercel production',
  vercel_env_mismatch: 'no coincide con VERCEL_ENV / surface',
  supabase_target_invalid: 'AVENTA_SUPABASE_TARGET no válido',
  supabase_target_mismatch: 'no coincide con el target de Supabase',
};

/** Entorno declarado del Redis compartido. Otro entorno que el esperado bloquea; ausente sólo impide activar. */
function checkRedisEnvironment(env: NodeJS.ProcessEnv, expected: RedisEnvironment): PreflightCheck {
  const name = 'AVENTA_REDIS_ENVIRONMENT';
  const declared = read(env, name).toLowerCase();
  if (!declared) return check(name, 'MISSING', false, 'activation', `requerido: ${expected} (sin él MCP responde 503)`);
  if (declared !== expected) return check(name, 'INVALID', false, 'block', `declara ${declared === 'staging' || declared === 'production' ? declared : 'un valor no permitido'}; se esperaba ${expected}`);
  const resolution = resolveRedisEnvironment(env);
  if (!resolution.ok) return check(name, 'INVALID', false, 'block', REDIS_FAILURE_NOTES[resolution.reason] ?? 'incoherente');
  return check(name, 'PRESENT', true, 'block', `${expected} (namespace aventa:${expected}:*)`);
}

function checkRedisMarker(result: RedisMarkerResult, expected: RedisEnvironment): PreflightCheck {
  const name = `redis:${redisEnvironmentMarkerKey(expected)}`;
  switch (result) {
    case 'match':
      return check(name, 'PRESENT', true, 'activation', expected);
    case 'missing':
      return check(name, 'MISSING', false, 'activation', `falta el marcador de ${expected} en este Redis`);
    case 'mismatch':
      return check(name, 'INVALID', false, 'activation', `el marcador no vale ${expected}`);
    case 'unreachable':
      return check(name, 'INVALID', false, 'activation', 'no se pudo leer el marcador');
    default:
      return check(name, 'MISSING', false, 'activation', 'no verificado');
  }
}

/** Evalúa el entorno. Cualquier duda cuenta como fallo: el veredicto nunca es READY por omisión. */
export function evaluateMcpStagingPreflight(
  env: NodeJS.ProcessEnv,
  options: { redisMarker?: RedisMarkerResult } = {},
): PreflightReport {
  const checks = [
    checkVercelEnv(env),
    checkSurface(env),
    checkTarget(env),
    checkSupabaseUrl(env),
    checkExpectedRef(env),
    checkIngestFlag(env),
    checkRedisEnvironment(env, 'staging'),
    checkUpstashUrl(env),
    checkUpstashToken(env),
    checkRedisMarker(options.redisMarker ?? 'not_checked', 'staging'),
    checkBotAuthors(env),
  ];
  return verdictOf(checks);
}

function verdictOf(checks: PreflightCheck[]): PreflightReport {
  const blocked = checks.some((c) => c.severity === 'block' && !c.ok);
  const notReady = checks.some((c) => !c.ok);
  return { verdict: blocked ? 'BLOCKED' : notReady ? 'NOT_READY' : 'READY', checks };
}

function checkProductionVercelEnv(env: NodeJS.ProcessEnv): PreflightCheck {
  const value = read(env, 'VERCEL_ENV').toLowerCase();
  const surface = read(env, 'AVENTA_DEPLOYMENT_SURFACE').toLowerCase();
  if (!value) return check('VERCEL_ENV', 'MISSING', false, 'block', 'requerido: production');
  if (value !== 'production') return check('VERCEL_ENV', 'INVALID', false, 'block', `${VERCEL_ENVS.has(value) ? value : 'valor desconocido'}: no es production`);
  if (surface) return check('VERCEL_ENV', 'INVALID', false, 'block', 'AVENTA_DEPLOYMENT_SURFACE definida: no es Aventa Production');
  return check('VERCEL_ENV', 'PRESENT', true, 'block', 'production');
}

function checkProductionSupabase(env: NodeJS.ProcessEnv): PreflightCheck[] {
  let target: string | null = null;
  try {
    target = resolveAventaSupabaseTarget(env);
  } catch {
    target = null;
  }
  const targetCheck =
    target === 'production'
      ? check('AVENTA_SUPABASE_TARGET', read(env, 'AVENTA_SUPABASE_TARGET') ? 'PRESENT' : 'MISSING', true, 'block', 'resuelve a production')
      : check('AVENTA_SUPABASE_TARGET', 'INVALID', false, 'block', target ? `resuelve a ${target}` : 'valor no permitido');
  const url = read(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const ref = extractSupabaseProjectRef(url);
  const urlCheck = !url
    ? check('NEXT_PUBLIC_SUPABASE_URL', 'MISSING', false, 'block', 'sin definir')
    : isProductionSupabaseRef(ref)
      ? check('NEXT_PUBLIC_SUPABASE_URL', 'PRESENT', true, 'block', 'production')
      : check('NEXT_PUBLIC_SUPABASE_URL', 'INVALID', false, 'block', 'no es el proyecto production');
  const expected = read(env, 'AVENTA_EXPECTED_SUPABASE_REF').toLowerCase();
  const expectedCheck = !expected
    ? check('AVENTA_EXPECTED_SUPABASE_REF', 'MISSING', true, 'block', 'opcional')
    : expected === PRODUCTION_SUPABASE_REF
      ? check('AVENTA_EXPECTED_SUPABASE_REF', 'PRESENT', true, 'block', 'production')
      : check('AVENTA_EXPECTED_SUPABASE_REF', 'INVALID', false, 'block', 'no es production');
  return [targetCheck, urlCheck, expectedCheck];
}

/**
 * Preflight de Aventa Production, sólo lectura: comprueba que el runtime declara `production`, que su
 * marcador `aventa:production:environment` existe y que MCP sigue apagado. No habilita nada.
 */
export function evaluateMcpProductionPreflight(
  env: NodeJS.ProcessEnv,
  options: { redisMarker?: RedisMarkerResult } = {},
): PreflightReport {
  return verdictOf([
    checkProductionVercelEnv(env),
    ...checkProductionSupabase(env),
    checkIngestFlag(env),
    checkRedisEnvironment(env, 'production'),
    checkUpstashUrl(env),
    checkUpstashToken(env),
    checkRedisMarker(options.redisMarker ?? 'not_checked', 'production'),
    checkBotAuthors(env),
  ]);
}

export type ProvisionGuardResult = { ok: true; ref: string } | { ok: false; reasons: string[] };

/**
 * Guarda del aprovisionamiento del autor bot de staging. Cualquier discrepancia aborta.
 * Los motivos nunca incluyen valores secretos.
 */
export function evaluateStagingProvisionGuard(env: NodeJS.ProcessEnv): ProvisionGuardResult {
  const reasons: string[] = [];
  const ref = extractSupabaseProjectRef(read(env, 'NEXT_PUBLIC_SUPABASE_URL'));

  if (read(env, 'AVENTA_TARGET').toLowerCase() !== 'staging') reasons.push('AVENTA_TARGET debe ser staging');
  if (read(env, 'AVENTA_EXPECTED_SUPABASE_REF').toLowerCase() !== STAGING_SUPABASE_REF) {
    reasons.push(`AVENTA_EXPECTED_SUPABASE_REF debe ser ${STAGING_SUPABASE_REF}`);
  }
  if (isProductionSupabaseRef(ref)) reasons.push('NEXT_PUBLIC_SUPABASE_URL apunta a PRODUCCIÓN');
  else if (!isStagingSupabaseRef(ref)) reasons.push('NEXT_PUBLIC_SUPABASE_URL no es el proyecto staging');
  const supabaseTarget = read(env, 'AVENTA_SUPABASE_TARGET').toLowerCase();
  if (supabaseTarget && supabaseTarget !== 'staging') reasons.push('AVENTA_SUPABASE_TARGET debe ser staging o no existir');
  const surface = read(env, 'AVENTA_DEPLOYMENT_SURFACE').toLowerCase();
  if (surface && surface !== 'staging') reasons.push('AVENTA_DEPLOYMENT_SURFACE debe ser staging o no existir');
  if (read(env, 'VERCEL_ENV').toLowerCase() === 'production' && surface !== 'staging') {
    reasons.push('VERCEL_ENV=production fuera de la superficie staging');
  }
  const key = read(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!key) reasons.push('SUPABASE_SERVICE_ROLE_KEY: MISSING');
  else {
    const keyRef = jwtProjectRef(key);
    if (keyRef && keyRef !== STAGING_SUPABASE_REF) reasons.push('SUPABASE_SERVICE_ROLE_KEY: INVALID (no pertenece a staging)');
  }

  return reasons.length === 0 && ref ? { ok: true, ref } : { ok: false, reasons };
}

/** `ref` de una key JWT de Supabase (sin verificar firma). null si no es JWT. */
function jwtProjectRef(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as {
      ref?: unknown;
    };
    return typeof payload.ref === 'string' ? payload.ref.toLowerCase() : null;
  } catch {
    return null;
  }
}
