import { beforeEach, describe, expect, it, vi } from 'vitest';

const state: {
  result: { data: unknown; error: { message: string } | null };
  throws: boolean;
  rateLimited: boolean;
} = { result: { data: null, error: null }, throws: false, rateLimited: false };

vi.mock('@/lib/server/rateLimit', () => ({
  getClientIp: () => '127.0.0.1',
  enforceRateLimit: async () => ({ success: !state.rateLimited }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => {
    if (state.throws) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => state.result,
    };
    return { from: () => builder };
  },
}));

import { GET } from '@/app/api/app-config/route';

async function read(key = 'show_tester_offers'): Promise<unknown> {
  const res = await GET(new Request(`http://localhost/api/app-config?key=${key}`));
  return ((await res.json()) as { value: unknown }).value;
}

describe('/api/app-config: ofertas de prueba con fallo cerrado', () => {
  beforeEach(() => {
    state.result = { data: null, error: null };
    state.throws = false;
    state.rateLimited = false;
  });

  it('un error de la base de datos no enciende las ofertas de prueba', async () => {
    state.result = { data: null, error: { message: 'timeout' } };
    expect(await read()).toBe(false);
  });

  it('una fila inexistente no enciende las ofertas de prueba', async () => {
    state.result = { data: null, error: null };
    expect(await read()).toBe(false);
  });

  it('un cliente que no se puede crear no enciende las ofertas de prueba', async () => {
    state.throws = true;
    expect(await read()).toBe(false);
  });

  it('la configuración explícita sigue funcionando', async () => {
    state.result = { data: { value: true }, error: null };
    expect(await read()).toBe(true);
    state.result = { data: { value: 'true' }, error: null };
    expect(await read()).toBe(true);
    state.result = { data: { value: false }, error: null };
    expect(await read()).toBe(false);
    state.result = { data: { value: 'yes' }, error: null };
    expect(await read()).toBe(false);
  });

  it('claves no permitidas y límite de frecuencia devuelven false', async () => {
    state.result = { data: { value: true }, error: null };
    expect(await read('otra_clave')).toBe(false);
    state.rateLimited = true;
    expect(await read()).toBe(false);
  });
});
