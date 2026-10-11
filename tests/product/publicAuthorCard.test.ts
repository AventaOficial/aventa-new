import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toPublicAuthorCardFields } from '@/lib/profile/publicAuthorCard';

describe('campos públicos de la ficha', () => {
  it('muestra bio y ubicación solo cuando el perfil lo permite', () => {
    expect(
      toPublicAuthorCardFields({
        bio: 'Hola',
        city: 'León',
        state: 'Guanajuato',
        showLocation: true,
        profileVisibility: 'public',
      }),
    ).toEqual({ bio: 'Hola', location: 'León, Guanajuato' });
  });

  it('un perfil privado o sin ubicación no inventa datos ni expone campos internos', () => {
    expect(
      toPublicAuthorCardFields({
        bio: 'Secreto',
        city: 'León',
        state: 'Guanajuato',
        showLocation: false,
        profileVisibility: 'private',
      }),
    ).toEqual({ bio: null, location: null });

    expect(
      toPublicAuthorCardFields({
        bio: '  ',
        city: 'León',
        state: 'Guanajuato',
        showLocation: false,
        profileVisibility: 'public',
      }),
    ).toEqual({ bio: null, location: null });

    const source = readFileSync('lib/profile/publicAuthorCard.ts', 'utf8');
    expect(source).not.toMatch(/email|phone|telefono|user_id/i);
  });
});
