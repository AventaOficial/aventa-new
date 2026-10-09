import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/requireMeUser', () => ({
  requireBearerMeUser: vi.fn(),
  meAuthFailureResponse: (failure: { error: string; status: number }) =>
    Response.json({ error: failure.error }, { status: failure.status }),
}));

vi.mock('@/lib/server/rateLimit', () => ({
  enforceRateLimit: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/analytics/recordProductEvent', () => ({
  recordProductEvent: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/interests/store', () => ({
  insertInterest: vi.fn(),
  updateInterest: vi.fn(),
  deleteInterest: vi.fn(),
  listInterests: vi.fn(),
  loadMatchCandidates: vi.fn(),
  buildInterestView: vi.fn(),
}));

import { requireBearerMeUser } from '@/lib/server/requireMeUser';
import { deleteInterest, insertInterest, updateInterest } from '@/lib/interests/store';
import { GET, POST } from '@/app/api/me/interests/route';
import { DELETE, PATCH } from '@/app/api/me/interests/[id]/route';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const INTEREST = '33333333-3333-4333-8333-333333333333';

const authOk = { user: { id: USER }, supabase: { from: () => ({}) } };

function jsonRequest(method: string, body?: unknown) {
  return new Request('https://aventa.test/api/me/interests', {
    method,
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('rutas de intereses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rechaza anónimos en lectura y escritura', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue({ error: 'No autorizado', status: 401 });
    expect((await GET(jsonRequest('GET'))).status).toBe(401);
    expect((await POST(jsonRequest('POST', { label: 'Café' }))).status).toBe(401);
    const context = { params: Promise.resolve({ id: INTEREST }) };
    expect((await PATCH(jsonRequest('PATCH', { label: 'Café' }), context)).status).toBe(401);
    expect((await DELETE(jsonRequest('DELETE'), context)).status).toBe(401);
    expect(insertInterest).not.toHaveBeenCalled();
    expect(updateInterest).not.toHaveBeenCalled();
    expect(deleteInterest).not.toHaveBeenCalled();
  });

  it('no acepta un user_id enviado por el cliente', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    const created = await POST(jsonRequest('POST', { label: 'Café', user_id: OTHER }));
    expect(created.status).toBe(400);
    expect(insertInterest).not.toHaveBeenCalled();

    const context = { params: Promise.resolve({ id: INTEREST }) };
    const edited = await PATCH(jsonRequest('PATCH', { label: 'Café', user_id: OTHER }), context);
    expect(edited.status).toBe(400);
    expect(updateInterest).not.toHaveBeenCalled();
  });

  it('crea, edita y elimina usando solo el usuario de la sesión', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(insertInterest).mockResolvedValue({
      interest: { id: INTEREST, userId: USER, label: 'Café' },
    } as never);
    const created = await POST(jsonRequest('POST', { label: 'Café' }));
    expect(created.status).toBe(201);
    expect(insertInterest).toHaveBeenCalledWith(authOk.supabase, USER, expect.objectContaining({ label: 'Café' }));

    vi.mocked(updateInterest).mockResolvedValue({
      interest: { id: INTEREST, userId: USER, label: 'Café molido' },
    } as never);
    const context = { params: Promise.resolve({ id: INTEREST }) };
    const edited = await PATCH(jsonRequest('PATCH', { label: 'Café molido' }), context);
    expect(edited.status).toBe(200);
    expect(updateInterest).toHaveBeenCalledWith(authOk.supabase, USER, INTEREST, expect.objectContaining({ label: 'Café molido' }));

    vi.mocked(deleteInterest).mockResolvedValue(true);
    const removed = await DELETE(jsonRequest('DELETE'), context);
    expect(removed.status).toBe(200);
    expect(deleteInterest).toHaveBeenCalledWith(authOk.supabase, USER, INTEREST);
  });

  it('un error de base no sale en la respuesta', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(insertInterest).mockRejectedValue(new Error('relation user_product_interests does not exist'));
    const response = await POST(jsonRequest('POST', { label: 'Laptop' }));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('user_product_interests');
    expect(body.error).toBe('No se pudo guardar el interés.');
  });
});
