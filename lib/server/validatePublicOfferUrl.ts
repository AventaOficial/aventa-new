const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'about:']);

/**
 * Valida URLs de oferta enviadas por usuarios (creación/edición).
 * Solo HTTPS; bloquea esquemas peligrosos y URLs malformadas.
 * La normalización afiliada y SSRF del parser usan otras rutas.
 */
export function validatePublicOfferUrl(raw: string): { ok: true; href: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'URL de oferta vacía' };
  }

  const lower = trimmed.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return { ok: false, error: 'URL de oferta no permitida' };
    }
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'URL de oferta inválida' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, error: 'La URL de la oferta debe usar HTTPS' };
  }

  if (!url.hostname || url.username || url.password) {
    return { ok: false, error: 'URL de oferta inválida' };
  }

  return { ok: true, href: url.href };
}
