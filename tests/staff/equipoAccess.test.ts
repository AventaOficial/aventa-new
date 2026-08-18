import { describe, it, expect } from 'vitest';
import {
  canAccessEquipoPath,
  filterStaffQueueForRole,
  healthQueueDepartment,
  healthQueuePath,
} from '../../lib/staff/equipoAccess';
import type { StaffQueueItem } from '../../lib/staff/workBoard';

const sampleQueue: StaffQueueItem[] = [
  {
    id: 'mod',
    label: 'Mod',
    detail: '',
    count: 1,
    tone: 'ok',
    href: '/equipo/moderacion',
    department: 'moderacion',
  },
  {
    id: 'mkt',
    label: 'Mkt',
    detail: '',
    count: 2,
    tone: 'ok',
    href: '/equipo/marketing',
    department: 'marketing',
  },
  {
    id: 'fin',
    label: 'Fin',
    detail: '',
    count: 3,
    tone: 'ok',
    href: '/equipo/contabilidad',
    department: 'contabilidad',
  },
];

describe('equipoAccess', () => {
  it('analyst accede a operaciones pero no a marketing', () => {
    expect(canAccessEquipoPath('analyst', '/equipo/operaciones')).toBe(true);
    expect(canAccessEquipoPath('analyst', '/equipo/operaciones/salud')).toBe(true);
    expect(canAccessEquipoPath('analyst', '/equipo/marketing')).toBe(false);
    expect(canAccessEquipoPath('analyst', '/equipo/moderacion/bot')).toBe(false);
  });

  it('analyst puede ver colas de salud bajo operaciones', () => {
    expect(canAccessEquipoPath('analyst', '/equipo/operaciones/precio')).toBe(true);
    expect(canAccessEquipoPath('analyst', '/equipo/operaciones/agotadas')).toBe(true);
  });

  it('analyst puede abrir precio/agotadas en moderación como excepción operativa', () => {
    expect(canAccessEquipoPath('analyst', '/equipo/moderacion/precio')).toBe(true);
    expect(canAccessEquipoPath('analyst', '/equipo/moderacion/agotadas')).toBe(true);
    expect(canAccessEquipoPath('analyst', '/equipo/moderacion/cazadores')).toBe(false);
  });

  it('marketing solo ve colas de su departamento en home', () => {
    const filtered = filterStaffQueueForRole(sampleQueue, 'marketing');
    expect(filtered.map((q) => q.id)).toEqual(['mkt']);
  });

  it('gerente ve todas las colas operativas', () => {
    const filtered = filterStaffQueueForRole(sampleQueue, 'gerente');
    expect(filtered.length).toBe(3);
  });

  it('healthQueuePath envía analyst a operaciones', () => {
    expect(healthQueuePath('analyst', 'precio')).toBe('/equipo/operaciones/precio');
    expect(healthQueueDepartment('analyst')).toBe('operaciones');
  });

  it('healthQueuePath envía moderator a moderación', () => {
    expect(healthQueuePath('moderator', 'agotadas')).toBe('/equipo/moderacion/agotadas');
    expect(healthQueueDepartment('moderator')).toBe('moderacion');
  });
});
