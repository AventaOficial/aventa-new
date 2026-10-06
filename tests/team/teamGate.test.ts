import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canAccessAdmin } from '../../lib/admin/roles';
import { isStaffPathAllowed } from '../../lib/server/middlewareRoleGate';
import { membershipGrantsAdmin, type TeamMembership } from '../../lib/team';
import {
  consumeGateAttempt,
  decideTeamEntry,
  gateAttemptKey,
  interpretGate,
  membershipFromRow,
  readGateCredentials,
  readRequestedTeam,
  resetGateAttempts,
  resolveTeamNext,
  visibleActiveTeamIds,
} from '../../lib/team/gate/policy';
import {
  signTeamGate,
  TEAM_GATE_TTL_SECONDS,
  teamGateCookieOptions,
  verifyTeamGate,
  sessionIdFromAccessToken,
} from '../../lib/team/gate/token';

const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function member(
  teamId: TeamMembership['teamId'],
  role: TeamMembership['role'],
  status: TeamMembership['status'],
): TeamMembership {
  return { userId: 'user-1', teamId, role, status } as TeamMembership;
}

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-not-a-secret';
});

afterAll(() => {
  if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
});

describe('team gate destination', () => {
  it('manda al anónimo a login', () => {
    expect(decideTeamEntry({ hasSession: false, gateValid: false, activeTeamIds: [], requestedTeam: null })).toBe('login');
  });

  it('manda al autenticado sin gate de vuelta al gate', () => {
    expect(decideTeamEntry({ hasSession: true, gateValid: false, activeTeamIds: ['moderation'], requestedTeam: null })).toBe('gate');
  });

  it('continúa cuando el gate es válido y hay membresía', () => {
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: ['hunter'], requestedTeam: null })).toBe('select');
  });

  it('sin membresías activas no muestra equipos', () => {
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: [], requestedTeam: null })).toBe('no-access');
  });

  it('bloquea la URL directa de un equipo ajeno', () => {
    expect(
      decideTeamEntry({
        hasSession: true,
        gateValid: true,
        activeTeamIds: ['hunter'],
        requestedTeam: 'finance',
      }),
    ).toBe('forbidden');
  });

  it('permite solo el equipo de la membresía activa', () => {
    expect(
      decideTeamEntry({
        hasSession: true,
        gateValid: true,
        activeTeamIds: ['moderation'],
        requestedTeam: 'moderation',
      }),
    ).toBe('allow');
  });

  it('rechaza un id de equipo desconocido', () => {
    expect(
      decideTeamEntry({
        hasSession: true,
        gateValid: true,
        activeTeamIds: ['moderation'],
        requestedTeam: 'admin',
      }),
    ).toBe('forbidden');
  });
});

describe('team gate next', () => {
  it('rechaza redirects externos y rutas fuera de Team OS', () => {
    expect(resolveTeamNext('https://evil.example/team')).toBe('/team/select');
    expect(resolveTeamNext('//evil.example')).toBe('/team/select');
    expect(resolveTeamNext('/admin')).toBe('/team/select');
    expect(resolveTeamNext('/admin/owner')).toBe('/team/select');
    expect(resolveTeamNext('/team/../admin')).toBe('/team/select');
    expect(resolveTeamNext('/team/%2e%2e/admin')).toBe('/team/select');
    expect(resolveTeamNext('/team/moderation')).toBe('/team/moderation');
    expect(resolveTeamNext('/team/gate')).toBe('/team/select');
  });

  it('ignora userId, rol y teamGate enviados por el cliente', () => {
    expect(
      readGateCredentials({
        password: 'una-contraseña',
        email: 'person@example.com',
        userId: 'otra-persona',
        role: 'owner',
        permission: 'finance.overview.read',
        teamGate: true,
        next: 'https://evil.example',
      }),
    ).toEqual({
      ok: true,
      password: 'una-contraseña',
      email: 'person@example.com',
      next: '/team/select',
    });
  });
});

