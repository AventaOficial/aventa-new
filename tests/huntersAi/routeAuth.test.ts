import { beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_TOKEN = 'valid-session-token-for-test';
const MODERATOR_ID = '33333333-3333-4333-8333-333333333333';
const BATCH_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '11111111-1111-4111-8111-111111111111';

const supa = vi.hoisted(() => ({
  getUser: vi.fn(),
  roles: [] as Array<{ role: string }>,
  memberships: [] as Array<{ team_id: string; role: string; status: string }>,
  rolesQueried: vi.fn(),
  membershipsQueried: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser: supa.getUser },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => {
          if (table === 'team_memberships') supa.membershipsQueried(table);
          else supa.rolesQueried(table);
          return chain;
        },
        in: async () => ({ data: supa.roles, error: null }),
        then: (resolve: (value: unknown) => void) => {
          if (table === 'team_memberships') {
            resolve({ data: supa.memberships, error: null });
          } else {
            resolve({ data: supa.roles, error: null });
          }
        },
      };
      return chain;
    },
  }),
}));

const queue = vi.hoisted(() => ({ loadHunterQueue: vi.fn() }));
vi.mock('@/lib/huntersAi/queue', () => queue);

const decide = vi.hoisted(() => ({
  approveHunterCandidate: vi.fn(),
  approveHunterCandidates: vi.fn(),
  editHunterCandidate: vi.fn(),
  rejectHunterCandidate: vi.fn(),
  rejectHunterCandidates: vi.fn(),
  uniqueTargets: (items: unknown[]) => items,
}));
vi.mock('@/lib/huntersAi/decide', () => decide);

import { GET, POST } from '@/app/api/admin/hunters-ai/route';

function getRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/admin/hunters-ai?status=PENDING', { headers });
}

function postRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/admin/hunters-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'approve', batchId: BATCH_ID, itemId: ITEM_ID }),
  });
}

function expectNoDataTouched() {
  expect(queue.loadHunterQueue).not.toHaveBeenCalled();
  expect(decide.approveHunterCandidate).not.toHaveBeenCalled();
  expect(decide.approveHunterCandidates).not.toHaveBeenCalled();
  expect(decide.rejectHunterCandidate).not.toHaveBeenCalled();
  expect(decide.rejectHunterCandidates).not.toHaveBeenCalled();
  expect(decide.editHunterCandidate).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  supa.roles = [];
  supa.memberships = [];
  supa.getUser.mockImplementation(async (token: string) =>
    token === VALID_TOKEN
      ? { data: { user: { id: MODERATOR_ID } }, error: null }
      : { data: { user: null }, error: { message: 'invalid JWT' } },
  );
  queue.loadHunterQueue.mockResolvedValue({ items: [], page: 1, pageSize: 20, hasMore: false });
  decide.approveHunterCandidate.mockResolvedValue({ ok: true, item: { offer_id: 'offer-1' } });
});

describe('Hunters IA · credenciales en /api/admin/hunters-ai (validación real del Bearer)', () => {
  it.each([
    ['sin cabecera', {}],
    ['Bearer vacío (cliente sin sesión)', { Authorization: 'Bearer ' }],
    ['esquema distinto de Bearer', { Authorization: `Basic ${VALID_TOKEN}` }],
  ])('%s => 401 sin consultar Supabase ni tocar datos', async (_label, headers) => {
    for (const res of [await GET(getRequest(headers)), await POST(postRequest(headers))]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    }
    expect(supa.getUser).not.toHaveBeenCalled();
    expectNoDataTouched();
  });

  it('token inválido => 401, sin consultar roles ni reflejar el token', async () => {
    const headers = { Authorization: 'Bearer not-a-real-session' };
    for (const res of [await GET(getRequest(headers)), await POST(postRequest(headers))]) {
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).not.toContain('not-a-real-session');
      expect(text).not.toContain('invalid JWT');
    }
    expect(supa.getUser).toHaveBeenCalledWith('not-a-real-session');
    expect(supa.rolesQueried).not.toHaveBeenCalled();
    expectNoDataTouched();
  });

  it('token válido sin rol de moderación => 403 sin tocar datos', async () => {
    supa.roles = [];
    const headers = { Authorization: `Bearer ${VALID_TOKEN}` };
    for (const res of [await GET(getRequest(headers)), await POST(postRequest(headers))]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden' });
    }
    expect(supa.membershipsQueried).toHaveBeenCalledWith('team_memberships');
    expectNoDataTouched();
  });

  it('token válido de moderador => GET lee la cola y POST decide con el actor autenticado', async () => {
    supa.memberships = [{ team_id: 'moderation', role: 'moderator', status: 'ACTIVE' }];
    const headers = { Authorization: `Bearer ${VALID_TOKEN}` };

    const list = await GET(getRequest(headers));
    expect(list.status).toBe(200);
    expect(list.headers.get('Cache-Control')).toBe('no-store');
    expect(queue.loadHunterQueue).toHaveBeenCalledTimes(1);
    expect(supa.rolesQueried).not.toHaveBeenCalledWith('user_roles');

    const approve = await POST(postRequest(headers));
    expect(approve.status).toBe(200);
    expect(decide.approveHunterCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: BATCH_ID, itemId: ITEM_ID, actorId: MODERATOR_ID }),
    );
    expect(await approve.text()).not.toContain(VALID_TOKEN);
  });
});
