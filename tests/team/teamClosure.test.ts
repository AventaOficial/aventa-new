import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAccessAdmin } from '@/lib/admin/roles';
import { isStaffPathAllowed } from '@/lib/server/middlewareRoleGate';
import { teamHomePermission } from '../../lib/team/config/catalog';
import { decideTeamHome } from '../../lib/team/config/navigation';
import { profileMenuLinks } from '../../lib/team/config/profileMenu';
import { authorizeTeamPermission, canAccessTeam } from '../../lib/team/authz/authorize';
import { heroAccess } from '../../lib/team/hero/access';
import { resolveTeamNext, visibleActiveTeamIds } from '../../lib/team/gate/policy';
import { EXCLUDED_TEAM_ACTIONS, isTeamPermission } from '../../lib/team/permissions';
import { TEAM_IDS, type TeamId, type TeamMembership } from '../../lib/team/roles';

type Seat = {
  teamId: TeamId;
  role: string;
  label: string;
};

const SEATS: readonly Seat[] = [
  { teamId: 'moderation', role: 'moderator', label: 'Moderación' },
  { teamId: 'hunter', role: 'hunter', label: 'Hunter' },
  { teamId: 'growth', role: 'growth_member', label: 'Growth' },
  { teamId: 'community', role: 'community_member', label: 'Comunidad' },
  { teamId: 'operations', role: 'operations_member', label: 'Operations' },
  { teamId: 'finance', role: 'finance_viewer', label: 'Finance' },
  { teamId: 'product', role: 'product_member', label: 'Technical' },
];

function active(teamId: TeamId, role: string, status: TeamMembership['status'] = 'ACTIVE'): TeamMembership {
  return { userId: 'member', teamId, role, status };
}

describe('cierre de Team OS por rol', () => {
  it.each(SEATS)('$label entra a su dashboard y la API de inicio', (seat) => {
    const membership = active(seat.teamId, seat.role);
    const subject = { memberships: [membership] };
    const home = teamHomePermission(seat.teamId);

    expect(canAccessTeam(subject, seat.teamId)).toBe(true);
    expect(authorizeTeamPermission(subject, seat.teamId, home)).toEqual({ allowed: true });
    expect(decideTeamHome([seat.teamId])).toEqual({ kind: 'team', teamId: seat.teamId });
    expect(heroAccess(seat.teamId, [membership])).toMatchObject({ ok: true, teamId: seat.teamId });

    const links = profileMenuLinks({ isOwner: false, teamIds: [seat.teamId] });
    expect(links.map((link) => link.label)).toEqual([seat.label, 'Mi equipo']);
    expect(links.map((link) => link.href)).toEqual([`/team/${seat.teamId}`, '/team']);
  });

  it.each(SEATS)('$label recibe DENY en otro equipo y no abre sus datos', (seat) => {
    const membership = active(seat.teamId, seat.role);
    const subject = { memberships: [membership] };

    for (const other of TEAM_IDS) {
      if (other === seat.teamId) continue;
      expect(canAccessTeam(subject, other)).toBe(false);
      expect(authorizeTeamPermission(subject, other, teamHomePermission(other))).toEqual({
        allowed: false,
        reason: 'no_membership',
      });
      expect(heroAccess(other, [membership])).toEqual({ ok: false, reason: 'denied' });
    }

    const hrefs = profileMenuLinks({ isOwner: false, teamIds: [seat.teamId] }).map((link) => link.href);
    for (const other of TEAM_IDS) {
      if (other === seat.teamId) continue;
      expect(hrefs).not.toContain(`/team/${other}`);
    }
  });

  it('una membresía abre el equipo y varias abren el selector', () => {
    expect(decideTeamHome(['community'])).toEqual({ kind: 'team', teamId: 'community' });
    expect(decideTeamHome(['growth', 'operations'])).toEqual({ kind: 'select' });
    expect(decideTeamHome([])).toEqual({ kind: 'no-access' });
  });

  it('Mi equipo ignora membresías suspendidas o removidas', () => {
    const memberships = [
      active('finance', 'finance_viewer', 'SUSPENDED'),
      active('hunter', 'hunter', 'REMOVED'),
      active('growth', 'growth_member', 'ACTIVE'),
    ];
    expect(visibleActiveTeamIds(memberships)).toEqual(['growth']);
    expect(heroAccess('finance', memberships)).toEqual({ ok: false, reason: 'denied' });
    expect(heroAccess('hunter', memberships)).toEqual({ ok: false, reason: 'denied' });
  });

  it('finance no ejecuta pagos y el hero no devuelve datos de otro equipo', () => {
    const finance = { memberships: [active('finance', 'finance_viewer')] };
    expect(authorizeTeamPermission(finance, 'finance', 'finance.overview.read')).toEqual({ allowed: true });
    expect(isTeamPermission('finance.payout.approve')).toBe(false);
    expect(isTeamPermission('finance.payout.create')).toBe(false);
    expect(EXCLUDED_TEAM_ACTIONS).toEqual(
      expect.arrayContaining(['finance.payout.create', 'finance.payout.approve']),
    );
    for (const excluded of EXCLUDED_TEAM_ACTIONS) {
      expect(isTeamPermission(excluded)).toBe(false);
    }

    const load = readFileSync('lib/team/hero/load.ts', 'utf8');
    expect(load).toContain("return { teamId: 'finance', facts: { frozen: isMoneyPathFrozen() } }");
    expect(load).not.toContain('payouts');
    expect(load).not.toContain("from('ledger");

    const page = readFileSync('app/team/[team]/page.tsx', 'utf8');
    const denyAt = page.indexOf("if (entry.kind !== 'allow') notFound()");
    const heroAt = page.indexOf('buildTeamHeroPayload({');
    expect(denyAt).toBeGreaterThan(-1);
    expect(heroAt).toBeGreaterThan(denyAt);

    const access = readFileSync('app/api/team/access/route.ts', 'utf8');
    expect(access).toContain('requireTeamPermission');
    expect(access).toContain('{ ok: true, teamId: access.membership.teamId, role: access.membership.role }');
    expect(access).not.toContain('access.memberships');
  });

  it('el owner conserva Founder OS y un miembro no entra por el gate de equipo', () => {
    expect(profileMenuLinks({ isOwner: true, teamIds: ['finance'] }).map((link) => link.href)).toEqual([
      '/admin/owner',
      '/team',
    ]);
    expect(canAccessAdmin('owner')).toBe(true);
    expect(canAccessAdmin('admin')).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
    expect(isStaffPathAllowed('/admin/owner', 'owner')).toBe(true);
    expect(isStaffPathAllowed('/admin/owner/team-management', 'owner')).toBe(true);
    expect(isStaffPathAllowed('/admin/team', 'owner')).toBe(true);
    expect(isStaffPathAllowed('/admin/owner', null)).toBe(false);
    expect(isStaffPathAllowed('/admin/owner', 'moderator')).toBe(false);
    expect(isStaffPathAllowed('/admin/owner', 'finance')).toBe(false);
    expect(resolveTeamNext('/admin/owner')).not.toBe('/admin/owner');
    expect(resolveTeamNext('/admin/owner')).toBe('/team/select');
  });
});
