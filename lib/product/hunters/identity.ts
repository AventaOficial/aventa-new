/**
 * Identidad pública de un Hunter.
 * El machine client sigue siendo el vínculo técnico. La UI resuelve un code estable.
 */
import { isBotUserId } from '@/lib/bots/ingest/isBotUserId';
import { EDITORIAL_CANON } from './canon';

export type HunterPublicIdentity = {
  code: string;
  slug: string;
  name: string;
  displayName: string;
  role: string;
  specialty: string;
  voice: string;
  accent: string;
  avatarUrl: string | null;
  profilePath: string;
  foundLabel: string;
};

/** El carril de suministro actual se presenta como este Hunter. No es un UUID. */
export const SUPPLY_HUNTER_CODE = 'ximena';

/** Recortes de la ficha definitiva. No pasan por el alta editorial. */
export const HUNTER_PUBLIC_FILES: Record<string, { avatarUrl: string; coverUrl: string; icon: string }> = {
  ximena: {
    avatarUrl: '/hunters/ximena/avatar.png',
    coverUrl: '/hunters/ximena/cover.png',
    icon: '/hunters/ximena/icon.png',
  },
};

const PRODUCT_VOICE: Record<string, Pick<HunterPublicIdentity, 'role' | 'specialty' | 'voice' | 'accent'>> = {
  ximena: {
    role: 'Hunter de Ofertas',
    specialty: 'Ofertas del día a día, hogar, despensa, higiene y productos que realmente necesitas.',
    voice: 'Estoy siempre buscando productos que usamos en casa: limpieza, despensa, higiene y básicos del día a día.',
    accent: '#f97316',
  },
};

const TECHNICAL_LABEL =
  /mcp|machine[_\s-]?client|\bavk_|aventa bot|supply production|aventa-mcp-/i;
const UUID_LABEL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toPublic(code: string): HunterPublicIdentity | null {
  const source = EDITORIAL_CANON.find((hunter) => hunter.code === code);
  if (!source) return null;
  const voice = PRODUCT_VOICE[source.code];
  const name = source.name;
  return {
    code: source.code,
    slug: source.slug,
    name,
    displayName: source.displayName,
    role: voice?.role ?? source.title,
    specialty: voice?.specialty ?? source.specialty,
    voice: voice?.voice ?? source.shortBio,
    accent: voice?.accent ?? source.accent ?? '#7c3aed',
    avatarUrl: HUNTER_PUBLIC_FILES[source.code]?.avatarUrl ?? source.avatarUrl,
    profilePath: `/cazadores/${source.slug}`,
    foundLabel: `${name} encontró esta oferta`,
  };
}

export function hunterByCode(code: string | null | undefined): HunterPublicIdentity | null {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) return null;
  return toPublic(normalized);
}

export function defaultSupplyHunter(): HunterPublicIdentity {
  const hunter = hunterByCode(SUPPLY_HUNTER_CODE);
  if (!hunter) throw new Error('El Hunter de suministro no está en el canon.');
  return hunter;
}

export function isTechnicalAuthorLabel(label: string | null | undefined): boolean {
  const value = label?.trim() ?? '';
  if (!value) return false;
  return TECHNICAL_LABEL.test(value) || UUID_LABEL.test(value);
}

export function presentAuthor(input: {
  userId?: string | null;
  displayName?: string | null;
  hunterCode?: string | null;
}): { kind: 'hunter'; hunter: HunterPublicIdentity } | { kind: 'person' } {
  const bound = hunterByCode(input.hunterCode);
  if (bound) return { kind: 'hunter', hunter: bound };
  if (isBotUserId(input.userId) || isTechnicalAuthorLabel(input.displayName)) {
    return { kind: 'hunter', hunter: defaultSupplyHunter() };
  }
  return { kind: 'person' };
}

/** Etiqueta de cola. Un code de canon gana; un nombre técnico nunca se muestra. */
export function hunterForLane(label: string | null | undefined): HunterPublicIdentity {
  const trimmed = label?.trim() ?? '';
  const byCode = hunterByCode(trimmed);
  if (byCode) return byCode;
  const byName = EDITORIAL_CANON.find((hunter) => hunter.name.toLowerCase() === trimmed.toLowerCase());
  if (byName && !isTechnicalAuthorLabel(trimmed)) {
    return hunterByCode(byName.code) ?? defaultSupplyHunter();
  }
  return defaultSupplyHunter();
}
