import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireOwner, rpc, from } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/server/requireAdmin', () => ({
  requireOwner,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ rpc, from }),
}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP = '44444444-4444-4444-8444-444444444444';

function deny() {
  requireOwner.mockResolvedValue({ error: 'Forbidden', status: 403 });
}

function allowOwner() {
  requireOwner.mockResolvedValue({ user: { id: OWNER }, role: 'owner' });
}

function jsonRequest(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('owner team management API', () => {
  beforeEach(() => {
    requireOwner.mockReset();
    rpc.mockReset();
    from.mockReset();
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it.each(['normal', 'team_member', 'moderator', 'analyst', 'admin'])(
    '%s recibe 403 y no llama la RPC',
    async () => {
      deny();
      const { POST } = await import('../../app/api/admin/owner/team-management/members/route');
      const response = await POST(jsonRequest('/api/admin/owner/team-management/members', {
        userId: TARGET,
        teamId: 'moderation',
        role: 'moderator',
      }));
      expect(response.status).toBe(403);
      expect(rpc).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    },
  );

  it('el owner asigna con su id de sesión, no con un actor del cuerpo', async () => {
    allowOwner();
    const { POST } = await import('../../app/api/admin/owner/team-management/members/route');
    const response = await POST(jsonRequest('/api/admin/owner/team-management/members', {
      userId: TARGET,
      teamId: 'moderation',
      role: 'moderator',
      reason: 'alta',
      actorId: TARGET,
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('team_assign_member', expect.objectContaining({
      p_actor_id: OWNER,
      p_target_user_id: TARGET,
      p_team_id: 'moderation',
      p_role: 'moderator',
    }));
    const args = rpc.mock.calls[0]?.[1] as { p_actor_id: string; p_request_id: string };
    expect(args.p_actor_id).not.toBe(TARGET);
    expect(args.p_request_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('el owner no puede asignarse a sí mismo', async () => {
    allowOwner();
    const { POST } = await import('../../app/api/admin/owner/team-management/members/route');
    const response = await POST(jsonRequest('/api/admin/owner/team-management/members', {
      userId: OWNER,
      teamId: 'moderation',
      role: 'moderation_lead',
    }));
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('el owner lista membresías sin columnas sensibles', async () => {
    allowOwner();
    const selects: string[] = [];
    from.mockImplementation((table: string) => {
      const builder = {
        select(columns: string) {
          selects.push(`${table}:${columns}`);
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({
            data: table === 'team_memberships' ? { user_id: TARGET, team_id: 'moderation' } : null,
            error: null,
          });
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          const data = table === 'team_memberships'
            ? [{
              id: MEMBERSHIP,
              user_id: TARGET,
              team_id: 'moderation',
              role: 'moderator',
              status: 'ACTIVE',
              assigned_by: OWNER,
              created_at: '2026-10-03T00:00:00.000Z',
              status_changed_at: '2026-10-03T00:00:00.000Z',
            }]
            : [{ id: TARGET, display_name: 'Ana', username: 'ana' }];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    });
    const { GET } = await import('../../app/api/admin/owner/team-management/members/route');
    const response = await GET(jsonRequest('/api/admin/owner/team-management/members'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { members: Array<{ userId: string }> };
    expect(body.members[0]?.userId).toBe(TARGET);
    expect(selects.join('\n')).not.toMatch(/clabe|phone|rfc|commission|password|token/i);
  });

  it('cambiar rol y estado pasan por requireOwner y rechazan el auto-cambio', async () => {
    allowOwner();
    from.mockImplementation(() => {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: { user_id: OWNER, team_id: 'moderation' }, error: null });
        },
      };
      return builder;
    });
    const roleRoute = await import('../../app/api/admin/owner/team-management/members/[membershipId]/role/route');
    const statusRoute = await import('../../app/api/admin/owner/team-management/members/[membershipId]/status/route');
    const roleResponse = await roleRoute.PATCH(
      new Request('http://localhost/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'senior_moderator', reason: 'yo' }),
      }),
      { params: Promise.resolve({ membershipId: MEMBERSHIP }) },
    );
    const statusResponse = await statusRoute.PATCH(
      new Request('http://localhost/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SUSPENDED', reason: 'yo' }),
      }),
      { params: Promise.resolve({ membershipId: MEMBERSHIP }) },
    );
    expect(roleResponse.status).toBe(403);
    expect(statusResponse.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('owner puede cambiar rol y suspender cuando el target es otra persona', async () => {
    allowOwner();
    from.mockImplementation(() => {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: { user_id: TARGET, team_id: 'moderation' }, error: null });
        },
      };
      return builder;
    });
    const roleRoute = await import('../../app/api/admin/owner/team-management/members/[membershipId]/role/route');
    const statusRoute = await import('../../app/api/admin/owner/team-management/members/[membershipId]/status/route');
    const roleResponse = await roleRoute.PATCH(
      new Request('http://localhost/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'senior_moderator', reason: 'experiencia' }),
      }),
      { params: Promise.resolve({ membershipId: MEMBERSHIP }) },
    );
    const statusResponse = await statusRoute.PATCH(
      new Request('http://localhost/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SUSPENDED', reason: 'pausa' }),
      }),
      { params: Promise.resolve({ membershipId: MEMBERSHIP }) },
    );
    expect(roleResponse.status).toBe(200);
    expect(statusResponse.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('team_change_role', expect.objectContaining({
      p_actor_id: OWNER,
      p_membership_id: MEMBERSHIP,
      p_role: 'senior_moderator',
    }));
    expect(rpc).toHaveBeenCalledWith('team_set_status', expect.objectContaining({
      p_actor_id: OWNER,
      p_status: 'SUSPENDED',
    }));
  });

  it('las rutas no usan requireAdmin, requireTeamManagement ni requireStaff', () => {
    const files = [
      'app/api/admin/owner/team-management/shared.ts',
      'app/api/admin/owner/team-management/members/route.ts',
      'app/api/admin/owner/team-management/members/[membershipId]/role/route.ts',
      'app/api/admin/owner/team-management/members/[membershipId]/status/route.ts',
      'app/api/admin/owner/team-management/users/route.ts',
      'app/api/admin/owner/team-management/audit/route.ts',
    ];
    const source = files.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
    expect(source).toMatch(/requireOwner/);
    expect(source).not.toMatch(/requireAdmin\(/);
    expect(source).not.toMatch(/requireTeamManagement/);
    expect(source).not.toMatch(/requireStaff/);
    expect(source).not.toMatch(/user_roles/);
  });
});
