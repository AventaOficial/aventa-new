import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { presentOwnProfile, presentPublicProfile } from '@/lib/profile/visibility';

describe('visibilidad del perfil', () => {
  it('no publica ciudad, estado ni bio vacía, y un perfil privado no expone actividad', () => {
    expect(
      presentPublicProfile({
        bio: '  ',
        city: 'Guadalajara',
        state: 'Jalisco',
        coverUrl: 'https://cdn.example/cover.png',
        showLocation: false,
        showActivity: true,
        profileVisibility: 'public',
      }),
    ).toEqual({
      bio: null,
      location: null,
      coverUrl: 'https://cdn.example/cover.png',
      showActivity: true,
      isPrivate: false,
    });

    expect(
      presentPublicProfile({
        bio: 'Cazo ofertas',
        city: 'Guadalajara',
        state: 'Jalisco',
        coverUrl: 'https://cdn.example/cover.png',
        showLocation: false,
        showActivity: false,
        profileVisibility: 'private',
      }),
    ).toEqual({
      bio: null,
      location: null,
      coverUrl: null,
      showActivity: false,
      isPrivate: true,
    });
  });

  it('el dueño ve lo que escribió y el perfil público no selecciona datos fiscales', () => {
    expect(presentOwnProfile({ city: 'León', state: 'Guanajuato', bio: 'Hola' })).toEqual({
      bio: 'Hola',
      location: 'León, Guanajuato',
      coverUrl: null,
    });
    const route = readFileSync(join(process.cwd(), 'app/api/profile/[username]/route.ts'), 'utf8');
    expect(route).toMatch(/presentPublicProfile/);
    expect(route).not.toMatch(/commission_rfc|commission_clabe|commission_legal_name/);
    const settings = readFileSync(join(process.cwd(), 'app/settings/page.tsx'), 'utf8');
    expect(settings).toMatch(/Cuenta y perfil/);
    expect(settings).toMatch(/AppearancePicker/);
    expect(settings).not.toMatch(/sesiones activas/i);
    expect(settings).not.toMatch(/Descargar mis datos/);
  });
});
