import { describe, it, expect } from 'vitest';
import { isStaffPathAllowed } from '../../lib/server/middlewareRoleGate';

describe('middlewareRoleGate', () => {
  it('bloquea usuario sin rol en /admin', () => {
    expect(isStaffPathAllowed('/admin/moderation', null)).toBe(false);
  });

  it('solo el owner entra a /admin; el moderador se queda en /equipo', () => {
    expect(isStaffPathAllowed('/admin', 'owner')).toBe(true);
    expect(isStaffPathAllowed('/admin/owner', 'owner')).toBe(true);
    expect(isStaffPathAllowed('/admin/moderation', 'moderator')).toBe(false);
    expect(isStaffPathAllowed('/admin/metrics', 'analyst')).toBe(false);
    expect(isStaffPathAllowed('/admin/users', 'admin')).toBe(false);
    expect(isStaffPathAllowed('/equipo/moderacion', 'moderator')).toBe(true);
  });

  it('bloquea marketing en /admin (solo /equipo)', () => {
    expect(isStaffPathAllowed('/admin/metrics', 'marketing')).toBe(false);
    expect(isStaffPathAllowed('/equipo/marketing', 'marketing')).toBe(true);
  });

  it('bloquea analyst en cola de moderación', () => {
    expect(isStaffPathAllowed('/equipo/moderacion', 'analyst')).toBe(false);
    expect(isStaffPathAllowed('/equipo/operaciones', 'analyst')).toBe(true);
  });

  it('bloquea finance en gerencia', () => {
    expect(isStaffPathAllowed('/equipo/gerencia', 'finance')).toBe(false);
    expect(isStaffPathAllowed('/equipo/contabilidad', 'finance')).toBe(true);
  });
});
