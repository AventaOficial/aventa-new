import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAccessAdmin } from '../../lib/admin/roles';
import { canUseBulkModeration } from '../../lib/moderation/moderationBulkAccess';
import { moderationMaxLevelForRole } from '../../lib/moderation/moderationMaxLevelForRole';
import { authorizeTeamPermission, membershipGrantsAdmin } from '../../lib/team/authz/authorize';
import { decideTeamEntry } from '../../lib/team/gate/policy';
import { planModerationAccess } from '../../lib/team/moderation/plan';
import type { TeamMembership } from '../../lib/team/roles/membership';

function member(
  teamId: TeamMembership['teamId'],
  role: TeamMembership['role'],
  status: TeamMembership['status'] = 'ACTIVE',
): TeamMembership {
  return { userId: 'user-1', teamId, role, status } as TeamMembership;
}

const queueRoutes = [
  'app/api/admin/moderation/claim-next/route.ts',
  'app/api/admin/moderate-offer/route.ts',
  'app/api/admin/moderation-snooze/route.ts',
  'app/api/admin/update-offer/route.ts',
  'app/api/admin/moderation-lock/route.ts',
];

describe('team moderation authorization', () => {
  it('sin sesión no abre la acción', () => {
    const plan = planModerationAccess({
      legacy: { ok: false, status: 401 },
      team: { ok: false, status: 401 },
      bearerUserId: null,
    });
    expect(plan).toEqual({ ok: false, status: 401 });
    expect(
      decideTeamEntry({
        hasSession: false,
        gateValid: false,
        activeTeamIds: [],
        requestedTeam: 'moderation',
      }),
    ).toBe('login');
  });

  it('autenticado sin membresía no entra a la URL ni a la acción', () => {
    expect(
      decideTeamEntry({
        hasSession: true,
        gateValid: true,
        activeTeamIds: [],
        requestedTeam: null,
      }),
    ).toBe('no-access');
    expect(
      decideTeamEntry({
        hasSession: true,
        gateValid: true,
        activeTeamIds: [],
        requestedTeam: 'moderation',
      }),
    ).toBe('forbidden');
    const plan = planModerationAccess({
      legacy: { ok: false, status: 403 },
      team: { ok: false, status: 403 },
      bearerUserId: 'user-1',
    });
    expect(plan).toEqual({ ok: false, status: 403 });
  });

  it('membresía SUSPENDED no autoriza', () => {
    const decision = authorizeTeamPermission(
      { memberships: [member('moderation', 'moderator', 'SUSPENDED')] },
      'moderation',
      'moderation.offers.decide',
    );
    expect(decision).toEqual({ allowed: false, reason: 'membership_inactive' });
  });

  it('membresía REMOVED no autoriza', () => {
    const decision = authorizeTeamPermission(
      { memberships: [member('moderation', 'moderator', 'REMOVED')] },
      'moderation',
      'moderation.offers.decide',
    );
    expect(decision).toEqual({ allowed: false, reason: 'membership_inactive' });
  });

  it('un miembro de growth no abre /team/moderation', () => {
    expect(
      decideTeamEntry({
        hasSession: true,
        gateValid: true,
        activeTeamIds: ['growth'],
        requestedTeam: 'moderation',
      }),
    ).toBe('forbidden');
    expect(
      authorizeTeamPermission(
        { memberships: [member('growth', 'growth_member')] },
        'moderation',
        'moderation.offers.decide',
      ).allowed,
    ).toBe(false);
  });

  it('un moderador no recibe permiso de finance', () => {
    const decision = authorizeTeamPermission(
      { memberships: [member('moderation', 'moderator')] },
      'finance',
      'finance.overview.read',
    );
    expect(decision.allowed).toBe(false);
    const financeRoute = readFileSync('app/api/staff/finance/route.ts', 'utf8');
    expect(financeRoute).toContain('requireFinanceRead');
    expect(financeRoute).not.toContain('requireModerationActor');
  });

  it('sin permiso de decisión la acción se niega', () => {
    const plan = planModerationAccess({
      legacy: { ok: false, status: 403 },
      team: { ok: true, userId: 'user-1', canDecide: false },
      bearerUserId: 'user-1',
    });
    expect(plan).toEqual({ ok: false, status: 403 });
    expect(
      authorizeTeamPermission(
        { memberships: [member('moderation', 'moderator')] },
        'moderation',
        'moderation.metrics.read',
      ),
    ).toEqual({ allowed: false, reason: 'missing_permission' });
  });

  it('un bearer de otro usuario no hereda la membresía', () => {
    const plan = planModerationAccess({
      legacy: { ok: false, status: 403 },
      team: { ok: true, userId: 'user-1', canDecide: true },
      bearerUserId: 'user-2',
    });
    expect(plan).toEqual({ ok: false, status: 403 });
  });

  it('el equipo pedido por el cliente no eleva permisos', () => {
    const decision = authorizeTeamPermission(
      { memberships: [member('moderation', 'moderation_lead')] },
      'moderation',
      'finance.overview.read',
    );
    expect(decision).toEqual({ allowed: false, reason: 'wrong_team' });
  });

  it('la membresía de equipo no abre /admin', () => {
    expect(membershipGrantsAdmin()).toBe(false);
    expect(canAccessAdmin('moderator')).toBe(false);
    expect(canAccessAdmin('owner')).toBe(true);
  });

  it('la membresía reutiliza la cola con el nivel de moderador, sin lote', () => {
    const plan = planModerationAccess({
      legacy: { ok: false, status: 403 },
      team: { ok: true, userId: 'user-1', canDecide: true },
      bearerUserId: 'user-1',
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.via).toBe('team_membership');
    expect(plan.userId).toBe('user-1');
    expect(plan.domainRole).toBe('moderator');
    expect(moderationMaxLevelForRole(plan.domainRole)).toBe('review');
    expect(canUseBulkModeration(plan.domainRole)).toBe(false);
  });

  it('el staff existente conserva su rol de dominio', () => {
    const plan = planModerationAccess({
      legacy: { ok: true, userId: 'owner-1', role: 'owner' },
      team: null,
      bearerUserId: 'owner-1',
    });
    expect(plan).toMatchObject({ ok: true, domainRole: 'owner', via: 'staff_role' });
    if (!plan.ok) return;
    expect(canUseBulkModeration(plan.domainRole)).toBe(true);
    expect(moderationMaxLevelForRole(plan.domainRole)).toBe('enforcement');
  });
});

describe('team moderation routes stay on the existing domain', () => {
  it('claim, decisión, edición, snooze y lock validan en servidor', () => {
    for (const route of queueRoutes) {
      const source = readFileSync(route, 'utf8');
      expect(source).toContain('requireModerationActor');
      expect(source).not.toContain('requireModeration(');
    }
    const claim = readFileSync(queueRoutes[0]!, 'utf8');
    expect(claim).toContain('claimNextModerationOffer');
    const lock = readFileSync('app/api/admin/moderation-lock/route.ts', 'utf8');
    expect(lock).toContain('tryAcquireModerationLock');
  });

  it('reclaim-stale no pasa al permiso de equipo', () => {
    const source = readFileSync('app/api/admin/moderation/reclaim-stale/route.ts', 'utf8');
    expect(source).toMatch(/requireOwner\(|requireAdmin\(/);
    expect(source).not.toContain('requireModerationActor');
    expect(source).not.toContain('requireTeamPermission');
  });

  it('la página de equipo no autoriza con user_roles', () => {
    const page = readFileSync('app/team/[team]/page.tsx', 'utf8');
    expect(page).toContain('resolveTeamPage');
    expect(page).toContain('moderation.offers.read');
    expect(page).toContain('ModerationWorkspace');
    expect(page).not.toContain('user_roles');
    const workspace = readFileSync('app/team/moderation/ModerationWorkspace.tsx', 'utf8');
    expect(workspace).toContain('ModerationFocusWorkspace');
    expect(workspace).toContain('queueBasePath="/team/moderation"');
  });
});
