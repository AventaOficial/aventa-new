/**
 * Categorías de ofertas: 8 macro categorías tipo Promodescuentos.
 * Pocas categorías fuertes = más claridad. Las etiquetas/marcas pueden crecer después.
 * Vitales = las que aparecen en el tab "Día a día" del feed (Tecnología, Gaming, Hogar, Supermercado, Moda, Belleza, Viajes, Servicios).
 */

export type CategoryId =
  | 'tecnologia'
  | 'gaming'
  | 'hogar'
  | 'supermercado'
  | 'moda'
  | 'belleza'
  | 'viajes'
  | 'servicios'
  | 'other';

export interface CategoryOption {
  value: string;
  label: string;
  /** Ejemplos para onboarding y guiar al usuario (no genérico). */
  subtitle?: string;
  /** Si true, aparece en el tab "Día a día" / Vitales del feed. */
  vital?: boolean;
  /** Nombre del icono Lucide para onboarding (ej. "Smartphone"). */
  icon: string;
}

/** 8 macro categorías + Otros. Orden: las que dominamos primero (Tecnología, Gaming, Hogar, Supermercado). */
export const ALL_CATEGORIES: CategoryOption[] = [
  { value: 'tecnologia', label: 'Tecnología', subtitle: 'Celulares, laptops, audífonos, gadgets', vital: true, icon: 'Smartphone' },
  { value: 'gaming', label: 'Gaming', subtitle: 'Consolas, videojuegos, accesorios', vital: true, icon: 'Gamepad2' },
  { value: 'hogar', label: 'Hogar', subtitle: 'Electrodomésticos, cocina, herramientas', vital: true, icon: 'Home' },
  { value: 'supermercado', label: 'Supermercado', subtitle: 'Comida, bebidas, limpieza', vital: true, icon: 'ShoppingCart' },
  { value: 'moda', label: 'Moda', subtitle: 'Ropa, tenis, accesorios', vital: true, icon: 'Shirt' },
  { value: 'belleza', label: 'Belleza', subtitle: 'Perfumes, cuidado personal', vital: true, icon: 'Sparkles' },
  { value: 'viajes', label: 'Viajes', subtitle: 'Vuelos, hoteles', vital: true, icon: 'Plane' },
  { value: 'servicios', label: 'Servicios', subtitle: 'Suscripciones, bancos, apps', vital: true, icon: 'CreditCard' },
  { value: 'other', label: 'Otros', vital: false, icon: 'Package' },
];

/** Valores de categoría que se muestran en el tab "Día a día" del feed. */
export const VITAL_CATEGORY_IDS: string[] = ALL_CATEGORIES.filter((c) => c.vital).map((c) => c.value);
const CATEGORY_IDS_SET = new Set<string>(ALL_CATEGORIES.map((c) => c.value));

/**
 * Valores legacy en DB se mapean a las 8 macro.
 * Ofertas antiguas (despensa, electrones, ropa_mujer, etc.) siguen apareciendo en el filtro correcto.
 */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  despensa: 'supermercado',
  comida: 'supermercado',
  hogar: 'hogar',
  mascotas: 'other',
  bebidas: 'supermercado',
  electrones: 'tecnologia',
  electronics: 'tecnologia',
  ropa_mujer: 'moda',
  ropa_hombre: 'moda',
  fashion: 'moda',
  deportes: 'other',
  sports: 'other',
  libros: 'other',
  books: 'other',
  bancaria: 'servicios',
  home: 'hogar',
  other: 'other',
};

/** Alias históricos que pueden existir en BD y deben seguir encontrándose durante la transición. */
const CATEGORY_QUERY_ALIASES: Record<string, string[]> = {
  tecnologia: ['electronics', 'electrones'],
  gaming: [],
  hogar: ['home'],
  supermercado: ['despensa', 'comida', 'bebidas'],
  moda: ['fashion', 'ropa_mujer', 'ropa_hombre'],
  belleza: [],
  viajes: [],
  servicios: ['bancaria'],
  other: ['sports', 'books', 'deportes', 'libros', 'mascotas'],
};

/** Normaliza cualquier valor de categoría a macro canónica del producto. */
export function normalizeCategoryForStorage(category: string | null | undefined): CategoryId | null {
  if (!category?.trim()) return null;
  const lower = category.trim().toLowerCase();
  const mapped = LEGACY_CATEGORY_MAP[lower] ?? lower;
  if (CATEGORY_IDS_SET.has(mapped)) return mapped as CategoryId;
  return null;
}

export function isValidCategoryId(value: string | null | undefined): value is CategoryId {
  if (!value?.trim()) return false;
  return CATEGORY_IDS_SET.has(value.trim().toLowerCase());
}

/** Para filtrar en el feed: devuelve el valor macro y todos los legacy que mapean a él. */
function getDbCategoryValuesForMacro(macro: string): string[] {
  const normalized = normalizeCategoryForStorage(macro);
  if (!normalized) return [];
  const fromMap = Object.entries(LEGACY_CATEGORY_MAP)
    .filter(([, v]) => v === normalized)
    .map(([k]) => k);
  const aliases = CATEGORY_QUERY_ALIASES[normalized] ?? [];
  return [...new Set([normalized, ...fromMap, ...aliases])];
}

/** Valores de category para la query al feed. Incluye macro canónica + alias legacy durante transición. */
export function getValidCategoryValuesForFeed(macro: string): string[] {
  const all = getDbCategoryValuesForMacro(macro);
  if (all.length > 0) return all;
  const raw = macro?.trim().toLowerCase();
  return raw ? [raw] : [];
}

/** Valores que cuentan como "vital" (macro vitales + alias). Para .in('category', ...) en el feed. */
export const VITAL_FILTER_VALUES: string[] = [
  ...new Set(VITAL_CATEGORY_IDS.flatMap((macro) => getDbCategoryValuesForMacro(macro))),
];

/** Categorías para onboarding (todas menos Otros). */
export const GENERAL_CATEGORIES_FOR_ONBOARDING: CategoryOption[] = ALL_CATEGORIES.filter((c) => c.value !== 'other');
/** Marcas/tiendas buscables en onboarding. */
export const ONBOARDING_SEARCHABLE_EXTRA = ['zara', 'nike', 'amazon', 'walmart', 'chedraui', 'soriana', 'liverpool', 'elektra', 'coppel', 'mercadolibre', 'costco'];

export const FEED_CATEGORY_OPTIONS = ALL_CATEGORIES;

export function normalizeCategoryForVitales(category: string | null | undefined): string | null {
  return normalizeCategoryForStorage(category);
}

export function isVitalCategory(category: string | null | undefined): boolean {
  const norm = normalizeCategoryForVitales(category);
  if (!norm) return false;
  return VITAL_CATEGORY_IDS.includes(norm);
}

export { getDbCategoryValuesForMacro };
