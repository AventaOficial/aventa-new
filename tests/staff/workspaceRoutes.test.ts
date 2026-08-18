import { describe, it, expect } from 'vitest';
import { WORKSPACE_HUB_ROUTES, WORKSPACE_STAFF_API_ROUTES } from '../../lib/staff/workspaceRoutes';
import { canAccessEquipoPath } from '../../lib/staff/equipoAccess';
import type { Role } from '../../lib/admin/roles';

describe('workspace routes catalog', () => {
  it('todas las rutas hub empiezan con /equipo', () => {
    for (const route of WORKSPACE_HUB_ROUTES) {
      expect(route.startsWith('/equipo')).toBe(true);
    }
  });

  it('owner puede acceder a todos los hubs', () => {
    for (const route of WORKSPACE_HUB_ROUTES) {
      expect(canAccessEquipoPath('owner', route)).toBe(true);
    }
  });

  it('finance no entra a marketing ni moderación', () => {
    expect(canAccessEquipoPath('finance', '/equipo/contabilidad')).toBe(true);
    expect(canAccessEquipoPath('finance', '/equipo/marketing')).toBe(false);
    expect(canAccessEquipoPath('finance', '/equipo/moderacion')).toBe(false);
  });

  it('APIs staff registradas', () => {
    expect(WORKSPACE_STAFF_API_ROUTES.length).toBeGreaterThanOrEqual(8);
    for (const route of WORKSPACE_STAFF_API_ROUTES) {
      expect(route.startsWith('/api/staff/')).toBe(true);
    }
  });

  it('cada rol operativo tiene al menos un hub', () => {
    const roleHub: Record<Role, string> = {
      owner: '/equipo/gerencia',
      admin: '/equipo/moderacion',
      gerente: '/equipo/gerencia',
      moderator: '/equipo/moderacion',
      marketing: '/equipo/marketing',
      finance: '/equipo/contabilidad',
      analyst: '/equipo/operaciones',
    };
    for (const [role, hub] of Object.entries(roleHub) as [Role, string][]) {
      expect(canAccessEquipoPath(role, hub)).toBe(true);
    }
  });
});
