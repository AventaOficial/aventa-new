/**
 * Limpia títulos de producto extraídos de og:title / meta: suelen incluir precio,
 * sufijos de marketplace ("| Mercado Libre") y texto muy largo en una sola línea.
 */
const MAX_TITLE_LEN = 140;

export function sanitizeOfferTitle(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  let s = String(raw).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Sufijos típicos de marketplaces
  s = s.replace(/\s+en\s+Mercado\s+Libre\s*$/i, '');
  s = s.replace(/\s*[\|\-–—]\s*Mercado\s+Libre\s*$/i, '');
  s = s.replace(/\s*[\|\-–—]\s*Amazon\.com(?:\.mx)?[^\s]*\s*$/i, '');
  s = s.replace(/\s*:\s*Amazon\.com(?:\.mx)?[^\s]*\s*$/i, '');
  s = s.replace(/\s*[\|\-–—]\s*eBay\s*$/i, '');

  // Quitar segmentos finales con precio (varias pasadas por "| precio" encadenados)
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(/\s*[\|\-–—]\s*(?:MXN|MX\$?|USD|US\$)\s*[\d.,\s]+\s*$/i, '');
    s = s.replace(/\s*[\|\-–—]\s*\$[\d.,\s]+(?:\s*(?:MXN|MX))?\s*$/i, '');
    s = s.replace(/\s*[\|\-–—]\s*[\d][\d.,\s]*\s*(?:MXN|pesos?)\s*$/i, '');
    s = s.replace(/\s+\$[\d][\d.,]*\s*$/i, '');
    s = s.replace(/\s+(?:desde|from)\s+\$[\d][\d.,]*\s*$/i, '');
    if (s === before) break;
  }

  s = s.replace(/\s{2,}/g, ' ').trim();
  if (!s) return null;

  if (s.length > MAX_TITLE_LEN) {
    const cut = s.slice(0, MAX_TITLE_LEN);
    const lastSpace = cut.lastIndexOf(' ');
    const chunk = lastSpace > 35 ? cut.slice(0, lastSpace) : cut;
    s = `${chunk.trimEnd()}…`;
  }

  return s;
}
