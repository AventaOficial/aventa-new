/**
 * Hosts permitidos por `next.config.ts` → `images.remotePatterns`.
 * Pasar un src no listado a `next/image` lanza en runtime y tumba el árbol React.
 */
const ALLOWED_HOST_SUFFIXES = [
  'placehold.co',
  'lh3.googleusercontent.com',
  'aventaofertas.com',
  'mlstatic.com',
  'media-amazon.com',
  'ssl-images-amazon.com',
] as const;

function hostMatches(hostname: string, suffix: string): boolean {
  const h = hostname.toLowerCase();
  const s = suffix.toLowerCase();
  return h === s || h.endsWith(`.${s}`);
}

/** True si `next/image` puede cargar este src sin Invalid src / unconfigured host. */
export function isNextImageAllowedSrc(src: string | null | undefined): boolean {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      if (new URL(supabaseUrl).hostname.toLowerCase() === host) return true;
    } catch {
      /* ignore malformed env */
    }
  }

  return ALLOWED_HOST_SUFFIXES.some((suffix) => hostMatches(host, suffix));
}
