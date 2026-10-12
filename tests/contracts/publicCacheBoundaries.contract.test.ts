import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nextCache = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));
vi.mock('next/cache', () => nextCache);

import {
  invalidatePublicOffer,
  offerDetailCacheTag,
  PUBLIC_OFFER_REVALIDATE_SECONDS,
} from '@/lib/offers/publicOfferCache';
import { invalidateSocialLinks, SOCIAL_LINKS_CACHE_TAG } from '@/lib/social/socialLinks';

const src = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

beforeEach(() => {
  nextCache.revalidateTag.mockReset();
  nextCache.revalidatePath.mockReset();
});

describe('caché pública: el layout raíz no fuerza render dinámico', () => {
  const layout = src('app/layout.tsx');

  it('declara una ventana de revalidación acotada', () => {
    expect(layout).toMatch(/export const revalidate = 60;/);
    expect(PUBLIC_OFFER_REVALIDATE_SECONDS).toBeLessThanOrEqual(60);
  });

  it('no lee headers() ni cookies() ni monta el page view de servidor', () => {
    expect(layout).not.toMatch(/from 'next\/headers'/);
    expect(layout).not.toContain('ProductPageView');
    expect(layout).toContain('<PageViewBeacon />');
  });

  it('el beacon es de cliente y no bloquea el render', () => {
    const beacon = src('app/components/analytics/PageViewBeacon.tsx');
    expect(beacon.trimStart().startsWith("'use client'")).toBe(true);
    expect(beacon).toContain('sendBeacon');
    expect(beacon).toContain('keepalive: true');
  });
});

describe('páginas públicas con parámetros: ISR bajo demanda', () => {
  it.each([
    'app/oferta/[id]/page.tsx',
    'app/categoria/[slug]/page.tsx',
    'app/categoria/[slug]/[subslug]/page.tsx',
    'app/tienda/[slug]/page.tsx',
    'app/tag/[slug]/page.tsx',
  ])('%s: generateStaticParams vacío, sin APIs dinámicas y sin 404 cacheado por error', (file) => {
    const page = src(file);
    expect(page).toMatch(/export async function generateStaticParams\(\) \{\s*return \[\];/);
    expect(page).not.toMatch(/from 'next\/headers'|searchParams/);
    expect(page).not.toMatch(/if \(error\) notFound\(\)/);
    expect(page).toContain('createInteractiveServerClient');
  });
});

describe('caché privada: secciones de staff/admin siempre dinámicas', () => {
  it.each(['app/admin/layout.tsx', 'app/equipo/layout.tsx'])('%s es force-dynamic', (file) => {
    expect(src(file)).toContain("export const dynamic = 'force-dynamic'");
  });

  it('el layout de admin es de servidor y delega el shell de cliente', () => {
    const layout = src('app/admin/layout.tsx');
    expect(layout).not.toContain("'use client'");
    expect(layout).toContain('AdminShell');
    expect(src('app/admin/AdminShell.tsx')).toContain("'use client'");
  });

  it('feed y page-view responden sin caché compartida', () => {
    expect(src('app/api/feed/home/route.ts')).toMatch(/private, no-store/);
    expect(src('app/api/page-view/route.ts')).toContain("'Cache-Control': 'no-store'");
  });
});

describe('detalle de oferta: caché por oferta con tag e invalidación', () => {
  const page = src('app/oferta/[id]/page.tsx');

  it('cachea por id con tag propio y la misma ventana', () => {
    expect(page).toContain("['offer-detail', id]");
    expect(page).toContain('tags: [offerDetailCacheTag(id)]');
    expect(page).toContain('revalidate: PUBLIC_OFFER_REVALIDATE_SECONDS');
  });

  it('un error de base de datos no se cachea como 404', () => {
    expect(page).toMatch(/if \(error\) throw/);
  });

  it('el tag es estable por oferta', () => {
    expect(offerDetailCacheTag('abc')).toBe('offer:abc');
  });

  it('invalidatePublicOffer expira inmediatamente el tag', () => {
    invalidatePublicOffer('abc');
    expect(nextCache.revalidateTag).toHaveBeenCalledWith('offer:abc', { expire: 0 });
  });

  it('invalidatePublicOffer regenera todos los listados ISR que muestran tarjetas', () => {
    invalidatePublicOffer('abc');
    const routes = nextCache.revalidatePath.mock.calls.map(([route, type]) => `${route}|${type}`);
    expect(routes.sort()).toEqual(
      ['/categoria/[slug]', '/categoria/[slug]/[subslug]', '/tag/[slug]', '/tienda/[slug]'].map((r) => `${r}|page`).sort(),
    );
  });

  it('moderate-offer además revalida la home', () => {
    expect(src('app/api/admin/moderate-offer/route.ts')).toContain("revalidatePath('/')");
  });

  it('fuera de una request no lanza (crons, scripts)', () => {
    nextCache.revalidateTag.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing');
    });
    expect(() => invalidatePublicOffer('abc')).not.toThrow();
  });

  it.each([
    'app/api/admin/moderate-offer/route.ts',
    'app/api/admin/update-offer/route.ts',
    'app/api/admin/expire-offer/route.ts',
  ])('%s invalida el detalle tras mutar', (file) => {
    expect(src(file)).toMatch(/invalidatePublicOffer\((id|offerId)\)/);
  });
});

describe('enlaces sociales: caché con tag e invalidación al escribir', () => {
  it('invalida con expire 0', () => {
    invalidateSocialLinks();
    expect(nextCache.revalidateTag).toHaveBeenCalledWith(SOCIAL_LINKS_CACHE_TAG, { expire: 0 });
  });

  it.each(['app/api/admin/social/route.ts', 'app/api/staff/marketing/route.ts'])('%s invalida tras upsert', (file) => {
    expect(src(file)).toContain('invalidateSocialLinks()');
  });

  it('config.ts sigue siendo importable desde cliente (sin next/cache)', () => {
    expect(src('lib/social/config.ts')).not.toContain('next/cache');
  });
});
