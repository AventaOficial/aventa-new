import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireOwner,
  createServerClient,
  loadAuthUserForEquipoPassword,
  sendEquipoPasswordRecoveryEmail,
  setTemporaryEquipoPassword,
  supabaseClient,
} = vi.hoisted(() => {
  const client = { marker: 'server-client' };
  return {
    requireOwner: vi.fn(),
    createServerClient: vi.fn(() => client),
    loadAuthUserForEquipoPassword: vi.fn(),
    sendEquipoPasswordRecoveryEmail: vi.fn(),
    setTemporaryEquipoPassword: vi.fn(),
    supabaseClient: client,
  };
});

vi.mock('@/lib/server/requireAdmin', () => ({ requireOwner }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient }));
vi.mock('@/lib/admin/equipoPassword', () => ({
  loadAuthUserForEquipoPassword,
  sendEquipoPasswordRecoveryEmail,
  setTemporaryEquipoPassword,
}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';

function request(userId: string, body?: unknown) {
  return new Request(`http://localhost/api/admin/team-os/users/${userId}/access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

function ownerSession() {
  requireOwner.mockResolvedValue({ user: { id: OWNER }, role: 'owner' });
}

describe('Team OS credential route', () => {
  beforeEach(() => {
    requireOwner.mockReset();
    createServerClient.mockClear();
    loadAuthUserForEquipoPassword.mockReset();
    sendEquipoPasswordRecoveryEmail.mockReset();
    setTemporaryEquipoPassword.mockReset();
    ownerSession();
    loadAuthUserForEquipoPassword.mockResolvedValue({
      ok: true,
      email: 'ana@example.com',
      hasEmailPassword: true,
    });
    sendEquipoPasswordRecoveryEmail.mockResolvedValue({ ok: true });
    setTemporaryEquipoPassword.mockResolvedValue({
      ok: true,
      temporaryPassword: 'temporary-Aa1!',
    });
  });

  it('cannot rotate the current owner password through a collaborator row', async () => {
    const { POST } = await import('../../app/api/admin/team-os/users/[userId]/access/route');
    const response = await POST(
      request(OWNER, { action: 'generate_temporary' }),
      { params: Promise.resolve({ userId: OWNER }) },
    );

    expect(response.status).toBe(400);
    expect(setTemporaryEquipoPassword).not.toHaveBeenCalled();
    expect(loadAuthUserForEquipoPassword).not.toHaveBeenCalled();
  });

  it('rotates another account password only after an explicit action', async () => {
    const { POST } = await import('../../app/api/admin/team-os/users/[userId]/access/route');
    const response = await POST(
      request(TARGET, { action: 'generate_temporary' }),
      { params: Promise.resolve({ userId: TARGET }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(setTemporaryEquipoPassword).toHaveBeenCalledWith(supabaseClient, TARGET);
    expect(body.temporary_password).toBe('temporary-Aa1!');
    expect(body.message).toContain('contraseña global de Supabase Auth');
    expect(requireOwner).toHaveBeenCalledTimes(1);
  });

  it('sends a recovery link by default and does not rotate the password', async () => {
    const { POST } = await import('../../app/api/admin/team-os/users/[userId]/access/route');
    const response = await POST(
      request(TARGET),
      { params: Promise.resolve({ userId: TARGET }) },
    );

    expect(response.status).toBe(200);
    expect(sendEquipoPasswordRecoveryEmail).toHaveBeenCalledWith(supabaseClient, 'ana@example.com');
    expect(setTemporaryEquipoPassword).not.toHaveBeenCalled();
  });
});
