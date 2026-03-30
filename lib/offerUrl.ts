/**
 * URLs de oferta: Mercado Libre puede llevar parámetro `tag` (afiliado).
 * Prioridad: tag de plataforma (ML_AFFILIATE_TAG / NEXT_PUBLIC_ML_AFFILIATE_TAG);
 * si no hay, tag del creador (ml_tracking_tag en perfil).
 */

function isMercadoLibreOfferUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('mercadolibre.');
}

export function applyMercadoLibreAffiliateTag(url: string, tag: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tag', tag);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Tag de afiliado de AVENTA en ML (mismo valor en servidor y cliente si usas NEXT_PUBLIC). */
export function getPlatformMercadoLibreAffiliateTag(): string | null {
  const t =
    process.env.ML_AFFILIATE_TAG?.trim() ||
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG?.trim();
  return t || null;
}

/** Normaliza URL guardada en BD (creación, edición, aprobación): siempre tag de plataforma en ML. */
export function normalizeMercadoLibreOfferUrlForStorage(url: string): string {
  const tag = getPlatformMercadoLibreAffiliateTag();
  if (!tag || !isMercadoLibreOfferUrl(url)) return url;
  return applyMercadoLibreAffiliateTag(url, tag);
}

export { isMercadoLibreOfferUrl };

/**
 * URL final al abrir “Cazar” / modal: ML con tag de plataforma si existe; si no, tag del creador.
 */
export function buildOfferUrl(
  offerUrl: string | null | undefined,
  creatorMlTag?: string | null
): string {
  const url = offerUrl?.trim();
  if (!url) return '';
  const platformTag = getPlatformMercadoLibreAffiliateTag();
  const isMl = isMercadoLibreOfferUrl(url);
  if (isMl && platformTag) {
    return applyMercadoLibreAffiliateTag(url, platformTag);
  }
  if (isMl && creatorMlTag?.trim()) {
    return applyMercadoLibreAffiliateTag(url, creatorMlTag.trim());
  }
  return url;
}
