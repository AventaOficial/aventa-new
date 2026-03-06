/**
 * Categorías de ofertas: 8 macro categorías tipo Promodescuentos.
 * Pocas categorías fuertes = más claridad. Las etiquetas/marcas pueden crecer después.
 * Vitales = las que aparecen en el tab "Día a día" del feed (empezamos con 5).
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
  { value: 'belleza', label: 'Belleza', subtitle: 'Perfumes, cuidado personal', vital: false, icon: 'Sparkles' },
  { value: 'viajes', label: 'Viajes', subtitle: 'Vuelos, hoteles', vital: false, icon: 'Plane' },
  { value: 'servicios', label: 'Servicios', subtitle: 'Suscripciones, bancos, apps', vital: false, icon: 'CreditCard' },
  { value: 'other', label: 'Otros', vital: false, icon: 'Package' },
];

/** Valores de categoría que se muestran en el tab "Día a día" del feed. */
export const VITAL_CATEGORY_IDS: string[] = ALL_CATEGORIES.filter((c) => c.vital).map((c) => c.value);

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

/**
 * Valores de categoría que existen en la BD (offers.category / ofertas_ranked_general).
 * docs/supabase-migrations/offers_category.sql: electronics, fashion, home, sports, books, other.
 * Solo estos evitan 400 en la vista.
 */
const DB_CATEGORY_WHITELIST = new Set<string>([
  'electronics',
  'fashion',
  'home',
  'sports',
  'books',
  'other',
]);

/** Mapeo de macro (UI) a valores de DB para el feed. Solo valores que existen en la vista. */
const MACRO_TO_DB_CATEGORIES: Record<string, string[]> = {
  tecnologia: ['electronics'],
  gaming: ['other'],
  hogar: ['home'],
  supermercado: ['other'],
  moda: ['fashion'],
  belleza: ['other'],
  viajes: ['other'],
  servicios: ['other'],
  other: ['other'],
};

/** Para filtrar en el feed: devuelve el valor macro y todos los legacy que mapean a él. */
function getDbCategoryValuesForMacro(macro: string): string[] {
  const fromMap = Object.entries(LEGACY_CATEGORY_MAP)
    .filter(([, v]) => v === macro)
    .map(([k]) => k);
  return [...new Set([macro, ...fromMap])];
}

/** Valores de category para la query al feed. Solo incluye valores que existen en ofertas_ranked_general. */
export function getValidCategoryValuesForFeed(macro: string): string[] {
  const mapped = MACRO_TO_DB_CATEGORIES[macro];
  if (mapped?.length) return mapped;
  const all = getDbCategoryValuesForMacro(macro);
  const valid = all.filter((v) => DB_CATEGORY_WHITELIST.has(v));
  return valid.length > 0 ? valid : [macro];
}

/** Valores de DB que cuentan como "vital" (macro vitales + legacy). Para .in('category', ...) en el feed. */
const VITAL_RAW_VALUES = [
  ...new Set(VITAL_CATEGORY_IDS.flatMap((macro) => getDbCategoryValuesForMacro(macro))),
];

/** Solo valores que existen en la BD; evita 400 en ofertas_ranked_general. */
export const VITAL_FILTER_VALUES: string[] =
  (() => {
    const valid = VITAL_RAW_VALUES.filter((v) => DB_CATEGORY_WHITELIST.has(v));
    return valid.length > 0 ? [...new Set(valid)] : ['electronics', 'fashion', 'home', 'other'];
  })();

/** Categorías para onboarding (todas menos Otros). */
export const GENERAL_CATEGORIES_FOR_ONBOARDING: CategoryOption[] = ALL_CATEGORIES.filter((c) => c.value !== 'other');
/** Marcas/tiendas buscables en onboarding. */
export const ONBOARDING_SEARCHABLE_EXTRA = ['zara', 'nike', 'amazon', 'walmart', 'chedraui', 'soriana', 'liverpool', 'elektra', 'coppel', 'mercadolibre', 'costco'];

export const FEED_CATEGORY_OPTIONS = ALL_CATEGORIES;

export function normalizeCategoryForVitales(category: string | null | undefined): string | null {
  if (!category?.trim()) return null;
  const lower = category.trim().toLowerCase();
  return LEGACY_CATEGORY_MAP[lower] ?? lower;
}

export function isVitalCategory(category: string | null | undefined): boolean {
  const norm = normalizeCategoryForVitales(category);
  if (!norm) return false;
  return VITAL_CATEGORY_IDS.includes(norm);
}

export { getDbCategoryValuesForMacro };
