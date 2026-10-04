import type { Role } from '@/lib/admin/roles';

/**
 * Decide quién puede ejecutar una acción de la cola existente.
 * El rol de dominio de una membresía de equipo es siempre `moderator`:
 * no abre lote ni el nivel enforcement, y no escribe user_roles.
 * El equipo o el userId enviados por el cliente no entran en esta decisión.
 */
export type ModerationAccessPlan =
  | {
      ok: true;
      userId: string;
      domainRole: Role;
      via: 'staff_role' | 'team_membership';
    }
  | { ok: false; status: 401 | 403 };

export function planModerationAccess(input: {
  legacy: { ok: true; userId: string; role: Role } | { ok: false; status: 401 | 403 };
  team:
    | { ok: true; userId: string; canDecide: boolean }
    | { ok: false; status: 401 | 403 }
    | null;
  bearerUserId: string | null;
}): ModerationAccessPlan {
  if (input.legacy.ok) {
    return {
      ok: true,
      userId: input.legacy.userId,
      domainRole: input.legacy.role,
      via: 'staff_role',
    };
  }

  const team = input.team;
  if (!team || !team.ok) {
    if (team?.status === 401 || input.legacy.status === 401) {
      return { ok: false, status: 401 };
    }
    return { ok: false, status: 403 };
  }

  if (!team.canDecide) return { ok: false, status: 403 };
  if (input.bearerUserId && input.bearerUserId !== team.userId) {
    return { ok: false, status: 403 };
  }

  return {
    ok: true,
    userId: team.userId,
    domainRole: 'moderator',
    via: 'team_membership',
  };
}
