import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAccessAdmin } from '../../lib/admin/roles';
import { isStaffPathAllowed } from '../../lib/server/middlewareRoleGate';
import { composeTeamHero } from '../../lib/team/hero/adapters';
import { membershipFromRow } from '../../lib/team/gate/policy';
import { decideTeamEntry } from '../../lib/team/gate/policy';
import { membershipGrantsAdmin } from '../../lib/team/authz/authorize';
import { ROLE_GRANTS, roleHasPermission } from '../../lib/team/permissions/grants';
import { TEAM_IDS } from '../../lib/team/roles/teams';
import { commitTeamXpGrant, EMPTY_TEAM_XP_STATE, teamXpBalance } from '../../lib/team/xp/ledger';
import { decideTeamXpGrant, type AuthorizedTeamXpGrant } from '../../lib/team/xp/policy';
import { formatTeamXpLabel, teamXpSummary } from '../../lib/team/xp/present';
import type { TeamMembership } from '../../lib/team/roles/membership';

function member(
  userId: string,
  teamId: TeamMembership['teamId'],
  role: TeamMembership['role'],
  status: TeamMembership['status'] = 'ACTIVE',
): TeamMembership {
  return { userId, teamId, role, status } as TeamMembership;
}

function base(overrides: Partial<Parameters<typeof decideTeamXpGrant>[0]> = {}) {
  return {
    actorUserId: 'actor-1',
    actorMemberships: [member('actor-1', 'moderation', 'moderation_lead')],
    recipientUserId: 'user-2',
    recipientStatus: 'ACTIVE' as const,
    teamId: 'moderation',
    amount: 25,
    source: 'manual.review',
    idempotencyKey: 'moderation.manual:event-1',
    kind: 'grant' as const,
    ...overrides,
  };
}

function authorized(overrides: Partial<AuthorizedTeamXpGrant> = {}): AuthorizedTeamXpGrant {
  return {
    actorUserId: 'actor-1',
    recipientUserId: 'user-2',
    teamId: 'moderation',
    amount: 25,
    source: 'manual.review',
    idempotencyKey: 'moderation.manual:event-1',
    kind: 'grant',
    compensatesKey: null,
    ...overrides,
  };
}

describe('community xp stays separate from team xp', () => {
  it('community xp sigue leyendo achievement_xp y el ledger de equipo no lo toca', () => {
    const community = readFileSync('lib/team/xp/community.ts', 'utf8');
    const sql = readFileSync('docs/supabase-migrations/team_xp.sql', 'utf8');
    const achievements = readFileSync('lib/achievements/sync.ts', 'utf8');
    expect(community).toContain("select('achievement_xp')");
    expect(community).not.toContain('team_xp_balances');
    expect(sql).not.toMatch(/achievement_xp|public\.profiles/);
    expect(achievements).toContain('grant_achievement_xp');
    expect(achievements).not.toContain('grant_team_xp');
  });

  it('el hero nombra las dos métricas por separado', () => {
    const membership = membershipFromRow('user-1', {
      teamId: 'moderation',
      role: 'moderator',
      status: 'ACTIVE',
    });
    if (!membership) throw new Error('membership');
    const payload = composeTeamHero({
      membership,
      greeting: 'Buenos días',
      personName: 'Jafet',
      communityXp: 40,
      teamXp: 12,
      facts: {
        teamId: 'moderation',
        facts: {
          pending: { origin: 'REAL', count: 1 },
          decisionsToday: { origin: 'CALCULATED', count: 0 },
        },
      },
    });
    expect(payload?.teamXp).toEqual({ scope: 'team', teamId: 'moderation', label: 'Team XP', value: '12' });
    expect(payload?.communityXp).toEqual({ scope: 'community', label: 'XP de comunidad', value: '40' });
    expect(payload?.teamXp?.value).not.toBe(payload?.communityXp?.value);
  });

  it('sin lectura de team xp no fabrica un cero', () => {
    expect(teamXpSummary('hunter', null)).toBeNull();
    expect(formatTeamXpLabel(null)).toBeNull();
  });

  it('un cero leído del acumulado se muestra como Team XP', () => {
    expect(teamXpSummary('operations', 0)?.value).toBe('0');
    expect(formatTeamXpLabel(0)).toBe('0 Team XP');
    expect(formatTeamXpLabel(500)).toBe('500 Team XP');
    expect(formatTeamXpLabel(500)).not.toContain('comunidad');
  });
});

