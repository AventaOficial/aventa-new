import { describe, expect, it } from 'vitest';
import { canAccessPayoutOps, PAYOUT_OPS_ROLES } from '@/lib/staff/requireFinanceStaff';
import { FINANCE_TABS, PAYOUT_OPS_PATH, resolveFinanceTab } from '@/lib/finance/hubConfig';
import { WORKSPACE_HUB_ROUTES, WORKSPACE_STAFF_API_ROUTES } from '@/lib/staff/workspaceRoutes';
import { canAccessEquipoPath } from '@/lib/staff/equipoAccess';
import type { Role } from '@/lib/admin/roles';

describe('Centro de Pagos — acceso', () => {
  it('solo owner y finance', () => {
    expect(PAYOUT_OPS_ROLES).toEqual(['owner', 'finance']);
    const allowed: Role[] = ['owner', 'finance'];
    const denied: Role[] = ['admin', 'gerente', 'marketing', 'moderator', 'analyst'];
    for (const r of allowed) expect(canAccessPayoutOps(r)).toBe(true);
    for (const r of denied) expect(canAccessPayoutOps(r)).toBe(false);
    expect(canAccessPayoutOps(null)).toBe(false);
  });

  it('ruta y API registradas en el catálogo del workspace', () => {
    expect(WORKSPACE_HUB_ROUTES).toContain(PAYOUT_OPS_PATH);
    expect(WORKSPACE_STAFF_API_ROUTES).toContain('/api/staff/finance/payout-ops');
    expect(canAccessEquipoPath('owner', PAYOUT_OPS_PATH)).toBe(true);
    expect(canAccessEquipoPath('finance', PAYOUT_OPS_PATH)).toBe(true);
  });

  it('tab resuelve sin colisionar con /pagos', () => {
    expect(resolveFinanceTab(PAYOUT_OPS_PATH)).toBe('payout_ops');
    expect(resolveFinanceTab('/equipo/contabilidad/pagos')).toBe('payments');
    expect(FINANCE_TABS.find((t) => t.id === 'payout_ops')?.restricted).toBe(true);
  });
});
