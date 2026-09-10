import { normalizePastedOfferUrl } from '@/lib/offerUrl';

const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'about:']);

/**
 * Valida URLs de oferta enviadas por usuarios (creación/edición).
 * Solo HTTPS; bloquea esquemas peligrosos y URLs malformadas.
 * Canonicaliza pegados móviles (espacios, saltos de línea, https implícito)
 * con la misma función compartida que el parser.
 */
export function validatePublicOfferUrl(raw: string): { ok: true; href: string } | { ok: false; error: string } {
  const preliminary = typeof raw === 'string' ? raw.trim() : '';
  if (!preliminary) {
    return { ok: false, error: 'URL de oferta vacía' };
  }

  const lowerRaw = preliminary.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lowerRaw.startsWith(scheme)) {
      return { ok: false, error: 'URL de oferta no permitida' };
    }
  }

  const trimmed = normalizePastedOfferUrl(preliminary);
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

  if (!url.hostname || url.username || url.password || !url.hostname.includes('.')) {
    return { ok: false, error: 'URL de oferta inválida' };
  }

  return { ok: true, href: url.href };
}
