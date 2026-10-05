/**
 * Assets editoriales de un Aventa Hunter.
 * Viven en el bucket público que el proyecto ya usa. El code inmutable
 * arma la ruta. Esto no decide permisos, rewards ni publicación por sí solo.
 */

export const HUNTER_ASSET_BUCKET = 'offer-images';
export const HUNTER_ASSET_SLOTS = ['avatar', 'cover', 'icon'] as const;
export type HunterAssetSlot = (typeof HUNTER_ASSET_SLOTS)[number];
export const HUNTER_ASSET_EXTS = ['jpg', 'png', 'webp'] as const;
export type HunterAssetExt = (typeof HUNTER_ASSET_EXTS)[number];
/** Mismo tope que las fotos de oferta y de perfil. */
export const HUNTER_ASSET_MAX_BYTES = 2 * 1024 * 1024;

const CODE = /^[a-z][a-z0-9-]{1,32}$/;
const PUBLIC_PREFIX = `/storage/v1/object/public/${HUNTER_ASSET_BUCKET}/`;

export type HunterAssetState = 'absent' | 'present' | 'invalid' | 'not_publishable';

export type HunterAssetMatch = {
  code: string;
  slot: HunterAssetSlot;
  ext: HunterAssetExt;
};

export function isHunterAssetSlot(value: string): value is HunterAssetSlot {
  return (HUNTER_ASSET_SLOTS as readonly string[]).includes(value);
}

export function hunterAssetObjectPath(code: string, slot: HunterAssetSlot, ext: HunterAssetExt): string {
  return `hunters/${code}/${slot}.${ext}`;
}

export function hunterAssetSiblingPaths(code: string, slot: HunterAssetSlot, keepExt?: HunterAssetExt): string[] {
  return HUNTER_ASSET_EXTS.filter((ext) => ext !== keepExt).map((ext) => hunterAssetObjectPath(code, slot, ext));
}

export function hunterAssetByteLengthError(byteLength: number): string | null {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 'El archivo está vacío';
  if (byteLength > HUNTER_ASSET_MAX_BYTES) return 'El asset no puede pasar de 2MB';
  return null;
}

const MIME_BY_EXT: Record<HunterAssetExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Bytes reales. El MIME que declara el navegador no alcanza. */
export function sniffHunterImage(bytes: Uint8Array): { mime: string; ext: HunterAssetExt } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

function normalizeDeclared(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.toLowerCase().split(';')[0]?.trim() ?? '';
  if (!value || value === 'application/octet-stream') return null;
  if (value === 'image/jpg') return 'image/jpeg';
  return value;
}

export function inspectHunterUpload(input: {
  bytes: Uint8Array;
  declaredType?: string | null;
}): { ok: true; mime: string; ext: HunterAssetExt } | { ok: false; error: string } {
  const sizeError = hunterAssetByteLengthError(input.bytes.length);
  if (sizeError) return { ok: false, error: sizeError };
  const sniffed = sniffHunterImage(input.bytes);
  if (!sniffed) return { ok: false, error: 'El archivo no es jpg, png ni webp' };
  const declared = normalizeDeclared(input.declaredType);
  if (declared && declared !== sniffed.mime) {
    return { ok: false, error: 'El tipo del archivo no coincide con su contenido' };
  }
  if (MIME_BY_EXT[sniffed.ext] !== sniffed.mime) return { ok: false, error: 'El archivo no es jpg, png ni webp' };
  return { ok: true, mime: sniffed.mime, ext: sniffed.ext };
}

/**
 * Allowlist estricta: https, host del proyecto, bucket offer-images,
 * ruta hunters/{code}/{slot}.{ext}, sin query, hash ni salto de directorio.
 * Si el host es el correcto pero la ruta no es de este Hunter, no es publicable.
 */
export function hunterAssetState(
  url: string | null | undefined,
  storageHost: string | null,
  code: string,
  slot: HunterAssetSlot,
): HunterAssetState {
  if (url == null || url.trim() === '') return 'absent';
  const value = url.trim();
  if (value.includes('..') || value.includes('\\')) return 'invalid';
  if (!storageHost || !CODE.test(code)) return 'invalid';
  const match = matchHunterAssetUrl(value, storageHost);
  if (!match) {
    return sameProjectStorage(value, storageHost) ? 'not_publishable' : 'invalid';
  }
  if (match.code !== code || match.slot !== slot) return 'not_publishable';
  return 'present';
}

export function matchHunterAssetUrl(url: string, storageHost: string | null): HunterAssetMatch | null {
  if (!storageHost) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port) return null;
  if (parsed.search || parsed.hash) return null;
  if (parsed.host !== storageHost) return null;
  let path = parsed.pathname;
  try {
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (path.includes('..') || path.includes('\\') || parsed.pathname.includes('..')) return null;
  if (!path.startsWith(PUBLIC_PREFIX)) return null;
  const rest = path.slice(PUBLIC_PREFIX.length);
  const matched = rest.match(/^hunters\/([a-z][a-z0-9-]{1,32})\/(avatar|cover|icon)\.(jpg|png|webp)$/);
  if (!matched) return null;
  return {
    code: matched[1] as string,
    slot: matched[2] as HunterAssetSlot,
    ext: matched[3] as HunterAssetExt,
  };
}

function sameProjectStorage(url: string, storageHost: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === storageHost && parsed.pathname.startsWith('/storage/v1/object/public/');
  } catch {
    return false;
  }
}