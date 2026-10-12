import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_NAVBAR_MOBILE_CLEARANCE_CLASS, PUBLIC_NAVBAR_OFFSET_CLASS } from '@/lib/ui/publicNavbarOffset';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('FT-02 — «Crear cuenta» no tapa el primer contenido en móvil', () => {
  it('la holgura móvil cubre el alto de la navbar (botón h-10 / avatar h-11) sin prefijo md', () => {
    expect(PUBLIC_NAVBAR_MOBILE_CLEARANCE_CLASS).toBe('pt-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)]');
    expect(PUBLIC_NAVBAR_MOBILE_CLEARANCE_CLASS).not.toMatch(/\bmd:/);
    expect(PUBLIC_NAVBAR_OFFSET_CLASS).toContain('md:pt-[6.5rem]');
  });

  it('la navbar sigue con el alto que asume la holgura', () => {
    const navbar = read('app/components/Navbar.tsx');
    expect(navbar).toContain('aventa-public-navbar absolute top-0 right-0 z-50 p-3 md:p-4');
    expect(navbar).toMatch(/flex h-10 md:h-12 items-center rounded-full/);
    expect(navbar).toContain('h-11 w-11 md:h-14 md:w-14');
  });

  it('portada: el hero baja solo en móvil y conserva el padding de md+', () => {
    const hero = read('app/components/Hero.tsx');
    expect(hero).toContain('${PUBLIC_NAVBAR_MOBILE_CLEARANCE_CLASS} md:pt-[env(safe-area-inset-top)]');
  });

  it('detalle: el breadcrumb baja solo en móvil y conserva md:py-12', () => {
    const content = read('app/oferta/[id]/OfferPageContent.tsx');
    expect(content).toContain('max-w-4xl mx-auto px-4 ${PUBLIC_NAVBAR_MOBILE_CLEARANCE_CLASS} pb-8 md:py-12');
  });
});
