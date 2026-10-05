/**
 * Reglas puras de los Aventa Hunters. Ninguna lee base ni decide dinero.
 */
import { hunterAssetState, type HunterAssetSlot } from './assets';
import type { EditorialHunter, HunterStatus } from './types';
import { HUNTER_STATUSES } from './types';

const CODE = /^[a-z][a-z0-9-]{1,32}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACCENT = /^#[0-9a-fA-F]{6}$/;
const HTML = /<[^>]+>/;

const HUNTER_TEXT_LIMITS = {
  name: 80,
  displayName: 80,
  title: 120,
  specialty: 80,
  shortBio: 280,
  longBio: 4000,
  personality: 1000,
} as const;

/** Listado público: solo activos, por orden editorial y luego nombre. */
export function publicHunters(rows: readonly EditorialHunter[]): EditorialHunter[] {
  return rows
    .filter((h) => h.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
}

/** Página pública. Draft y archived responden como si no existieran. */
export function publicHunterBySlug(rows: readonly EditorialHunter[], slug: string): EditorialHunter | null {
  const found = rows.find((h) => h.slug === slug);
  if (!found || found.status !== 'active') return null;
  return found;
}

export function hunterSitemapPaths(rows: readonly EditorialHunter[]): string[] {
  return publicHunters(rows).map((h) => `/cazadores/${h.slug}`);
}

export function storageHostFromSupabaseUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export type HunterWriteInput = {
  code: string;
  slug: string;
  name: string;
  displayName: string;
  title: string;
  specialty: string;
  shortBio: string;
  longBio: string;
  personality: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  icon: string | null;
  accent: string | null;
  status: HunterStatus;
  sortOrder: number;
};

export type HunterWriteResult = { ok: true; value: HunterWriteInput } | { ok: false; error: string };

function cleanText(raw: unknown, max: number, label: string, required: boolean): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return required ? { ok: false, error: `${label} es obligatorio` } : { ok: true, value: '' };
  const value = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (required && !value) return { ok: false, error: `${label} es obligatorio` };
  if (value.length > max) return { ok: false, error: `${label} no puede pasar de ${max} caracteres` };
  if (HTML.test(value)) return { ok: false, error: `${label} no acepta HTML` };
  return { ok: true, value };
}

function cleanAsset(
  raw: unknown,
  storageHost: string | null,
  label: string,
  code: string,
  slot: HunterAssetSlot,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: `${label} debe ser una URL` };
  const value = raw.trim();
  const state = hunterAssetState(value, storageHost, code, slot);
  if (state !== 'present') {
    return { ok: false, error: `${label} debe vivir en el almacenamiento de este Hunter` };
  }
  return { ok: true, value };
}

export function parseHunterWrite(
  body: Record<string, unknown>,
  storageHost: string | null,
  opts: { codeRequired: boolean },
): HunterWriteResult {
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (opts.codeRequired && !CODE.test(code)) {
    return { ok: false, error: 'El code debe ser estable: minúsculas, números y guiones, entre 2 y 33 caracteres' };
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!SLUG.test(slug)) return { ok: false, error: 'El slug no es válido' };

  const name = cleanText(body.name, HUNTER_TEXT_LIMITS.name, 'El nombre', true);
  if (!name.ok) return name;
  const displayName = cleanText(body.displayName, HUNTER_TEXT_LIMITS.displayName, 'El nombre visible', true);
  if (!displayName.ok) return displayName;
  const title = cleanText(body.title, HUNTER_TEXT_LIMITS.title, 'El título', true);
  if (!title.ok) return title;
  const specialty = cleanText(body.specialty, HUNTER_TEXT_LIMITS.specialty, 'La especialidad', true);
  if (!specialty.ok) return specialty;
  const shortBio = cleanText(body.shortBio, HUNTER_TEXT_LIMITS.shortBio, 'La descripción corta', false);
  if (!shortBio.ok) return shortBio;
  const longBio = cleanText(body.longBio, HUNTER_TEXT_LIMITS.longBio, 'La historia', false);
  if (!longBio.ok) return longBio;
  const personality = cleanText(body.personality, HUNTER_TEXT_LIMITS.personality, 'La personalidad', false);
  if (!personality.ok) return personality;

  const status = body.status;
  if (typeof status !== 'string' || !(HUNTER_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: 'El estado debe ser draft, active o archived' };
  }
  const sortOrder = body.sortOrder;
  if (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
    return { ok: false, error: 'El orden debe ser un entero entre 0 y 10000' };
  }

  let accent: string | null = null;
  if (body.accent != null && body.accent !== '') {
    if (typeof body.accent !== 'string' || !ACCENT.test(body.accent.trim())) {
      return { ok: false, error: 'El color debe ser un hexadecimal de 6 dígitos' };
    }
    accent = body.accent.trim().toLowerCase();
  }

  const avatarUrl = cleanAsset(body.avatarUrl, storageHost, 'El avatar', code, 'avatar');
  if (!avatarUrl.ok) return avatarUrl;
  const coverUrl = cleanAsset(body.coverUrl, storageHost, 'La portada', code, 'cover');
  if (!coverUrl.ok) return coverUrl;
  const icon = cleanAsset(body.icon, storageHost, 'El ícono', code, 'icon');
  if (!icon.ok) return icon;

  return {
    ok: true,
    value: {
      code,
      slug,
      name: name.value,
      displayName: displayName.value,
      title: title.value,
      specialty: specialty.value,
      shortBio: shortBio.value,
      longBio: longBio.value,
      personality: personality.value,
      avatarUrl: avatarUrl.value,
      coverUrl: coverUrl.value,
      icon: icon.value,
      accent,
      status: status as HunterStatus,
      sortOrder,
    },
  };
}

