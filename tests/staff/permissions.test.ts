import { describe, it, expect } from 'vitest';
import {
  canAccessStaffDepartment,
  canAccessStaffHub,
  canAccessGerencia,
  canAccessAdminPanel,
  listStaffDepartmentsForRole,
} from '../../lib/staff/permissions';
import { pickEffectiveRole, ROLE_LABELS } from '../../lib/admin/roles';
import { staffHomePathForRole } from '../../lib/staff/roleRouting';

describe('staff permissions', () => {
  it('gerente supervisa todas las áreas pero no entra a /admin', () => {
    expect(canAccessGerencia('gerente')).toBe(true);
    expect(canAccessStaffDepartment('gerente', 'gerencia')).toBe(true);
    expect(canAccessStaffDepartment('gerente', 'marketing')).toBe(true);
    expect(canAccessStaffDepartment('gerente', 'moderacion')).toBe(true);
    expect(canAccessAdminPanel('gerente')).toBe(false);
  });

  it('marketing solo ve su área y home', () => {
    expect(canAccessStaffHub('marketing')).toBe(true);
    expect(canAccessStaffDepartment('marketing', 'marketing')).toBe(true);
    expect(canAccessStaffDepartment('marketing', 'moderacion')).toBe(false);
    expect(canAccessAdminPanel('marketing')).toBe(false);
  });

  it('pickEffectiveRole respeta precedencia owner > gerente > moderator', () => {
    expect(pickEffectiveRole(['moderator', 'gerente'])).toBe('gerente');
    expect(pickEffectiveRole(['analyst', 'admin'])).toBe('admin');
  });

  it('staffHomePathForRole envía gerente a gerencia', () => {
    expect(staffHomePathForRole('gerente')).toBe('/equipo/gerencia');
    expect(staffHomePathForRole('marketing')).toBe('/equipo/marketing');
  });

  it('ROLE_LABELS incluye gerente', () => {
    expect(ROLE_LABELS.gerente).toBe('Gerente');
  });

  it('listStaffDepartmentsForRole filtra por rol', () => {
    const mods = listStaffDepartmentsForRole('moderator');
    expect(mods.some((d) => d.id === 'moderacion')).toBe(true);
    expect(mods.some((d) => d.id === 'gerencia')).toBe(false);
  });
});
