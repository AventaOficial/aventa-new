import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canTransition, commitAssign, commitStatusChange } from '../../lib/team/membership/transitions';
import { readUserSearchParams } from '../../lib/team/membership/search';
import {
  canAssignCandidate,
  candidateState,
  matchesMemberFilter,
  reconcileMember,
  readMemberStatusFilter,
} from '../../lib/team/membership/view';
import { decideTeamEntry, membershipFromRow, resolveTeamNext, visibleActiveTeamIds } from '../../lib/team/gate/policy';
import type { TeamMembership } from '../../lib/team/roles/membership';

const { requireOwner, rpc, from } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/server/requireAdmin', () => ({ requireOwner }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => ({ rpc, from }) }));

const OWNER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';

type Call = { table: string; method: string; args: unknown[] };

/** Builder de PostgREST: registra llamadas y resuelve con la fila que devuelva `rows(table)`. */
function mockTables(rows: (table: string, calls: Call[]) => unknown) {
  const calls: Call[] = [];
  from.mockImplementation((table: string) => {
    const tableCalls: Call[] = [];
    const record = (method: string, args: unknown[]) => {
      const call = { table, method, args };
      calls.push(call);
      tableCalls.push(call);
    };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
      builder[method] = (...args: unknown[]) => {
        record(method, args);
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve({ data: rows(table, tableCalls), error: null });
    builder.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: rows(table, tableCalls), error: null }).then(resolve);
    return builder;
  });
  return calls;
}

function memberRow(overrides: Partial<Record<string, string>> = {}) {
  return {
    id: MEMBERSHIP,
    user_id: TARGET,
    team_id: 'moderation',
    role: 'moderator',
    status: 'ACTIVE',
    assigned_by: OWNER,
    created_at: '2026-10-04T00:00:00.000Z',
    status_changed_at: '2026-10-04T00:00:00.000Z',
    ...overrides,
  };
}

function allowOwner() {
  requireOwner.mockResolvedValue({ user: { id: OWNER }, role: 'owner' });
}

function usersRequest(query = '') {
  return new Request(`http://localhost/api/admin/owner/team-management/users${query}`);
}

function patch(body: unknown) {
  return new Request('http://localhost/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const member = (overrides: Partial<{ id: string; teamId: string; role: string; status: string }> = {}) => ({
  id: MEMBERSHIP,
  teamId: 'moderation',
  role: 'moderator',
  status: 'ACTIVE',
  ...overrides,
});

