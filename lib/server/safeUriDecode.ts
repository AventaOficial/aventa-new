/**
 * P1-11 — Decode URI seguro (como máximo una vez).
 * URLSearchParams.get / Next searchParams ya decodifican una vez;
 * un segundo decodeURIComponent convierte %252e%252e%252f → ../ .
 */

/** True si el string aún contiene secuencias %XX sin decodificar. */
export function hasUriEncodedOctets(value: string): boolean {
  return /%[0-9A-Fa-f]{2}/.test(value);
}

/**
 * Decodifica como máximo una vez si quedan octetos %XX.
 * Si ya está decodificado (caso típico de searchParams.get), devuelve el valor intacto.
 * Nunca aplica decodeURIComponent en cascada.
 */
export function safeDecodeURIComponentOnce(value: string): string {
  if (value == null) return '';
  const s = String(value);
  if (!hasUriEncodedOctets(s)) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Rechaza path traversal obvio en strings usados como path/key relativo.
 * No sustituye validación de URL HTTPS; es capa extra para filenames/keys.
 */
export function containsPathTraversal(value: string): boolean {
  const s = value.replace(/\\/g, '/');
  if (s.includes('\0')) return true;
  const segments = s.split('/');
  return segments.some((seg) => seg === '..');
}
