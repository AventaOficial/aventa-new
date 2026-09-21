/**
 * Wide ML query/category families for anti-sticky discovery.
 * Exploit list (env BOT_INGEST_ML_QUERIES) stays small; exploration pulls from here.
 * Observation/discovery only — does not change 25% / money / publish.
 */

import {
  NICHE_BEAUTY,
  NICHE_DAY_TO_DAY,
  NICHE_ELECTRONICS,
} from '@/lib/hunter/supply/nicheProfiles';

/** Brand / product / intent variants that fixed tech lists never hit. */
const EXTRA_EXPLORATION_QUERIES: readonly string[] = [
  // Beauty
  'perfume dama oferta',
  'perfume caballero oferta',
  'carolina herrera perfume',
  'chanel perfume mujer',
  'dior sauvage',
  'crema neutrogena oferta',
  'serum vitamina c oferta',
  'kit maquillaje oferta',
  'plancha cabello oferta',
  'secadora cabello oferta',
  // Day-to-day / home
  'papel higienico jumbo',
  'detergente liquido oferta',
  'suavitel oferta',
  'aceite 1 litro oferta',
  'arroz 1kg oferta',
  'cafe soluble oferta',
  'pañales oferta',
  'toallas humedas oferta',
  'sarten antiadherente oferta',
  'olla express oferta',
  'colchon individual oferta',
  'almohada oferta',
  // Electronics beyond sticky defaults
  'iphone 13 oferta',
  'iphone 14 oferta',
  'samsung a54 oferta',
  'motorola g oferta',
  'redmi note oferta',
  'airpods oferta',
  'galaxy buds oferta',
  'kindle oferta',
  'roku stick oferta',
  'chromecast oferta',
  'gopro oferta',
  'drone oferta',
  'power bank oferta',
  'cargador usb c oferta',
  'memoria ram ddr4 oferta',
  'tarjeta grafica oferta',
  // Sports / lifestyle
  'tenis running oferta',
  'tenis nike oferta',
  'pesa mancuerna oferta',
  'colchoneta yoga oferta',
  'reloj deportivo oferta',
  'mochila viaje oferta',
  // Kids / misc
  'lego oferta',
  'juguete hot wheels',
  'bateria auto oferta',
  'llanta auto oferta',
  'herramienta taladro oferta',
  'camara web oferta',
];

const EXTRA_EXPLORATION_CATEGORIES: readonly string[] = [
  'MLM1246', // Belleza
  'MLM1271', // Perfumes (if valid; harmless if unused)
  'MLM1276', // Hogar
  'MLM1430', // Electrodomésticos
  'MLM1575', // Alimentos
  'MLM1747', // Deportes
  'MLM1132', // Juegos y juguetes
  'MLM1168', // Libros
  'MLM1051', // Celulares y teléfonos (alt)
  'MLM1182', // Instrumentos
  'MLM1499', // Industrias
  'MLM1071', // Animales
];

function uniqPreserve(items: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Full exploration query catalog (niche specs + extras). */
export function buildExplorationQueryCatalog(): string[] {
  return uniqPreserve([
    ...NICHE_BEAUTY.mlQueries,
    ...NICHE_ELECTRONICS.mlQueries,
    ...NICHE_DAY_TO_DAY.mlQueries,
    ...EXTRA_EXPLORATION_QUERIES,
  ]);
}

/** Full exploration category catalog. */
export function buildExplorationCategoryCatalog(): string[] {
  return uniqPreserve([
    ...NICHE_BEAUTY.mlCategoryIds,
    ...NICHE_ELECTRONICS.mlCategoryIds,
    ...NICHE_DAY_TO_DAY.mlCategoryIds,
    ...EXTRA_EXPLORATION_CATEGORIES,
  ]);
}

/**
 * FACT: pinned BOT_INGEST_ML_QUERIES of length ≤12 is the sticky pot.
 * Treat as exploit-only; exploration must come from the wide catalog.
 */
export function isStickyExploitQueryList(queries: readonly string[]): boolean {
  return queries.length > 0 && queries.length <= 12;
}