beforeEach(() => {
  requireOwner.mockReset();
  rpc.mockReset();
  from.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('A. la UI refleja el estado persistido tras la mutación', () => {
  it('reconcileMember reemplaza la fila con el rol persistido sin otra interacción', () => {
    const list = [member(), member({ id: 'other', teamId: 'hunter', role: 'hunter' })];
    const next = reconcileMember(list, member({ role: 'senior_moderator' }), { team: '', status: 'live' });
    expect(next[0]?.role).toBe('senior_moderator');
    expect(next[1]?.id).toBe('other');
    expect(list[0]?.role).toBe('moderator');
  });

  it('una alta nueva entra arriba; una fila que ya no cumple el filtro sale', () => {
    const added = reconcileMember([member({ id: 'old' })], member({ id: 'new' }), { team: '', status: 'live' });
    expect(added.map((item) => item.id)).toEqual(['new', 'old']);
    const suspended = reconcileMember([member()], member({ status: 'SUSPENDED' }), { team: '', status: 'ACTIVE' });
    expect(suspended).toEqual([]);
  });

  it('PATCH de rol responde con la membresía persistida', async () => {
    allowOwner();
    let afterRpc = false;
    rpc.mockImplementation(async () => {
      afterRpc = true;
      return { data: { ok: true, membership_id: MEMBERSHIP }, error: null };
    });
    mockTables((table) => {
      if (table === 'profiles') return [{ id: TARGET, display_name: 'Ana', username: 'ana' }];
      if (!afterRpc) return { user_id: TARGET, team_id: 'moderation' };
      return [memberRow({ role: 'senior_moderator' })];
    });
    const route = await import('../../app/api/admin/owner/team-management/members/[membershipId]/role/route');
    const response = await route.PATCH(patch({ role: 'senior_moderator', reason: 'experiencia' }), {
      params: Promise.resolve({ membershipId: MEMBERSHIP }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { membership: { role: string; displayName: string } };
    expect(body.membership.role).toBe('senior_moderator');
    expect(body.membership.displayName).toBe('Ana');
  });

  it('el cliente aplica la fila del servidor antes de recargar y descarta cargas viejas', () => {
    const client = read('app/admin/owner/team-management/TeamManagementClient.tsx');
    const mutate = client.slice(client.indexOf('async function mutate'), client.indexOf('function ask('));
    expect(mutate.indexOf('applyPersisted(body.membership)')).toBeGreaterThan(-1);
    expect(mutate.indexOf('applyPersisted(body.membership)')).toBeLessThan(mutate.indexOf('await load()'));
    expect(client).toContain('seq !== loadSeq.current');
    expect(client).not.toMatch(/location\.reload|setInterval\(/);
  });

  it('los errores de una acción se ven dentro del diálogo abierto, no detrás', () => {
    const client = read('app/admin/owner/team-management/TeamManagementClient.tsx');
    const mutate = client.slice(client.indexOf('async function mutate'), client.indexOf('function ask('));
    expect(mutate).toContain("setActionError(body?.error ?? 'No se pudo guardar.')");
    const assignDialog = client.slice(client.indexOf('id="assign-title"'), client.indexOf('{confirm ? ('));
    const confirmDialog = client.slice(client.indexOf('id="confirm-title"'));
    for (const dialog of [assignDialog, confirmDialog]) {
      expect(dialog).toContain('{actionError ? <p role="alert"');
    }
  });

  it('una carga fallida no muestra filas de otro filtro ni "no hay membresías"', () => {
    const client = read('app/admin/owner/team-management/TeamManagementClient.tsx');
    const load = client.slice(client.indexOf('const load = useCallback'), client.indexOf('const searchCandidates'));
    expect(load.match(/setMembers\(\[\]\);\s*setListFailed\(true\)/g)).toHaveLength(2);
    expect(client.indexOf('{listFailed ? (')).toBeLessThan(client.indexOf('No hay membresías con este filtro.'));
  });

  it('el buscador no dice "Sin resultados" antes de responder para el término actual', () => {
    const client = read('app/admin/owner/team-management/TeamManagementClient.tsx');
    expect(client).toContain("resultsFor !== query.trim()");
    expect(client).toMatch(/!searchPending && !searchError && candidates\.length === 0[\s\S]{0,120}Sin resultados\./);
  });
});

describe('B. ACTIVE → REMOVED', () => {
  it('la transición existe, se audita como salida y REMOVED es terminal', () => {
    expect(canTransition('ACTIVE', 'REMOVED')).toBe(true);
    expect(canTransition('SUSPENDED', 'REMOVED')).toBe(true);
    expect(canTransition('REMOVED', 'ACTIVE')).toBe(false);
    const result = commitStatusChange(
      { userId: TARGET, teamId: 'moderation', role: 'moderator', status: 'ACTIVE' },
      'REMOVED',
      'sale del equipo',
      { actorId: OWNER, requestId: REQUEST },
    );
    expect(result.ok && result.audit?.action).toBe('TEAM_MEMBER_REMOVED');
  });

  it('PATCH status REMOVED pasa por la RPC con el actor de sesión y devuelve la fila REMOVED', async () => {
    allowOwner();
    let afterRpc = false;
    rpc.mockImplementation(async () => {
      afterRpc = true;
      return { data: { ok: true, membership_id: MEMBERSHIP }, error: null };
    });
    mockTables((table) => {
      if (table === 'profiles') return [];
      if (!afterRpc) return { user_id: TARGET };
      return [memberRow({ status: 'REMOVED' })];
    });
    const route = await import('../../app/api/admin/owner/team-management/members/[membershipId]/status/route');
    const response = await route.PATCH(patch({ status: 'REMOVED', reason: 'sale del equipo', actorId: TARGET }), {
      params: Promise.resolve({ membershipId: MEMBERSHIP }),
    });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('team_set_status', expect.objectContaining({
      p_actor_id: OWNER,
      p_membership_id: MEMBERSHIP,
      p_status: 'REMOVED',
    }));
    const body = (await response.json()) as { membership: { status: string } };
    expect(body.membership.status).toBe('REMOVED');
  });

  it('REMOVED sin motivo se rechaza antes de la RPC', async () => {
    allowOwner();
    mockTables(() => ({ user_id: TARGET }));
    const route = await import('../../app/api/admin/owner/team-management/members/[membershipId]/status/route');
    const response = await route.PATCH(patch({ status: 'REMOVED' }), {
      params: Promise.resolve({ membershipId: MEMBERSHIP }),
    });
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('Team Management nunca borra membresías', () => {
    const source = sourceFiles(join(process.cwd(), 'app/api/admin/owner/team-management'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/\.delete\(/);
    expect(read('docs/supabase-migrations/team_os_memberships.sql')).toContain('team_memberships_no_delete');
  });
});

describe('C. REMOVED y SUSPENDED no dan acceso; REMOVED puede volver', () => {
  it('solo ACTIVE produce membresía de acceso', () => {
    expect(membershipFromRow(TARGET, { teamId: 'moderation', role: 'moderator', status: 'REMOVED' })).toBeNull();
    expect(membershipFromRow(TARGET, { teamId: 'moderation', role: 'moderator', status: 'SUSPENDED' })).toBeNull();
    expect(membershipFromRow(TARGET, { teamId: 'moderation', role: 'moderator', status: 'ACTIVE' })).not.toBeNull();
  });

  it('sin membresías ACTIVE no hay selector ni equipo', () => {
    const active = visibleActiveTeamIds([]);
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: active, requestedTeam: null })).toBe('no-access');
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: active, requestedTeam: 'moderation' })).toBe('forbidden');
  });

  it('el gate solo carga filas ACTIVE del usuario de sesión', async () => {
    const calls = mockTables(() => []);
    const { loadActiveMemberships } = await import('../../lib/team/gate/memberships');
    const loaded = await loadActiveMemberships(TARGET);
    expect(loaded).toEqual({ ok: true, memberships: [] });
    expect(calls).toContainEqual({ table: 'team_memberships', method: 'eq', args: ['user_id', TARGET] });
    expect(calls).toContainEqual({ table: 'team_memberships', method: 'eq', args: ['status', 'ACTIVE'] });
  });

  it('REMOVED no aparece en la vista de miembros actuales', () => {
    expect(matchesMemberFilter(member({ status: 'REMOVED' }), { team: '', status: 'live' })).toBe(false);
    expect(matchesMemberFilter(member({ status: 'SUSPENDED' }), { team: '', status: 'live' })).toBe(true);
    expect(readMemberStatusFilter('live')).toBe('live');
    expect(readMemberStatusFilter('DELETED')).toBeNull();
  });

  it('la lista de miembros actuales consulta ACTIVE y SUSPENDED', async () => {
    allowOwner();
    const calls = mockTables(() => []);
    const { GET } = await import('../../app/api/admin/owner/team-management/members/route');
    const response = await GET(new Request('http://localhost/api/admin/owner/team-management/members?status=live'));
    expect(response.status).toBe(200);
    expect(calls).toContainEqual({ table: 'team_memberships', method: 'in', args: ['status', ['ACTIVE', 'SUSPENDED']] });
  });

  it('REMOVED → nueva membresía ACTIVE: no hay membresía viva que lo impida', () => {
    const result = commitAssign(null, {
      actorId: OWNER,
      targetUserId: TARGET,
      teamId: 'moderation',
      role: 'moderator',
      reason: null,
      requestId: REQUEST,
    });
    expect(result.ok && result.audit?.newState).toEqual({ team_id: 'moderation', role: 'moderator', status: 'ACTIVE' });
    expect(read('docs/supabase-migrations/team_os_memberships.sql')).toMatch(
      /team_memberships_one_live[\s\S]*WHERE status IN \('ACTIVE', 'SUSPENDED'\)/,
    );
    const returning = candidateState({ self: false, memberships: [{ membershipId: MEMBERSHIP, teamId: 'moderation', role: 'moderator', status: 'REMOVED' }] }, 'moderation');
    expect(returning).toBe('returning');
    expect(canAssignCandidate(returning)).toBe(true);
  });
});

describe('D–H. GET /users', () => {
  it('D. Owner + q válido busca con el actor de sesión y anota membresías por equipo', async () => {
    allowOwner();
    rpc.mockResolvedValue({ data: [{ id: TARGET, display_name: 'Acosa', username: 'acosa' }], error: null });
    mockTables((table) => (table === 'team_memberships'
      ? [
        { id: MEMBERSHIP, user_id: TARGET, team_id: 'moderation', role: 'moderator', status: 'ACTIVE', created_at: '2026-10-04' },
        { id: OTHER, user_id: TARGET, team_id: 'moderation', role: 'moderator', status: 'REMOVED', created_at: '2026-10-01' },
      ]
      : []));
    const { GET } = await import('../../app/api/admin/owner/team-management/users/route');
    const response = await GET(usersRequest('?q=acosa'));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('team_search_users', { p_actor_id: OWNER, p_query: 'acosa', p_limit: 21, p_offset: 0 });
    const body = (await response.json()) as { users: Array<{ id: string; self: boolean; memberships: Array<{ status: string }> }>; hasMore: boolean };
    expect(body.users).toHaveLength(1);
    expect(body.users[0]?.self).toBe(false);
    expect(body.users[0]?.memberships).toEqual([{ membershipId: MEMBERSHIP, teamId: 'moderation', role: 'moderator', status: 'ACTIVE' }]);
    expect(body.hasMore).toBe(false);
  });

  it('E. Owner + q vacío o ausente pide la primera página', async () => {
    allowOwner();
    rpc.mockResolvedValue({ data: [{ id: OWNER, display_name: 'Owner', username: null }], error: null });
    mockTables(() => []);
    const { GET } = await import('../../app/api/admin/owner/team-management/users/route');
    for (const query of ['', '?q=', '?q=%20%20']) {
      rpc.mockClear();
      const response = await GET(usersRequest(query));
      expect(response.status).toBe(200);
      expect(rpc).toHaveBeenCalledWith('team_search_users', { p_actor_id: OWNER, p_query: '', p_limit: 21, p_offset: 0 });
      const body = (await response.json()) as { users: Array<{ self: boolean }> };
      expect(body.users[0]?.self).toBe(true);
    }
  });

  it('F. sin resultados devuelve [] con 200', async () => {
    allowOwner();
    rpc.mockResolvedValue({ data: [], error: null });
    mockTables(() => []);
    const { GET } = await import('../../app/api/admin/owner/team-management/users/route');
    const response = await GET(usersRequest('?q=nadie'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ users: [], page: 0, limit: 20, hasMore: false });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([403, 401])('G. sin Owner (%s) no busca ni lee tablas', async (status) => {
    requireOwner.mockResolvedValue({ error: status === 401 ? 'Unauthorized' : 'Forbidden', status });
    const { GET } = await import('../../app/api/admin/owner/team-management/users/route');
    const response = await GET(usersRequest('?q=acosa'));
    expect(response.status).toBe(status);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('H. paginación: offset por página, fila extra para hasMore y topes', async () => {
    allowOwner();
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
      display_name: `U${index}`,
      username: null,
    }));
    rpc.mockResolvedValue({ data: rows, error: null });
    mockTables(() => []);
    const { GET } = await import('../../app/api/admin/owner/team-management/users/route');
    const response = await GET(usersRequest('?page=2&limit=10'));
    expect(rpc).toHaveBeenCalledWith('team_search_users', { p_actor_id: OWNER, p_query: '', p_limit: 11, p_offset: 20 });
    const body = (await response.json()) as { users: unknown[]; hasMore: boolean; page: number };
    expect(body.users).toHaveLength(10);
    expect(body.hasMore).toBe(true);
    expect(body.page).toBe(2);

    for (const query of ['?limit=51', '?limit=0', '?limit=abc', '?page=-1', '?page=1.5', '?page=100000']) {
      rpc.mockClear();
      const rejected = await GET(usersRequest(query));
      expect(rejected.status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it('caracteres especiales llegan tal cual a la RPC; q muy largo se rechaza', async () => {
    allowOwner();
    rpc.mockResolvedValue({ data: [], error: null });
    const { GET } = await import('../../app/api/admin/owner/team-management/users/route');
    const special = "%_\\'; drop table x --";
    const response = await GET(usersRequest(`?q=${encodeURIComponent(special)}`));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('team_search_users', expect.objectContaining({ p_query: special.trim() }));

    rpc.mockClear();
    const long = await GET(usersRequest(`?q=${'a'.repeat(81)}`));
    expect(long.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(readUserSearchParams(new URLSearchParams(`q=${'a'.repeat(80)}`)).ok).toBe(true);
  });

  it('un error real de base de datos se registra y responde 500 estable', async () => {
    allowOwner();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for table users' } });
    const { GET } = await import('../../app/api/admin/owner/team-management/users/route');
    const response = await GET(usersRequest('?q=acosa'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'No se pudo completar la operación.' });
    expect(log).toHaveBeenCalledWith('[team-management] team_search_users failed', expect.objectContaining({ code: '42501' }));
  });

  it('la migración de corrección no lee auth.users, no usa SECURITY DEFINER y limita la página', () => {
    const sql = read('docs/supabase-migrations/team_os_owner_fixes.sql');
    const body = sql.replace(/^--.*$/gm, '');
    expect(body).not.toMatch(/auth\.users/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/p_limit > 51/);
    expect(body).toMatch(/ESCAPE '\\'/);
    expect(body).toMatch(/REVOKE ALL ON FUNCTION public\.team_search_users\(uuid, text, integer, integer\) FROM PUBLIC, anon, authenticated/);
    expect(body).toMatch(/GRANT EXECUTE ON FUNCTION public\.team_search_users\(uuid, text, integer, integer\) TO service_role/);
    expect(body).not.toMatch(/\bDELETE\b|ALTER TABLE|DISABLE ROW LEVEL SECURITY|GRANT [A-Z, ]+ ON TABLE/);
  });
});

describe('I–J. /team/gate y /team/select', () => {
  it('I. /team/gate existe, el middleware lo deja pasar sin sesión y el next solo apunta a Team OS', () => {
    expect(existsSync(join(process.cwd(), 'app/team/gate/page.tsx'))).toBe(true);
    const middleware = read('middleware.ts');
    expect(middleware).toContain("if (isTeamGatePath(pathname)) return response;");
    expect(resolveTeamNext('/team/select')).toBe('/team/select');
    expect(resolveTeamNext('/admin/owner/team/select')).toBe('/team/select');
  });

  it('J. /team/select existe y manda al gate sin sesión válida', () => {
    expect(existsSync(join(process.cwd(), 'app/team/select/page.tsx'))).toBe(true);
    expect(read('app/team/select/page.tsx')).toContain("redirect('/team/gate?next=/team/select')");
    expect(existsSync(join(process.cwd(), 'app/admin/owner/team'))).toBe(false);
  });

  it('ningún enlace a Team OS es relativo; Team Management abre la ruta canónica', () => {
    const offenders = sourceFiles(join(process.cwd(), 'app'))
      .filter((file) => /(href|redirect|push|replace)\(?\s*[=(]?\s*[{]?\s*['"`](\.\/)?team\//.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
    expect(read('app/admin/owner/team-management/TeamManagementClient.tsx')).toContain('href="/team"');
  });
});

describe('K. aislamiento entre equipos', () => {
  const moderator = membershipFromRow(TARGET, { teamId: 'moderation', role: 'moderator', status: 'ACTIVE' });
  const memberships = [moderator].filter((item): item is TeamMembership => item !== null);

  it('un miembro de A entra a A y no a B', () => {
    const active = visibleActiveTeamIds(memberships);
    expect(active).toEqual(['moderation']);
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: active, requestedTeam: 'moderation' })).toBe('allow');
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: active, requestedTeam: 'hunter' })).toBe('forbidden');
    expect(decideTeamEntry({ hasSession: true, gateValid: true, activeTeamIds: active, requestedTeam: 'admin' })).toBe('forbidden');
  });

  it('sin sesión o sin gate no se llega a mirar el equipo', () => {
    expect(decideTeamEntry({ hasSession: false, gateValid: false, activeTeamIds: ['moderation'], requestedTeam: 'moderation' })).toBe('login');
    expect(decideTeamEntry({ hasSession: true, gateValid: false, activeTeamIds: ['moderation'], requestedTeam: 'moderation' })).toBe('gate');
  });

  it('el cliente no puede elegir actor ni rol del Owner al asignar', async () => {
    allowOwner();
    rpc.mockResolvedValue({ data: { ok: true, membership_id: MEMBERSHIP }, error: null });
    mockTables((table) => (table === 'team_memberships' ? [memberRow()] : []));
    const { POST } = await import('../../app/api/admin/owner/team-management/members/route');
    const response = await POST(new Request('http://localhost/api/admin/owner/team-management/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: TARGET, teamId: 'moderation', role: 'moderator', actorId: TARGET, p_actor_id: TARGET }),
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('team_assign_member', expect.objectContaining({ p_actor_id: OWNER, p_target_user_id: TARGET }));
    const body = (await response.json()) as { membership: { id: string; status: string } };
    expect(body.membership).toEqual(expect.objectContaining({ id: MEMBERSHIP, status: 'ACTIVE' }));
  });
});
