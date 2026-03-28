/**
 * Rutas públicas de oferta: slug legible + UUID (el UUID es la fuente de verdad).
 */

export function slugifyForOfferUrl(title: string, maxLen = 52): string {
  const s = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
  return s || 'oferta';
}

/** Extrae el UUID del segmento de ruta (soporta solo UUID o `slug-uuid`). */
export function extractOfferIdFromPathSegment(segment: string): string | null {
  const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(segment)) !== null) last = m[0];
  return last;
}

export function buildOfferPublicPath(id: string, title?: string | null): string {
  const slug = title?.trim() ? slugifyForOfferUrl(title.trim()) : '';
  if (slug) return `/oferta/${slug}-${id}`;
  return `/oferta/${id}`;
}

/** Lista única: portada + extras, sin duplicados. */
export function mergeOfferImageUrls(image?: string | null, imageUrls?: string[] | null): string[] {
  const raw = [image, ...(Array.isArray(imageUrls) ? imageUrls : [])].filter(
    (u): u is string => typeof u === 'string' && u.length > 0
  );
  return raw.filter((u, i, arr) => arr.indexOf(u) === i);
}
