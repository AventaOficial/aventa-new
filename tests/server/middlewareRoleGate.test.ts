import { describe, it, expect } from 'vitest';
import { evaluateStaffPathAccessForLegacyRole } from '../../lib/server/middlewareRoleGate';

describe('middlewareRoleGate', () => {
  it('bloquea usuario sin rol en /admin', () => {
    expect(evaluateStaffPathAccessForLegacyRole('/admin/moderation', null)).toBe(false);
  });

  it('solo el owner entra a /admin; el moderador se queda en /equipo', () => {
    expect(evaluateStaffPathAccessForLegacyRole('/admin', 'owner')).toBe(true);
    expect(evaluateStaffPathAccessForLegacyRole('/admin/owner', 'owner')).toBe(true);
    expect(evaluateStaffPathAccessForLegacyRole('/admin/moderation', 'moderator')).toBe(false);
    expect(evaluateStaffPathAccessForLegacyRole('/admin/metrics', 'analyst')).toBe(false);
    expect(evaluateStaffPathAccessForLegacyRole('/admin/users', 'admin')).toBe(false);
    expect(evaluateStaffPathAccessForLegacyRole('/equipo/moderacion', 'moderator')).toBe(true);
  });

  it('bloquea marketing en /admin (solo /equipo)', () => {
    expect(evaluateStaffPathAccessForLegacyRole('/admin/metrics', 'marketing')).toBe(false);
    expect(evaluateStaffPathAccessForLegacyRole('/equipo/marketing', 'marketing')).toBe(true);
  });

  it('bloquea analyst en cola de moderación', () => {
    expect(evaluateStaffPathAccessForLegacyRole('/equipo/moderacion', 'analyst')).toBe(false);
    expect(evaluateStaffPathAccessForLegacyRole('/equipo/operaciones', 'analyst')).toBe(true);
  });

  it('bloquea finance en gerencia', () => {
    expect(evaluateStaffPathAccessForLegacyRole('/equipo/gerencia', 'finance')).toBe(false);
    expect(evaluateStaffPathAccessForLegacyRole('/equipo/contabilidad', 'finance')).toBe(true);
  });
});
