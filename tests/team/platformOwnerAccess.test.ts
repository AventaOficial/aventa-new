import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canAccessTeam, authorizeTeamPermission } from '@/lib/team/authz/authorize';
import {
  platformOwnerGrantsExcludedAction,
  platformOwnerMemberships,
  platformOwnerPermissions,
} from '@/lib/team/authz/platformOwner';
import { TEAM_IDS } from '@/lib/team/roles/teams';

const OWNER = '11111111-1111-4111-8111-111111111111';

describe('owner de plataforma en Team OS', () => {
  it('el rol owner abre todos los equipos sin membresía previa', () => {
    const memberships = platformOwnerMemberships(OWNER);
    expect(memberships.map((item) => item.teamId).sort()).toEqual([...TEAM_IDS].sort());
    for (const teamId of TEAM_IDS) {
      expect(canAccessTeam({ memberships }, teamId)).toBe(true);
    }
  });

  it('puede ver y decidir moderación, y no recibe payout ni XP', () => {
    const memberships = platformOwnerMemberships(OWNER);
    expect(authorizeTeamPermission({ memberships }, 'moderation', 'moderation.offers.read').allowed).toBe(true);
    expect(authorizeTeamPermission({ memberships }, 'moderation', 'moderation.offers.decide').allowed).toBe(true);
    expect(platformOwnerPermissions(OWNER).some((permission) => permission.endsWith('.xp.grant'))).toBe(false);
    expect(platformOwnerGrantsExcludedAction(OWNER)).toBe(false);
  });

  it('un moderador de un solo equipo no abre finanzas', () => {
    const memberships = [
      { userId: OWNER, teamId: 'moderation' as const, role: 'moderator', status: 'ACTIVE' as const },
    ];
    expect(canAccessTeam({ memberships }, 'finance')).toBe(false);
    expect(authorizeTeamPermission({ memberships }, 'moderation', 'moderation.offers.decide').allowed).toBe(true);
  });

  it('la página de equipo autoriza en servidor', () => {
    const source = readFileSync('app/equipo/layout.tsx', 'utf8');
    expect(source).toContain('readAuthenticatedUserId');
    expect(source).toContain('user_roles');
    expect(source).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  it('Founder OS niega en servidor a quien no es owner', () => {
    const source = readFileSync('app/admin/owner/layout.tsx', 'utf8');
    expect(source).toContain('requireOwnerSession');
    expect(source).toContain('auth.status === 403');
    expect(source).toContain("redirect('/')");
    expect(source).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  it('el acceso de owner sale de user_roles, no de un email', () => {
    const source = readFileSync('lib/team/authz/platformRole.ts', 'utf8');
    expect(source).toContain("eq('role', 'owner')");
    expect(source).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });
});