/** Code y slug son únicos. `ignoreId` permite guardar un Hunter sin chocar consigo mismo. */
export function identityConflict(
  existing: readonly Pick<EditorialHunter, 'id' | 'code' | 'slug'>[],
  input: { code: string; slug: string },
  ignoreId?: string,
): 'code' | 'slug' | null {
  for (const hunter of existing) {
    if (ignoreId && hunter.id === ignoreId) continue;
    if (hunter.code === input.code) return 'code';
    if (hunter.slug === input.slug) return 'slug';
  }
  return null;
}

/** El code no se edita. Mandarlo distinto del actual es un error, no un cambio silencioso. */
export function assertCodeUnchanged(current: string, body: Record<string, unknown>): string | null {
  if (!('code' in body) || body.code == null || body.code === '') return null;
  if (body.code !== current) return 'El code de un Hunter es inmutable';
  return null;
}

export type PublicationReadiness = { state: 'ready' | 'blocked'; reasons: string[] };

const REQUIRED_COPY: Array<[keyof HunterWriteInput, string]> = [
  ['name', 'Falta el nombre'],
  ['displayName', 'Falta el nombre visible'],
  ['title', 'Falta el título'],
  ['specialty', 'Falta la especialidad'],
  ['shortBio', 'Falta la descripción corta'],
  ['longBio', 'Falta la historia'],
  ['personality', 'Falta la personalidad'],
];

/**
 * Listo para pasar a active. No cambia el estado: solo dice si el Owner puede hacerlo.
 * Un draft con ficha incompleta sigue siendo válido; simplemente no se publica.
 */
export function publicationReadiness(input: HunterWriteInput, storageHost: string | null): PublicationReadiness {
  const reasons: string[] = [];
  if (!CODE.test(input.code)) reasons.push('El code no es válido');
  if (!SLUG.test(input.slug)) reasons.push('El slug no es válido');
  for (const [key, reason] of REQUIRED_COPY) {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim()) reasons.push(reason);
  }
  const assets: Array<[HunterAssetSlot, string | null, string, string]> = [
    ['avatar', input.avatarUrl, 'Falta el avatar', 'El avatar no es publicable'],
    ['cover', input.coverUrl, 'Falta la portada', 'La portada no es publicable'],
    ['icon', input.icon, 'Falta el ícono', 'El ícono no es publicable'],
  ];
  for (const [slot, url, missing, rejected] of assets) {
    const state = hunterAssetState(url, storageHost, input.code, slot);
    if (state === 'absent') reasons.push(missing);
    else if (state !== 'present') reasons.push(rejected);
  }
  if (!input.accent) reasons.push('Falta el color');
  else if (!ACCENT.test(input.accent)) reasons.push('El color no es válido');
  return reasons.length === 0 ? { state: 'ready', reasons: [] } : { state: 'blocked', reasons };
}
