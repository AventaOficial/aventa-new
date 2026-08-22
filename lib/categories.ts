/**
 * Macros alineadas con Promodescuentos (13 grupos) + Otros.
 * Vitales = tab «Día a día». Resto = Top / Recientes / Para ti.
 */
export type CategoryId =
  | 'tecnologia'
  | 'gaming'
  | 'supermercado'
  | 'moda'
  | 'belleza'
  | 'bebes'
  | 'hogar'
  | 'jardin'
  | 'autos'
  | 'entretenimiento'
  | 'deportes'
  | 'viajes'
  | 'servicios'
  | 'other';

export interface CategoryOption {
  value: string;
  label: string;
  subtitle?: string;
  vital?: boolean;
  icon: string;
  promodescuentosGroup?: string;
}

export const ALL_CATEGORIES: CategoryOption[] = [
  {
    value: 'tecnologia',
    label: 'Tecnología',
    subtitle: 'Celulares, laptops, TV, audio, gadgets',
    vital: false,
    icon: 'Smartphone',
    promodescuentosGroup: 'Tecnología',
  },
  {
    value: 'gaming',
    label: 'Videojuegos',
    subtitle: 'Consolas, juegos, accesorios gaming',
    vital: false,
    icon: 'Gamepad2',
    promodescuentosGroup: 'Videojuegos',
  },
  {
    value: 'supermercado',
    label: 'Supermercado',
    subtitle: 'Abarrotes, bebidas, despensa',
    vital: true,
    icon: 'ShoppingCart',
    promodescuentosGroup: 'Abarrotes y alimentos',
  },
  {
    value: 'moda',
    label: 'Moda',
    subtitle: 'Ropa, tenis, accesorios',
    vital: true,
    icon: 'Shirt',
    promodescuentosGroup: 'Ropa y accesorios',
  },
  {
    value: 'belleza',
    label: 'Belleza',
    subtitle: 'Perfumes, skincare, maquillaje',
    vital: true,
    icon: 'Sparkles',
    promodescuentosGroup: 'Salud y belleza',
  },
  {
    value: 'bebes',
    label: 'Bebés y familia',
    subtitle: 'Pañales, fórmulas, ropa infantil, juguetes',
    vital: true,
    icon: 'Baby',
    promodescuentosGroup: 'Familia, bebés y niños',
  },
  {
    value: 'hogar',
    label: 'Hogar',
    subtitle: 'Electrodomésticos, cocina, muebles, limpieza',
    vital: true,
    icon: 'Home',
    promodescuentosGroup: 'Hogar',
  },
  {
    value: 'jardin',
    label: 'Jardín y bricolaje',
    subtitle: 'Herramientas, plantas, outdoor, DIY',
    vital: true,
    icon: 'Flower2',
    promodescuentosGroup: 'Jardín y hazlo tú mismo',
  },
  {
    value: 'autos',
    label: 'Autos',
    subtitle: 'Refacciones, llantas, accesorios, motos',
    vital: false,
    icon: 'Car',
    promodescuentosGroup: 'Autos y motos',
  },
  {
    value: 'entretenimiento',
    label: 'Entretenimiento',
    subtitle: 'Libros, música, coleccionables, hobbies',
    vital: false,
    icon: 'BookOpen',
    promodescuentosGroup: 'Entretenimiento y tiempo libre',
  },
  {
    value: 'deportes',
    label: 'Deportes',
    subtitle: 'Fitness, outdoor, equipamiento deportivo',
    vital: false,
    icon: 'Dumbbell',
    promodescuentosGroup: 'Deportes y ejercicio',
  },
  {
    value: 'viajes',
    label: 'Viajes',
    subtitle: 'Vuelos, hoteles, maletas',
    vital: true,
    icon: 'Plane',
    promodescuentosGroup: 'Viajes',
  },
  {
    value: 'servicios',
    label: 'Servicios',
    subtitle: 'Streaming, apps, bancos, comida a domicilio',
    vital: true,
    icon: 'CreditCard',
    promodescuentosGroup: 'Servicios y suscripciones',
  },
  { value: 'other', label: 'Otros', vital: false, icon: 'Package' },
];

export const DIA_A_DIA_CATEGORY_IDS: string[] = ALL_CATEGORIES.filter((c) => c.vital).map((c) => c.value);
export const VITAL_CATEGORY_IDS: string[] = DIA_A_DIA_CATEGORY_IDS;
const CATEGORY_IDS_SET = new Set<string>(ALL_CATEGORIES.map((c) => c.value));

export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  despensa: 'supermercado',
  comida: 'supermercado',
  hogar: 'hogar',
  mascotas: 'bebes',
  bebidas: 'supermercado',
  electrones: 'tecnologia',
  electronics: 'tecnologia',
  ropa_mujer: 'moda',
  ropa_hombre: 'moda',
  fashion: 'moda',
  deportes: 'deportes',
  sports: 'deportes',
  libros: 'entretenimiento',
  books: 'entretenimiento',
  bancaria: 'servicios',
  home: 'hogar',
  bebes_ninos: 'bebes',
  jardin: 'jardin',
  garden: 'jardin',
  autos: 'autos',
  automotriz: 'autos',
  entretenimiento: 'entretenimiento',
  other: 'other',
};

const CATEGORY_QUERY_ALIASES: Record<string, string[]> = {
  tecnologia: ['electronics', 'electrones'],
  gaming: [],
  supermercado: ['despensa', 'comida', 'bebidas'],
  moda: ['fashion', 'ropa_mujer', 'ropa_hombre'],
  belleza: [],
  bebes: ['mascotas'],
  hogar: ['home'],
  jardin: ['garden'],
  autos: ['automotriz'],
  entretenimiento: ['libros', 'books'],
  deportes: ['sports'],
  viajes: [],
  servicios: ['bancaria'],
  other: [],
};

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

function getDbCategoryValuesForMacro(macro: string): string[] {
  const normalized = normalizeCategoryForStorage(macro);
  if (!normalized) return [];
  const fromMap = Object.entries(LEGACY_CATEGORY_MAP)
    .filter(([, v]) => v === normalized)
    .map(([k]) => k);
  const aliases = CATEGORY_QUERY_ALIASES[normalized] ?? [];
  return [...new Set([normalized, ...fromMap, ...aliases])];
}

export function getValidCategoryValuesForFeed(macro: string): string[] {
  const all = getDbCategoryValuesForMacro(macro);
  if (all.length > 0) return all;
  const raw = macro?.trim().toLowerCase();
  return raw ? [raw] : [];
}

export const DIA_A_DIA_FILTER_VALUES: string[] = [
  ...new Set(DIA_A_DIA_CATEGORY_IDS.flatMap((macro) => getDbCategoryValuesForMacro(macro))),
];

export const VITAL_FILTER_VALUES: string[] = DIA_A_DIA_FILTER_VALUES;

export const GENERAL_CATEGORIES_FOR_ONBOARDING: CategoryOption[] = ALL_CATEGORIES.filter((c) => c.value !== 'other');

export const ONBOARDING_SEARCHABLE_EXTRA = [
  'zara',
  'nike',
  'amazon',
  'walmart',
  'chedraui',
  'soriana',
  'liverpool',
  'elektra',
  'coppel',
  'mercadolibre',
  'costco',
];

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
