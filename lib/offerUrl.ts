/**
 * Construye la URL final de una oferta. Si es de Mercado Libre y el creador tiene
 * etiqueta de seguimiento (ml_tracking_tag), se añade para atribución.
 */
const ML_DOMAINS = ['mercadolibre.', 'mercadolibre.com', 'mlstatic.com'];

export function buildOfferUrl(
  offerUrl: string | null | undefined,
  creatorMlTag?: string | null
): string {
  const url = offerUrl?.trim();
  if (!url) return '';
  if (!creatorMlTag?.trim()) return url;

  const tag = creatorMlTag.trim();
  const lower = url.toLowerCase();
  const isMl = ML_DOMAINS.some((d) => lower.includes(d));
  if (!isMl) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tag', tag);
    return parsed.toString();
  } catch {
    return url;
  }
}
