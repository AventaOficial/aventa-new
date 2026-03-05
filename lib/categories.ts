/**
 * Categorías de ofertas: listas unificadas para feed, formularios, onboarding y preferencias.
 * Vitales = lo que una familia/persona compra para vivir (despensa, comida, hogar, mascotas, etc.).
 */

export type CategoryId =
  | 'despensa'
  | 'comida'
  | 'hogar'
  | 'mascotas'
  | 'bebidas'
  | 'electrones'
  | 'ropa_mujer'
  | 'ropa_hombre'
  | 'deportes'
  | 'libros'
  | 'bancaria'
  | 'other';

export interface CategoryOption {
  value: string;
  label: string;
  /** Si true, esta categoría aparece en el tab "Día a día" del feed. */
  vital?: boolean;
}

/** Todas las categorías (formulario ofertas, filtros, preferencias). Mismo orden que en onboarding "generales" primero. */
export const ALL_CATEGORIES: CategoryOption[] = [
  { value: 'despensa', label: 'Despensa', vital: true },
  { value: 'comida', label: 'Comida y restaurantes', vital: true },
  { value: 'hogar', label: 'Hogar y muebles', vital: true },
  { value: 'mascotas', label: 'Mascotas (croquetas, etc.)', vital: true },
  { value: 'bebidas', label: 'Bebidas (cervezas, etc.)', vital: true },
  { value: 'electrones', label: 'Electrónica y tech', vital: false },
  { value: 'ropa_mujer', label: 'Ropa mujer', vital: false },
  { value: 'ropa_hombre', label: 'Ropa hombre', vital: false },
  { value: 'deportes', label: 'Deportes', vital: false },
  { value: 'libros', label: 'Libros', vital: false },
  { value: 'bancaria', label: 'Ofertas bancarias', vital: false },
  { value: 'other', label: 'Otros', vital: false },
];

/** Valores de categoría que se muestran en el tab "Día a día" del feed. Incluye legacy (home) para ofertas ya guardadas. */
export const VITAL_CATEGORY_IDS: string[] = ALL_CATEGORIES.filter((c) => c.vital).map((c) => c.value);
export const VITAL_FILTER_VALUES: string[] = [...new Set([...VITAL_CATEGORY_IDS, 'home'])];

/** Categorías "generales" para onboarding (lo que todo el mundo podría comprar). Se muestran primero; el usuario puede buscar más (ej. Zara). */
export const GENERAL_CATEGORIES_FOR_ONBOARDING: CategoryOption[] = ALL_CATEGORIES.filter(
  (c) => c.value !== 'other'
);
export const ONBOARDING_SEARCHABLE_EXTRA = ['zara', 'nike', 'amazon', 'walmart', 'chedraui', 'soriana', 'liverpool', 'elektra', 'coppel'];

/** Opciones para el select del feed (dropdown filtro). */
export const FEED_CATEGORY_OPTIONS = ALL_CATEGORIES;

/** Compatibilidad: valores legacy que pueden estar en DB (electronics, fashion, home...) se mapean a los nuevos. */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  electronics: 'electrones',
  fashion: 'ropa_mujer', // o podría ser other; en filtro mostramos ambos
  home: 'hogar',
  sports: 'deportes',
  books: 'libros',
  other: 'other',
};

export function normalizeCategoryForVitales(category: string | null | undefined): string | null {
  if (!category?.trim()) return null;
  const lower = category.trim().toLowerCase();
  return LEGACY_CATEGORY_MAP[lower] ?? lower;
}

/** Para el tab Vitales: si la oferta tiene categoría en la lista vital (incluye mapeo legacy). */
export function isVitalCategory(category: string | null | undefined): boolean {
  const norm = normalizeCategoryForVitales(category);
  if (!norm) return false;
  return VITAL_CATEGORY_IDS.includes(norm);
}
