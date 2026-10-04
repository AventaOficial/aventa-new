import type { TransitionCode } from './transitions';

const MESSAGES: Record<TransitionCode | 'forbidden' | 'schema_missing' | 'query_invalid', { status: number; error: string }> = {
  self_assignment: { status: 403, error: 'No puedes modificar tu propia membresía.' },
  forbidden: { status: 403, error: 'Forbidden' },
  invalid_actor: { status: 400, error: 'Actor inválido.' },
  invalid_target: { status: 400, error: 'Usuario inválido.' },
  invalid_membership: { status: 400, error: 'Membresía inválida.' },
  unknown_team: { status: 400, error: 'Equipo desconocido.' },
  invalid_role: { status: 400, error: 'Ese rol no pertenece al equipo.' },
  invalid_status: { status: 400, error: 'Estado inválido.' },
  invalid_transition: { status: 400, error: 'Esa transición de estado no está permitida.' },
  removed_membership: { status: 400, error: 'Una membresía removida no se edita. Hay que asignar de nuevo.' },
  reason_required: { status: 400, error: 'El motivo es obligatorio.' },
  reason_invalid: { status: 400, error: 'El motivo no es válido.' },
  live_membership_exists: { status: 409, error: 'Ya tiene una membresía viva en ese equipo.' },
  query_invalid: { status: 400, error: 'Búsqueda inválida.' },
  schema_missing: {
    status: 503,
    error: 'Falta aplicar docs/supabase-migrations/team_os_memberships.sql',
  },
};

const RPC_CODES = [
  'self_assignment',
  'forbidden',
  'invalid_actor',
  'invalid_target',
  'unknown_team',
  'invalid_role',
  'invalid_status',
  'invalid_transition',
  'removed_membership',
  'reason_required',
  'reason_invalid',
  'live_membership_exists',
  'query_invalid',
  'target_not_found',
  'membership_not_found',
] as const;

export function failureBody(code: TransitionCode | 'query_invalid'): { status: number; error: string } {
  return MESSAGES[code];
}

export function isServerFailure(body: { status: number }): boolean {
  return body.status >= 500;
}

export function rpcFailure(message: string): { status: number; error: string } {
  if (/schema cache|could not find the function|relation ["']?public\.(team_memberships|team_audit_log|teams)["']? does not exist/i.test(message)) {
    return MESSAGES.schema_missing;
  }
  if (message.includes('target_not_found') || message.includes('membership_not_found')) {
    return { status: 404, error: 'No encontrado.' };
  }
  const code = RPC_CODES.find((item) => item !== 'target_not_found' && item !== 'membership_not_found' && message.includes(item));
  if (code && code in MESSAGES) return MESSAGES[code as TransitionCode | 'forbidden' | 'query_invalid'];
  return { status: 500, error: 'No se pudo completar la operación.' };
}