describe('team gate cookie', () => {
  it('ata la prueba al usuario y a la sesión, y la hace expirar', () => {
    const token = signTeamGate({ userId: 'user-1', sessionId: 'session-1', nowMs: 0, ttlSeconds: 15 * 60 });
    expect(token).toBeTruthy();
    expect(verifyTeamGate(token, { userId: 'user-1', sessionId: 'session-1', nowMs: 1_000 })).toMatchObject({ ok: true });
    expect(verifyTeamGate(token, { userId: 'user-2', sessionId: 'session-1', nowMs: 1_000 })).toMatchObject({
      ok: false,
      reason: 'user_mismatch',
    });
    expect(verifyTeamGate(token, { userId: 'user-1', sessionId: 'session-2', nowMs: 1_000 })).toMatchObject({
      ok: false,
      reason: 'session_mismatch',
    });
    expect(verifyTeamGate(token, { userId: 'user-1', sessionId: 'session-1', nowMs: 15 * 60 * 1000 })).toMatchObject({
      ok: false,
      reason: 'expired',
    });
    expect(verifyTeamGate(`${token}x`, { userId: 'user-1', sessionId: 'session-1', nowMs: 1_000 })).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('no autoriza la cookie si no hay sesión, aunque la firma sea válida', () => {
    const token = signTeamGate({ userId: 'user-1', sessionId: 'session-1', nowMs: 0 });
    const verification = verifyTeamGate(token, { userId: 'user-1', sessionId: 'session-1', nowMs: 1_000 });
    expect(interpretGate({ actor: null, verification })).toBe('unauthenticated');
    expect(interpretGate({ actor: { userId: 'user-1', sessionId: 'session-1' }, verification })).toBe('ok');
    expect(
      interpretGate({
        actor: { userId: 'user-1', sessionId: 'session-1' },
        verification: { ok: false, reason: 'expired' },
      }),
    ).toBe('gate_required');
  });

  it('usa cookie httpOnly, SameSite lax y secure solo en producción', () => {
    expect(teamGateCookieOptions(TEAM_GATE_TTL_SECONDS, false)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: TEAM_GATE_TTL_SECONDS,
    });
    expect(teamGateCookieOptions(TEAM_GATE_TTL_SECONDS, true).secure).toBe(true);
  });

  it('no emite gate si falta la clave del servidor', () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(signTeamGate({ userId: 'user-1', sessionId: 'session-1' })).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });

  it('lee session_id del access token ya validado', () => {
    const body = Buffer.from(JSON.stringify({ session_id: 'session-9', sub: 'user-1' })).toString('base64url');
    expect(sessionIdFromAccessToken(`header.${body}.sig`)).toBe('session-9');
    expect(sessionIdFromAccessToken('no-es-un-jwt')).toBeNull();
  });
});

describe('team membership visibility', () => {
  const activeModeration = member('moderation', 'moderator', 'ACTIVE');
  const activeHunter = member('hunter', 'hunter', 'ACTIVE');
  const suspended = member('growth', 'growth_member', 'SUSPENDED');
  const removed = member('finance', 'finance_viewer', 'REMOVED');

  it('muestra una o dos membresías activas y oculta SUSPENDED y REMOVED', () => {
    expect(visibleActiveTeamIds([activeModeration])).toEqual(['moderation']);
    expect(visibleActiveTeamIds([activeModeration, activeHunter])).toEqual(['moderation', 'hunter']);
    expect(visibleActiveTeamIds([suspended, removed])).toEqual([]);
    expect(visibleActiveTeamIds([activeModeration, suspended, removed])).toEqual(['moderation']);
  });

  it('no convierte una fila suspendida o removida en acceso', () => {
    expect(membershipFromRow('user-1', { teamId: 'growth', role: 'growth_member', status: 'SUSPENDED' })).toBeNull();
    expect(membershipFromRow('user-1', { teamId: 'finance', role: 'finance_viewer', status: 'REMOVED' })).toBeNull();
    expect(membershipFromRow('user-1', { teamId: 'moderation', role: 'moderator', status: 'ACTIVE' })).toMatchObject({
      status: 'ACTIVE',
      teamId: 'moderation',
    });
  });

  it('la API solo acepta un equipo del catálogo, no un usuario enviado por el cliente', () => {
    expect(readRequestedTeam('moderation')).toBe('moderation');
    expect(readRequestedTeam('user-1')).toBeNull();
    expect(readRequestedTeam('owner')).toBeNull();
  });
});

