import { describe, it, expect } from 'vitest';
import { isStaffPathAllowed } from '../../lib/server/middlewareRoleGate';

describe('middlewareRoleGate', () => {
  it('bloquea usuario sin rol en /admin', () => {
    expect(isStaffPathAllowed('/admin/moderation', null)).toBe(false);
  });

  it('permite moderator en /admin/moderation', () => {
    expect(isStaffPathAllowed('/admin/moderation', 'moderator')).toBe(true);
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
