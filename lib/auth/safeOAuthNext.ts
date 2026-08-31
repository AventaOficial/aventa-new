const FALLBACK = '/';

/**
 * Valida el parámetro `next` del callback OAuth.
 * Solo permite rutas internas relativas de Aventa; rechaza redirects externos.
 */
export function resolveSafeOAuthNext(next: string | null | undefined): string {
  if (next == null) return FALLBACK;

  const trimmed = next.trim();
  if (trimmed.length === 0) return FALLBACK;

  if (!trimmed.startsWith('/')) return FALLBACK;

  if (trimmed.startsWith('//')) return FALLBACK;

  if (trimmed.includes('\\')) return FALLBACK;

  if (/^\/https?:/i.test(trimmed)) return FALLBACK;

  if (trimmed.includes('://')) return FALLBACK;

  if (trimmed.includes('@')) return FALLBACK;

  if (/[\0-\x1F\x7F]/.test(trimmed)) return FALLBACK;

  return trimmed;
}