describe('team gate attempts', () => {
  it('bloquea el intento 9 dentro de la ventana', () => {
    resetGateAttempts();
    const key = gateAttemptKey({ userId: 'user-1', email: null });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(consumeGateAttempt(key, 1_000)).toBe(true);
    }
    expect(consumeGateAttempt(key, 1_000)).toBe(false);
    expect(consumeGateAttempt(key, 1_000 + 15 * 60 * 1000)).toBe(true);
    resetGateAttempts();
  });
});

describe('team gate no reabre admin ni moderación legacy', () => {
  it('una membresía no concede /admin y el plano anterior sigue igual', () => {
    expect(membershipGrantsAdmin()).toBe(false);
    expect(canAccessAdmin('owner')).toBe(true);
    expect(canAccessAdmin('admin')).toBe(false);
    expect(canAccessAdmin('moderator')).toBe(false);
    expect(canAccessAdmin('analyst')).toBe(false);
    expect(isStaffPathAllowed('/admin', 'moderator')).toBe(false);
    expect(isStaffPathAllowed('/admin', 'admin')).toBe(false);
    expect(isStaffPathAllowed('/admin/owner', 'owner')).toBe(true);
    expect(isStaffPathAllowed('/equipo/moderacion', 'moderator')).toBe(true);
  });

  it('el middleware deja /team fuera de user_roles', () => {
    const middleware = readFileSync('middleware.ts', 'utf8');
    const teamReturn = middleware.indexOf('Team OS no consulta user_roles');
    const roleLookup = middleware.indexOf('resolveUserStaffRole(');
    expect(teamReturn).toBeGreaterThan(-1);
    expect(roleLookup).toBeGreaterThan(teamReturn);
    expect(middleware).toContain("gate.pathname = '/team/gate'");
    expect(middleware).toContain("equipo.pathname = '/equipo/moderacion'");
  });

  it('las rutas de equipo no consultan user_roles ni localStorage', () => {
    const files = [
      'lib/team/gate/require.ts',
      'lib/team/gate/policy.ts',
      'lib/team/gate/token.ts',
      'lib/team/gate/memberships.ts',
      'lib/team/gate/password.ts',
      'lib/team/gate/session.ts',
      'app/api/team/gate/route.ts',
      'app/api/team/access/route.ts',
      'app/team/page.tsx',
      'app/team/[team]/page.tsx',
      'app/team/select/page.tsx',
      'app/team/no-access/page.tsx',
      'app/team/gate/page.tsx',
      'app/team/gate/TeamGateForm.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('user_roles');
      expect(source).not.toContain('localStorage');
    }
  });

  it('la página de área y la API niegan sin membresía', () => {
    const page = readFileSync('app/team/[team]/page.tsx', 'utf8');
    expect(page).toContain('notFound()');
    expect(page).toContain('resolveTeamPage');
    const route = readFileSync('app/api/team/access/route.ts', 'utf8');
    expect(route).toContain('requireTeamPermission');
    expect(route).toContain('teamHomePermission');
    expect(route).not.toContain("searchParams.get('userId')");
    expect(route).not.toContain("searchParams.get('role')");
    const requireSource = readFileSync('lib/team/gate/require.ts', 'utf8');
    expect(requireSource).toContain('requireAuthenticatedUser');
    expect(requireSource).toContain('requireTeamGate');
    expect(requireSource).toContain('requireTeamRole');
    expect(requireSource).toContain('requireTeamPermission');
    expect(requireSource).toContain('teamHomePermission');
    const resolver = requireSource.slice(requireSource.indexOf('export async function resolveTeamPage'));
    expect(resolver.indexOf("return { kind: 'login' }")).toBeLessThan(resolver.indexOf('loadActiveMemberships'));
    expect(resolver.indexOf("return { kind: 'gate' }")).toBeLessThan(resolver.indexOf('loadActiveMemberships'));
  });

  it('la pantalla sin acceso no nombra equipos internos', () => {
    const page = readFileSync('app/team/no-access/page.tsx', 'utf8');
    expect(page).toContain('Sin acceso a Team OS');
    expect(page).not.toContain('moderation');
    expect(page).not.toContain('finance');
  });
});
