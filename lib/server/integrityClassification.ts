export type IntegrityCheckState =
  | 'pass'
  | 'fail'
  | 'overdue'
  | 'stale'
  | 'schema_missing'
  | 'query_error';

export type ClassifiedCheck = {
  name: string;
  ok: boolean;
  state: IntegrityCheckState;
  detail: string;
};

export type QueryErrorLike = { code?: string | null; message?: string | null } | null | undefined;

const SCHEMA_MISSING_CODES = new Set(['42703', '42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);

export function isSchemaMissingError(error: QueryErrorLike): boolean {
  if (!error) return false;
  if (error.code && SCHEMA_MISSING_CODES.has(error.code)) return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('does not exist') || message.includes('schema cache');
}

export function describeQueryError(error: QueryErrorLike): string {
  if (!error) return 'no error';
  const code = error.code?.trim() || 'no_code';
  const message = error.message?.trim() || 'empty error message';
  return `${code}: ${message}`;
}

function errorCheck(name: string, error: QueryErrorLike, migration: string): ClassifiedCheck {
  if (isSchemaMissingError(error)) {
    return {
      name,
      ok: false,
      state: 'schema_missing',
      detail: `schema drift (${describeQueryError(error)}); pending migration: ${migration}`,
    };
  }
  return { name, ok: false, state: 'query_error', detail: `query failed (${describeQueryError(error)})` };
}

export type IntegrityStatus = 'PASS' | 'WARN' | 'FAIL' | 'NOT_APPLICABLE';
export type IntegritySeverity = 'critical' | 'high' | 'medium' | 'low';

export type IntegrityCheckSpec = {
  severity: IntegritySeverity;
  /** Estado cuando el check no pasa por datos (fail/overdue/stale). query_error siempre es FAIL. */
  onViolation: 'FAIL' | 'WARN';
  /** Estado cuando falta el esquema que el check consulta. */
  onSchemaMissing: 'FAIL' | 'WARN' | 'NOT_APPLICABLE';
  action: string;
};

export type FinalizedIntegrityCheck = {
  name: string;
  ok: boolean;
  status: IntegrityStatus;
  state: IntegrityCheckState;
  severity: IntegritySeverity | null;
  reason: string;
  evidence: string;
  detail: string;
  checkedAt: string;
  action: string | null;
};

export const DEFAULT_INTEGRITY_SPEC: IntegrityCheckSpec = {
  severity: 'medium',
  onViolation: 'FAIL',
  onSchemaMissing: 'FAIL',
  action: 'Investigar el check y documentar la causa.',
};

const STATE_REASON: Record<IntegrityCheckState, string> = {
  pass: 'Dentro de los límites esperados.',
  fail: 'Se encontraron filas que violan el invariante.',
  overdue: 'La cola acumula trabajo vencido por encima del límite.',
  stale: 'El proceso no ha corrido dentro de la ventana esperada.',
  schema_missing: 'El esquema que el check consulta no existe en este entorno.',
  query_error: 'El check no pudo ejecutarse; el resultado es desconocido.',
};

/** Un check que no pudo correr nunca se reporta como PASS. */
export function finalizeIntegrityCheck(
  check: { name: string; ok: boolean; detail: string; state?: IntegrityCheckState },
  spec: IntegrityCheckSpec | undefined,
  checkedAt: string,
): FinalizedIntegrityCheck {
  const s = spec ?? DEFAULT_INTEGRITY_SPEC;
  const state: IntegrityCheckState = check.state ?? (check.ok ? 'pass' : 'fail');
  let status: IntegrityStatus;
  if (state === 'pass' && check.ok) status = 'PASS';
  else if (state === 'schema_missing') status = s.onSchemaMissing;
  else if (state === 'query_error') status = 'FAIL';
  else status = s.onViolation;
  return {
    name: check.name,
    ok: status !== 'FAIL',
    status,
    state,
    severity: status === 'PASS' || status === 'NOT_APPLICABLE' ? null : s.severity,
    reason: STATE_REASON[state],
    evidence: check.detail,
    detail: check.detail,
    checkedAt,
    action: status === 'PASS' ? null : s.action,
  };
}

/** Snapshots anteriores al modelo de estados solo traen `ok`. */
export function integrityStatusOf(check: { ok?: boolean; status?: string | null }): IntegrityStatus {
  const s = check.status;
  if (s === 'PASS' || s === 'WARN' || s === 'FAIL' || s === 'NOT_APPLICABLE') return s;
  return check.ok ? 'PASS' : 'FAIL';
}

/** Resultado de un check basado en un error opcional y una condición de datos. */
export function classifyGenericCheck(input: {
  name: string;
  error: QueryErrorLike;
  violated: boolean;
  detail: string;
  migration?: string;
  violationState?: Extract<IntegrityCheckState, 'fail' | 'overdue' | 'stale'>;
}): ClassifiedCheck {
  if (input.error) return errorCheck(input.name, input.error, input.migration ?? 'n/a');
  return input.violated
    ? { name: input.name, ok: false, state: input.violationState ?? 'fail', detail: input.detail }
    : { name: input.name, ok: true, state: 'pass', detail: input.detail };
}

export const FRESHNESS_OVERDUE_LIMIT = 400;

/**
 * Freshness queue health. Schema drift and query errors are reported as such, never as
 * an overdue queue. While next_check_at is missing the scanner runs its legacy fallback.
 */
export function classifyFreshnessCheck(input: {
  probeError: QueryErrorLike;
  countError: QueryErrorLike;
  overdue: number | null;
}): ClassifiedCheck {
  const name = 'freshness.overdue';
  if (input.probeError) {
    const check = errorCheck(name, input.probeError, 'launch_hardening_v2.sql');
    if (check.state === 'schema_missing') {
      check.detail = `${check.detail}; scanner running in legacy fallback`;
    }
    return check;
  }
  if (input.countError) return errorCheck(name, input.countError, 'launch_hardening_v2.sql');
  const overdue = input.overdue ?? 0;
  if (overdue >= FRESHNESS_OVERDUE_LIMIT) {
    return { name, ok: false, state: 'overdue', detail: `overdue_gt_6h=${overdue}` };
  }
  return { name, ok: true, state: 'pass', detail: `overdue_gt_6h=${overdue}` };
}

export const LIFECYCLE_MAX_RUN_AGE_HOURS = 3;

export function classifyLifecycleRunCheck(input: {
  error: QueryErrorLike;
  lastStartedAt: string | null;
  backlogRemaining: boolean | null;
  nowMs: number;
}): ClassifiedCheck {
  const name = 'lifecycle.last_run';
  if (input.error) return errorCheck(name, input.error, 'offers_lifecycle_v2.sql');
  if (!input.lastStartedAt) {
    return { name, ok: false, state: 'stale', detail: 'no lifecycle runs recorded (job offers-lifecycle-v2 inactive?)' };
  }
  const ageHours = (input.nowMs - new Date(input.lastStartedAt).getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours > LIFECYCLE_MAX_RUN_AGE_HOURS) {
    return { name, ok: false, state: 'stale', detail: `last_run=${input.lastStartedAt} (older than ${LIFECYCLE_MAX_RUN_AGE_HOURS}h)` };
  }
  return {
    name,
    ok: true,
    state: 'pass',
    detail: `last_run=${input.lastStartedAt}${input.backlogRemaining ? ' backlog_remaining=true' : ''}`,
  };
}

export function classifyZeroCountCheck(input: {
  name: string;
  error: QueryErrorLike;
  count: number | null;
  label: string;
  migration: string;
}): ClassifiedCheck {
  if (input.error) return errorCheck(input.name, input.error, input.migration);
  const count = input.count ?? 0;
  return {
    name: input.name,
    ok: count === 0,
    state: count === 0 ? 'pass' : 'fail',
    detail: `${input.label}=${count}`,
  };
}

/** Only offers that are visible or in the moderation queue must have an image. */
export function classifyImageIntegrityCheck(input: {
  error: QueryErrorLike;
  activeMissing: number | null;
  pendingMissing: number | null;
  nonOperationalMissing: number | null;
}): ClassifiedCheck {
  const name = 'offers.image_url.integrity';
  if (input.error) return errorCheck(name, input.error, 'n/a');
  const active = input.activeMissing ?? 0;
  const pending = input.pendingMissing ?? 0;
  const ok = active === 0 && pending === 0;
  return {
    name,
    ok,
    state: ok ? 'pass' : 'fail',
    detail: `active_missing=${active}, pending_missing=${pending}, non_operational_missing=${input.nonOperationalMissing ?? 0} (informativo)`,
  };
}
