/**
 * Comparación de hostname segura (P1-7).
 * No usar hostname.includes(domain) — admite evil-amazon.com / amazon.com.evil.com.
 */

/** Normaliza hostname: lower, sin trailing dot, sin brackets IPv6 wrapper. */
export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
}

/**
 * True si host es exactamente el dominio registrado o un subdominio legítimo.
 * Ejemplo: amazon.com, www.amazon.com ✓ · evil-amazon.com ✗ · amazon.com.evil.com ✗
 */
export function isHostUnderRegisteredDomain(hostname: string, registeredDomain: string): boolean {
  const h = normalizeHostname(hostname);
  const d = normalizeHostname(registeredDomain);
  if (!h || !d || h.includes('..') || d.includes('..')) return false;
  if (h.includes('/') || h.includes('\\') || h.includes('@') || h.includes(' ')) return false;
  return h === d || h.endsWith('.' + d);
}

/** True si host coincide con alguno de los dominios registrados (o subdominio). */
export function isHostUnderAnyRegisteredDomain(
  hostname: string,
  registeredDomains: readonly string[],
): boolean {
  return registeredDomains.some((d) => isHostUnderRegisteredDomain(hostname, d));
}
