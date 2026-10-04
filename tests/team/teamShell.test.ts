import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAccessAdmin } from '../../lib/admin/roles';
import { TEAM_IDS, isTeamId } from '../../lib/team/roles/teams';
import { membershipFromRow, decideTeamEntry } from '../../lib/team/gate/policy';
import { TEAM_METADATA } from '../../lib/team/config/catalog';
import { teamGreeting } from '../../lib/team/config/greeting';
import {
  buildTeamShellContext,
  decideTeamHome,
  navigationFor,
  switcherEntries,
} from '../../lib/team/config/navigation';
import { membershipGrantsAdmin, type TeamMembership } from '../../lib/team';
import { isStaffPathAllowed } from '../../lib/server/middlewareRoleGate';

function active(teamId: TeamMembership['teamId'], role: string): TeamMembership {
  const membership = membershipFromRow('user-1', { teamId, role, status: 'ACTIVE' });
  if (!membership) throw new Error(`membership inválida ${teamId}`);
  return membership;
}

describe('team select destination', () => {
  it('con una membresía entra directo a ese equipo', () => {
    expect(decideTeamHome(['moderation'])).toEqual({ kind: 'team', teamId: 'moderation' });
  });

  it('con dos membresías se queda en la selección', () => {
    expect(decideTeamHome(['moderation', 'finance'])).toEqual({ kind: 'select' });
  });

  it('sin membresías no entra', () => {
    expect(decideTeamHome([])).toEqual({ kind: 'no-access' });
  });
});

describe('team area access', () => {
  const moderation = active('moderation', 'moderator');
  const finance = active('finance', 'finance_viewer');
  const suspended = membershipFromRow('user-1', { teamId: 'growth', role: 'growth_member', status: 'SUSPENDED' });
  const removed = membershipFromRow('user-1', { teamId: 'finance', role: 'finance_viewer', status: 'REMOVED' });

  it('sin membresía bloquea /team/moderation', () => {
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: [], requestedTeam: 'moderation' })).toBe(
      'forbidden',
    );
  });

  it('con moderación permite solo esa área', () => {
    expect(
      decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: ['moderation'], requestedTeam: 'moderation' }),
    ).toBe('allow');
    expect(
      decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: ['moderation'], requestedTeam: 'finance' }),
    ).toBe('forbidden');
  });

  it('con moderación y finanzas permite exactamente esas dos', () => {
    const ids = ['moderation', 'finance'] as const;
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: ids, requestedTeam: 'moderation' })).toBe(
      'allow',
    );
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: ids, requestedTeam: 'finance' })).toBe(
      'allow',
    );
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: ids, requestedTeam: 'hunter' })).toBe(
      'forbidden',
    );
  });

  it('SUSPENDED y REMOVED no entran al switcher', () => {
    expect(suspended).toBeNull();
    expect(removed).toBeNull();
    expect(switcherEntries([moderation], 'moderation').map((entry) => entry.teamId)).toEqual(['moderation']);
  });

  it('el switcher solo lista equipos ACTIVE', () => {
    const entries = switcherEntries([moderation, finance], 'moderation');
    expect(entries.map((entry) => entry.displayName)).toEqual(['Moderación', 'Finanzas']);
    expect(entries.map((entry) => entry.teamId)).toEqual(['moderation', 'finance']);
    expect(entries.find((entry) => entry.current)?.roleLabel).toBe('Moderador');
  });

  it('una ruta desconocida no es un equipo', () => {
    expect(isTeamId('random')).toBe(false);
    expect(isTeamId('admin')).toBe(false);
    expect(isTeamId('owner')).toBe(false);
    expect(isTeamId('whatever')).toBe(false);
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: ['moderation'], requestedTeam: 'random' })).toBe(
      'forbidden',
    );
  });

  it('la membresía no abre /admin', () => {
    expect(membershipGrantsAdmin()).toBe(false);
    expect(canAccessAdmin('moderator')).toBe(false);
    expect(canAccessAdmin('owner')).toBe(true);
    expect(isStaffPathAllowed('/equipo/moderacion', 'moderator')).toBe(true);
    expect(isStaffPathAllowed('/admin', 'moderator')).toBe(false);
  });
});

describe('team shell context', () => {
  it('humaniza el rol y arma la navegación con el permiso real', () => {
    const membership = active('moderation', 'senior_moderator');
    const context = buildTeamShellContext({
      membership,
      memberships: [membership],
      personName: 'Jafet',
      greeting: 'Buenas noches',
    });
    expect(context?.roleLabel).toBe('Moderador senior');
    expect(context?.navigation.map((item) => item.label)).toEqual(['Inicio']);
    expect(context?.navigation[0]?.href).toBe('/team/moderation');
    expect(context?.personName).toBe('Jafet');
    expect(navigationFor('hunter', 'hunter').some((item) => item.permission === 'hunter.batches.decide')).toBe(false);
    expect(navigationFor('hunter', 'hunter_lead').map((item) => item.permission)).toEqual(['hunter.offers.read']);
  });

  it('no usa un userId ajeno: el contexto sale de las membresías recibidas', () => {
    const membership = active('hunter', 'hunter');
    const context = buildTeamShellContext({
      membership,
      memberships: [membership],
      personName: 'Ana',
      greeting: teamGreeting(9),
    });
    expect(context?.switcher).toEqual([
      { teamId: 'hunter', displayName: 'Cazadores', roleLabel: 'Cazador', current: true },
    ]);
    expect(context?.greeting).toBe('Buenos días');
  });

  it('saluda según la hora de México', () => {
    expect(teamGreeting(6)).toBe('Buenos días');
    expect(teamGreeting(11)).toBe('Buenos días');
    expect(teamGreeting(12)).toBe('Buenas tardes');
    expect(teamGreeting(18)).toBe('Buenas tardes');
    expect(teamGreeting(19)).toBe('Buenas noches');
    expect(teamGreeting(3)).toBe('Buenas noches');
  });

  it('la configuración cubre los siete equipos y no es autorización', () => {
    expect(Object.keys(TEAM_METADATA).sort()).toEqual([...TEAM_IDS].sort());
    const catalog = readFileSync('lib/team/config/catalog.ts', 'utf8');
    expect(catalog).not.toContain('user_roles');
    expect(catalog).not.toContain('canAccessAdmin');
  });
});

describe('team shell pages', () => {
  it('la selección pinta las membresías del servidor, no el catálogo completo', () => {
    const page = readFileSync('app/team/select/page.tsx', 'utf8');
    expect(page).toContain('entry.memberships');
    expect(page).not.toContain('TEAM_IDS');
    expect(page).not.toContain('searchParams');
    expect(page).not.toContain('userId');
  });

  it('el área valida en servidor y la página sin acceso no nombra equipos', () => {
    const area = readFileSync('app/team/[team]/page.tsx', 'utf8');
    expect(area).toContain('resolveTeamPage');
    expect(area).toContain('notFound()');
    expect(area).toContain('buildTeamShellContext');
    const denied = readFileSync('app/team/no-access/page.tsx', 'utf8');
    expect(denied).toContain('Sin acceso a Team OS');
    expect(denied).toContain('Volver a Aventa');
    expect(denied).not.toContain('moderation');
    expect(denied).not.toContain('finance');
    const files = [
      'lib/team/config/catalog.ts',
      'lib/team/config/navigation.ts',
      'app/team/shell/TeamShell.tsx',
      'app/team/select/page.tsx',
      'app/team/[team]/page.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('user_roles');
      expect(source).not.toContain('localStorage');
    }
  });
});
