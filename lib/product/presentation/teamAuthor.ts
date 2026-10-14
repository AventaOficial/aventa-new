import type { HunterPublicIdentity } from '@/lib/product/hunters/identity';

export const AVENTA_TEAM_LABEL = 'Equipo Aventa';

/**
 * Función editorial por code del canon.
 * Un nombre visible no entra aquí: solo un hunter ya resuelto por presentAuthor.
 * La descripción es de la selección, no una opinión personal del hunter.
 */
const TEAM_FUNCTION: Record<string, { functionLabel: string; editorial: string }> = {
  ximena: {
    functionLabel: 'Ofertas de uso diario',
    editorial:
      'Encontramos productos útiles para el hogar, la despensa, la higiene, las mascotas y las necesidades de todos los días.',
  },
  kai: {
    functionLabel: 'Top tecnología',
    editorial:
      'Seleccionamos descuentos fuertes en laptops, celulares, audio, gaming y gadgets de tiendas confiables.',
  },
  eleonore: {
    functionLabel: 'Moda, tenis y perfumes',
    editorial:
      'Seleccionamos moda, tenis, perfumes y belleza con buen precio en tiendas oficiales y confiables.',
  },
};

export type OfferAuthorCardModel = {
  kind: 'team' | 'community';
  name: string;
  profileHref: string | null;
  avatarUrl: string | null;
  accent: string;
  bio: string | null;
  location: string | null;
  functionLabel: string | null;
};

function clean(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : null;
}

export function teamAuthorCard(hunter: Pick<
  HunterPublicIdentity,
  'code' | 'name' | 'profilePath' | 'avatarUrl' | 'accent'
>): OfferAuthorCardModel {
  const known = TEAM_FUNCTION[hunter.code] ?? null;
  return {
    kind: 'team',
    name: `${hunter.name} · ${AVENTA_TEAM_LABEL}`,
    profileHref: hunter.profilePath,
    avatarUrl: hunter.avatarUrl,
    accent: hunter.accent,
    bio: known?.editorial ?? null,
    location: null,
    functionLabel: known?.functionLabel ?? null,
  };
}

export function communityAuthorCard(input: {
  name: string;
  profileHref: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
}): OfferAuthorCardModel {
  return {
    kind: 'community',
    name: input.name.trim(),
    profileHref: input.profileHref,
    avatarUrl: input.avatarUrl ?? null,
    accent: '#7c3aed',
    bio: clean(input.bio),
    location: clean(input.location),
    functionLabel: null,
  };
}
