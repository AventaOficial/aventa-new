import { normalizeMercadoLibreInputUrl } from '@/lib/offers/resolveMercadoLibreItem';
import { shouldDropQueryParam } from './classifyQueryParam';

/**
 * Canonical paste + tracking/share strip authority.
 *
 * - Does NOT invent product identity
 * - Preserves identity-bearing and variant-bearing params (e.g. attributes)
 * - Drops tracking/share only when classified
 * - Unknown params are KEPT (fail-closed)
 */
export function normalizeOfferUrl(raw: string): string {
  const pasted = normalizeMercadoLibreInputUrl(raw);
  if (!pasted) return '';
  try {
    const u = new URL(pasted);
    u.hash = '';
    const keys = [...u.searchParams.keys()];
    for (const key of keys) {
      if (shouldDropQueryParam(key, { pathname: u.pathname })) {
        u.searchParams.delete(key);
      }
    }
    // Prefer https
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.toString();
  } catch {
    return pasted;
  }
}
