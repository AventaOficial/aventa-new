/**
 * Grupos de búsqueda: al buscar una palabra clave se expande a términos relacionados
 * para que aparezcan ofertas de la misma familia (ej. "apple" → iphone, mac, ipad).
 */

export const SEARCH_TERM_GROUPS: Record<string, string[]> = {
  apple: ['apple', 'iphone', 'ipad', 'mac', 'macbook', 'airpods', 'watch', 'imac', 'macbook pro', 'macbook air'],
  samsung: ['samsung', 'galaxy', 'galaxy s', 'galaxy a', 'galaxy tab'],
  walmart: ['walmart'],
  amazon: ['amazon'],
  mercadolibre: ['mercadolibre', 'mercado libre', 'meli'],
  bestbuy: ['best buy', 'bestbuy'],
  costco: ['costco'],
  liverpool: ['liverpool'],
  palacio: ['palacio de hierro', 'palacio'],
  soriana: ['soriana'],
  heb: ['heb'],
  chedraui: ['chedraui'],
};

/**
 * Dado el texto de búsqueda, devuelve la lista de términos a usar (expandida si hay grupo).
 */
export function getSearchTerms(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const group = SEARCH_TERM_GROUPS[trimmed];
  if (group && group.length > 0) return group;
  return [trimmed];
}
