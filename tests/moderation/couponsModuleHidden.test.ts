import { describe, expect, it, vi } from 'vitest';

const requireModeration = vi.fn();
vi.mock('@/lib/server/requireAdmin', () => ({ requireModeration }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => {
    throw new Error('no debe consultar la base');
  },
}));

const { COUPONS_MODULE_AVAILABLE } = await import('@/lib/intelligence/coupon/availability');
const route = await import('@/app/api/admin/coupons/route');

describe('módulo de cupones oculto hasta aplicar su migración', () => {
  it('sigue apagado: las tablas coupons* no existen en producción', () => {
    expect(COUPONS_MODULE_AVAILABLE).toBe(false);
  });

  it.each(['GET', 'POST'] as const)('%s /api/admin/coupons responde 404 sin autenticar ni consultar', async (method) => {
    const req = new Request('https://aventaofertas.com/api/admin/coupons', {
      method,
      ...(method === 'POST' ? { body: JSON.stringify({ text: 'CUPON10 Amazon' }) } : {}),
    });
    const res = await route[method](req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'coupons_module_unavailable' });
    expect(requireModeration).not.toHaveBeenCalled();
  });

  it('la navegación del owner no enlaza a /admin/coupons', async () => {
    const { readFileSync } = await import('node:fs');
    const nav = await import('@/lib/owner/navigation');
    const serialize = (m: unknown) => JSON.stringify(m, (_k, v) => (typeof v === 'function' ? undefined : v));
    const hrefs = serialize(nav);
    expect(hrefs).toContain('/admin/announcements');
    expect(hrefs).not.toContain('/admin/coupons');
    const modules = serialize(await import('@/lib/founderOs/modules'));
    expect(modules).toContain('/admin/announcements');
    expect(modules).not.toContain('/admin/coupons');
    expect(readFileSync('app/admin/coupons/layout.tsx', 'utf8')).toContain('notFound()');
  });
});