describe('team xp ledger', () => {
  it('guarda xp distinto por equipo y no mueve el otro', () => {
    const first = commitTeamXpGrant(EMPTY_TEAM_XP_STATE, authorized({ amount: 500, idempotencyKey: 'moderation.manual:a' }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = commitTeamXpGrant(
      first.state,
      authorized({
        teamId: 'hunter',
        amount: 120,
        idempotencyKey: 'hunter.manual:b',
        source: 'manual.note',
      }),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(teamXpBalance(second.state, 'user-2', 'moderation')).toBe(500);
    expect(teamXpBalance(second.state, 'user-2', 'hunter')).toBe(120);
    expect(second.state.balances['user-2:community']).toBeUndefined();
  });

  it('el mismo evento dos veces deja un solo grant', () => {
    const grant = authorized();
    const first = commitTeamXpGrant(EMPTY_TEAM_XP_STATE, grant);
    expect(first.ok && first.applied).toBe(true);
    if (!first.ok) return;
    const second = commitTeamXpGrant(first.state, grant);
    expect(second).toMatchObject({ ok: true, applied: false, balance: 25, state: first.state });
    expect(second.ok && second.state.grants).toHaveLength(1);
  });

  it('rechaza cero, negativos sin compensación y equipo inválido', () => {
    expect(decideTeamXpGrant(base({ amount: 0 })).ok).toBe(false);
    expect(decideTeamXpGrant(base({ amount: -5 })).reason).toBe('invalid_amount');
    expect(decideTeamXpGrant(base({ teamId: 'moderacion' })).reason).toBe('invalid_team');
    expect(
      decideTeamXpGrant(
        base({
          kind: 'compensation',
          amount: -5,
          source: 'compensation',
          compensatesKey: 'moderation.manual:event-1',
          idempotencyKey: 'moderation.compensation:event-1',
        }),
      ).reason,
    ).toBe('missing_permission');
  });

  it('el userId y el teamId del cliente no cambian la decisión', () => {
    const server = decideTeamXpGrant(base());
    const withClient = decideTeamXpGrant(
      base({
        client: { userId: 'attacker', teamId: 'finance', amount: 9999, source: 'compensation' },
      }),
    );
    expect(withClient).toEqual(server);
    expect(server.reason).toBe('missing_permission');
  });

  it('sin membresía activa, suspendida o removed no concede', () => {
    expect(decideTeamXpGrant(base({ actorMemberships: [] })).reason).toBe('actor_not_active');
    expect(
      decideTeamXpGrant(base({ actorMemberships: [member('actor-1', 'moderation', 'moderator', 'SUSPENDED')] })).reason,
    ).toBe('actor_not_active');
    expect(decideTeamXpGrant(base({ recipientStatus: 'REMOVED' })).reason).toBe('recipient_not_active');
    expect(decideTeamXpGrant(base({ recipientStatus: 'SUSPENDED' })).reason).toBe('recipient_not_active');
    expect(decideTeamXpGrant(base({ recipientStatus: 'none' })).reason).toBe('recipient_not_active');
  });

  it('nadie se otorga xp a sí mismo y un miembro no tiene permiso de grant', () => {
    expect(decideTeamXpGrant(base({ recipientUserId: 'actor-1' })).reason).toBe('self_grant');
    for (const teamId of TEAM_IDS) {
      const roles = Object.keys(ROLE_GRANTS[teamId]);
      for (const role of roles) {
        expect(roleHasPermission(teamId, role, teamXpPermission(teamId))).toBe(false);
      }
    }
    expect(decideTeamXpGrant(base()).reason).toBe('missing_permission');
  });

  it('un actor no otorga xp en otro equipo', () => {
    expect(
      decideTeamXpGrant(
        base({
          teamId: 'hunter',
          actorMemberships: [member('actor-1', 'moderation', 'moderation_lead')],
        }),
      ).reason,
    ).toBe('wrong_team');
  });

  it('el grant y el acumulado se aplican juntos o no se aplican', () => {
    const compensation = authorized({
      amount: -5,
      source: 'compensation',
      kind: 'compensation',
      compensatesKey: 'moderation.manual:missing',
      idempotencyKey: 'moderation.compensation:missing',
    });
    const failed = commitTeamXpGrant(EMPTY_TEAM_XP_STATE, compensation);
    expect(failed).toEqual({ ok: false, reason: 'balance_underflow', state: EMPTY_TEAM_XP_STATE });

    const granted = commitTeamXpGrant(EMPTY_TEAM_XP_STATE, authorized());
    expect(granted.ok).toBe(true);
    if (!granted.ok) return;
    expect(granted.state.grants).toHaveLength(1);
    expect(teamXpBalance(granted.state, 'user-2', 'moderation')).toBe(25);
  });

  it('el historial no se reescribe', () => {
    const first = commitTeamXpGrant(EMPTY_TEAM_XP_STATE, authorized(), '2026-10-03T00:00:00.000Z');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const original = first.state.grants[0];
    const next = commitTeamXpGrant(
      first.state,
      authorized({ idempotencyKey: 'moderation.manual:event-2', amount: 10 }),
      '2026-10-03T01:00:00.000Z',
    );
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.state.grants[0]).toEqual(original);
    expect(original?.amount).toBe(25);
    const sql = readFileSync('docs/supabase-migrations/team_xp.sql', 'utf8');
    expect(sql).toContain('team_xp_grant_immutable');
    expect(sql).toContain('BEFORE UPDATE OR DELETE');
    expect(sql).not.toContain('UPDATE public.team_xp_grants');
  });
});

describe('team xp database contract', () => {
  it('idempotencia, rls y una sola función transaccional', () => {
    const sql = readFileSync('docs/supabase-migrations/team_xp.sql', 'utf8');
    expect(sql).toContain('team_xp_grants_idempotency_key');
    expect(sql).toContain('UNIQUE INDEX');
    expect(sql).toContain('INSERT INTO public.team_xp_grants');
    expect(sql).toContain('INSERT INTO public.team_xp_balances');
    expect(sql).toContain('balance_underflow');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON TABLE public.team_xp_grants FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.grant_team_xp');
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).toContain('self_grant');
    expect(existsSync('app/api/team/xp/route.ts')).toBe(false);
  });

  it('la concesión de aplicación no lee un body de cliente', () => {
    const source = readFileSync('lib/team/xp/grant.ts', 'utf8');
    expect(source).toContain('loadActiveMemberships');
    expect(source).toContain("rpc('grant_team_xp'");
    expect(source).not.toContain('request.json');
    expect(source).not.toContain('searchParams');
  });
});

describe('team xp does not reopen other surfaces', () => {
  it('admin sigue siendo solo del owner y equipo de moderación sigue abierto al staff', () => {
    expect(membershipGrantsAdmin()).toBe(false);
    expect(canAccessAdmin('moderator')).toBe(false);
    expect(canAccessAdmin('owner')).toBe(true);
    expect(isStaffPathAllowed('/equipo/moderacion', 'moderator')).toBe(true);
    expect(readFileSync('app/equipo/moderacion/page.tsx', 'utf8')).toContain('ModerationFocusWorkspace');
  });

  it('moderación de equipo conserva decidir y no gana grant de xp', () => {
    expect(roleHasPermission('moderation', 'moderator', 'moderation.offers.decide')).toBe(true);
    expect(roleHasPermission('moderation', 'moderation_lead', 'moderation.xp.grant')).toBe(false);
    expect(readFileSync('app/team/[team]/page.tsx', 'utf8')).toContain('moderation.offers.read');
  });

  it('el gate sigue resolviendo la entrada', () => {
    expect(
      decideTeamEntry({
        hasSession: false,
        gateValid: false,
        activeTeamIds: [],
        requestedTeam: 'moderation',
      }),
    ).toBe('login');
    expect(readFileSync('app/team/select/page.tsx', 'utf8')).toContain('formatTeamXpLabel');
    expect(readFileSync('app/team/select/page.tsx', 'utf8')).not.toContain('achievement_xp');
  });
});

function teamXpPermission(teamId: (typeof TEAM_IDS)[number]) {
  return `${teamId}.xp.grant` as const;
}
