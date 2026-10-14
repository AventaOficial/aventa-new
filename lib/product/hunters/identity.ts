/**
 * Identidad pública de un Hunter.
 * El machine client sigue siendo el vínculo técnico. La UI resuelve un code estable.
 */
import { isBotUserId } from '@/lib/bots/ingest/isBotUserId';
import { EDITORIAL_CANON } from './canon';

export type HunterAssetSet = {
  avatarUrl: string | null;
  portraitUrl: string | null;
  coverUrl: string | null;
  icon: string | null;
  fullBodyUrl: string | null;
  expressions: Record<string, string>;
};

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
  portraitUrl: string | null;
  coverUrl: string | null;
  icon: string | null;
  fullBodyUrl: string | null;
  expressions: Record<string, string>;
  profilePath: string;
  foundLabel: string;
};

const EMPTY_ASSETS: HunterAssetSet = {
  avatarUrl: null,
  portraitUrl: null,
  coverUrl: null,
  icon: null,
  fullBodyUrl: null,
  expressions: {},
};

/** El carril de suministro actual se presenta como este Hunter. No es un UUID. */
export const SUPPLY_HUNTER_CODE = 'ximena';

/** Hunters que un cliente MCP puede presentar. Cada uno tiene su especialidad en la tarjeta. */
export const SUPPLY_HUNTER_CODES = ['ximena', 'kai', 'eleonore'] as const;
export type SupplyHunterCode = (typeof SUPPLY_HUNTER_CODES)[number];

export function isSupplyHunterCode(value: unknown): value is SupplyHunterCode {
  return typeof value === 'string' && (SUPPLY_HUNTER_CODES as readonly string[]).includes(value);
}

/** `bot_meta.hunter_code` que estampa la ingesta MCP. Cualquier otro valor se ignora. */
export function hunterCodeFromBotMeta(botMeta: unknown): SupplyHunterCode | null {
  if (!botMeta || typeof botMeta !== 'object') return null;
  const code = (botMeta as { hunter_code?: unknown }).hunter_code;
  return isSupplyHunterCode(code) ? code : null;
}

/** `bot_meta` con el hunter que acaba de guardar moderación; el resto de la metadata no cambia. */
export function botMetaWithHunterCode(botMeta: unknown, hunterCode: string): Record<string, unknown> {
  const base =
    botMeta && typeof botMeta === 'object' && !Array.isArray(botMeta) ? (botMeta as Record<string, unknown>) : {};
  return { ...base, hunter_code: hunterCode };
}

/** Assets públicos por code. Un slot vacío no se inventa en el componente. */
export const HUNTER_PUBLIC_FILES: Record<string, HunterAssetSet> = {
  ximena: {
    avatarUrl: '/hunters/ximena/avatar.png',
    portraitUrl: null,
    coverUrl: '/hunters/ximena/cover.png',
    icon: '/hunters/ximena/icon.png',
    fullBodyUrl: null,
    expressions: {},
  },
  eleonore: {
    avatarUrl: '/hunters/eleonore/avatar.jpg',
    portraitUrl: null,
    coverUrl: '/hunters/eleonore/cover.jpg',
    icon: null,
    fullBodyUrl: null,
    expressions: {},
  },
};

export function hunterAssets(code: string | null | undefined): HunterAssetSet {
  const key = code?.trim().toLowerCase() ?? '';
  return HUNTER_PUBLIC_FILES[key] ?? EMPTY_ASSETS;
}

const PRODUCT_VOICE: Record<string, Pick<HunterPublicIdentity, 'role' | 'specialty' | 'voice' | 'accent'>> = {
  ximena: {
    role: 'Cazadora de conexiones',
    specialty: 'Ofertas del día a día, hogar, despensa, higiene y productos que realmente necesitas.',
    voice: 'Estoy siempre buscando productos que usamos en casa: limpieza, despensa, higiene y básicos del día a día.',
    accent: '#f97316',
  },
  kai: {
    role: 'Cazador Estratégico',
    specialty: 'Tecnología: laptops, celulares, audio, gaming y gadgets con descuentos de verdad.',
    voice: 'Reviso precios de tecnología todos los días y solo comparto los descuentos que valen la pena.',
    accent: '#0ea5e9',
  },
  eleonore: {
    role: 'Estratega e Ilusión',
    specialty: 'Moda, tenis, perfumes y belleza con precio real.',
    voice: 'Busco moda, tenis y perfumes originales a buen precio. Las mejores oportunidades se encuentran en los detalles.',
    accent: '#d4a017',
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
  const assets = hunterAssets(source.code);
  return {
    code: source.code,
    slug: source.slug,
    name,
    displayName: source.displayName,
    role: voice?.role ?? source.title,
    specialty: voice?.specialty ?? source.specialty,
    voice: voice?.voice ?? source.shortBio,
    accent: voice?.accent ?? source.accent ?? '#7c3aed',
    avatarUrl: assets.avatarUrl ?? source.avatarUrl,
    portraitUrl: assets.portraitUrl,
    coverUrl: assets.coverUrl ?? source.coverUrl,
    icon: assets.icon ?? source.icon,
    fullBodyUrl: assets.fullBodyUrl,
    expressions: assets.expressions,
    profilePath: `/cazadores/${source.slug}`,
    foundLabel: `${name} encontró esta oferta`,
  };
}

export function hunterByCode(code: string | null | undefined): HunterPublicIdentity | null {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) return null;
  const direct = toPublic(normalized);
  if (direct) return direct;
  const bySlug = EDITORIAL_CANON.find((hunter) => hunter.slug === normalized);
  return bySlug ? toPublic(bySlug.code) : null;
}

/** Code o slug del canon (p. ej. `ximena-fuego`) a code de suministro. Otro valor es null. */
export function toSupplyHunterCode(value: unknown): SupplyHunterCode | null {
  if (typeof value !== 'string') return null;
  const code = hunterByCode(value)?.code;
  return isSupplyHunterCode(code) ? code : null;
}

/** Opciones de hunter para el formulario del Owner. Sólo datos públicos del canon. */
export function supplyHunterOptions(): Array<{
  code: SupplyHunterCode;
  displayName: string;
  avatarUrl: string | null;
  specialty: string;
  accent: string;
}> {
  return SUPPLY_HUNTER_CODES.flatMap((code) => {
    const hunter = hunterByCode(code);
    return hunter
      ? [{ code, displayName: hunter.displayName, avatarUrl: hunter.avatarUrl, specialty: hunter.specialty, accent: hunter.accent }]
      : [];
  });
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

/** Autor de un lote. Si entró por MCP: hunter editorial + procedencia; nunca el perfil técnico. */
export function batchAuthorLabel(input: {
  createdBy?: string | null;
  authorName?: string | null;
  machineClientId?: string | null;
}): string {
  const author = presentAuthor({ userId: input.createdBy, displayName: input.authorName });
  const name = author.kind === 'hunter' ? author.hunter.displayName : input.authorName?.trim() || 'Usuario';
  return input.machineClientId ? `${name} · vía MCP` : name;
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
