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

/** Normaliza src de imagen ML (protocol-relative / path) a https absoluto. */
export function normalizeOfferImageUrl(raw?: string | null): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  if (value.startsWith('data:')) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) {
    // Evita rutas rotas en nuestro dominio (p.ej. /placeholder.png o paths relativos mal guardados).
    try {
      const u = new URL(value);
      if (/placeholder/i.test(u.pathname)) return null;
      return value;
    } catch {
      return null;
    }
  }
  if (value.startsWith('/') && /mlstatic|meli/i.test(value)) {
    return `https://http2.mlstatic.com${value}`;
  }
  // Paths relativos locales → no usar (causan 404 en aventaofertas.com).
  if (value.startsWith('/') || !value.includes('.')) return null;
  return null;
}

/** Lista única: portada + extras, sin duplicados. */
export function mergeOfferImageUrls(image?: string | null, imageUrls?: string[] | null): string[] {
  const raw = [image, ...(Array.isArray(imageUrls) ? imageUrls : [])]
    .map((u) => normalizeOfferImageUrl(u))
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
  return raw.filter((u, i, arr) => arr.indexOf(u) === i);
}
