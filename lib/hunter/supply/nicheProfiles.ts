/**
 * NicheHunterProfile — configuración de nicho para el Supply Engine.
 * Backend/domain only. Agregar un nicho = datos, no copiar código.
 */

export type SupplyNicheLane = 'day_to_day' | 'top_deals' | 'beauty' | 'electronics';

export type SupplyEngineMode = 'shadow' | 'dry_run' | 'enabled';

export type NicheHunterProfile = {
  id: string;
  name: string;
  lane: SupplyLaneTag;
  /** Categorías Aventa canónicas preferidas (telemetría / scoring). */
  categories: string[];
  /** Categorías MLM para discovery API. */
  mlCategoryIds: string[];
  /** Queries de búsqueda ML. */
  mlQueries: string[];
  /** Fuentes permitidas (supply source ids). Vacío = defaults del engine. */
  allowedSources: readonly string[];
  /** Prioridad 1..100 (mayor = primero en rotación). */
  priority: number;
  /** Tope de candidatos a evaluar por corrida de este nicho. */
  candidateBudget: number;
  /** Tope de inserts intentados (solo mode enabled). */
  insertBudget: number;
  /** Descuento mínimo de etiqueta (filtro grosero; DQE sigue siendo autoridad). */
  minDiscountPercent: number;
  /** Precio mínimo MXN (null = sin piso). */
  priceMin: number | null;
  /** Precio máximo MXN (null = sin techo). */
  priceMax: number | null;
  /** Días mínimos de Price Memory antes de confiar en historical_low. */
  minHistoryDays: number;
  /** Requiere historial listo para priorizar como top deal. */
  preferHistoryReady: boolean;
  enabled: boolean;
};

export type SupplyLaneTag = SupplyNicheLane;

/** Belleza / perfumería — alta señal observada en moderación. */
export const NICHE_BEAUTY: NicheHunterProfile = {
  id: 'beauty',
  name: 'Perfumería / Belleza',
  lane: 'beauty',
  categories: ['belleza'],
  mlCategoryIds: ['MLM1246'],
  mlQueries: [
    'perfume mujer oferta',
    'perfume hombre oferta',
    'fragancia eau de parfum',
    'maquillaje oferta',
    'skincare serum oferta',
    'crema facial oferta',
    'labial maybelline',
    'shampoo oferta',
  ],
  allowedSources: ['ml_api_legacy', 'ml_worker'],
  priority: 90,
  candidateBudget: 24,
  insertBudget: 8,
  minDiscountPercent: 18,
  priceMin: 49,
  priceMax: 8000,
  minHistoryDays: 4,
  preferHistoryReady: true,
  enabled: true,
};

/** Electrónica / celulares — fuerte en SKU + Price Memory. */
export const NICHE_ELECTRONICS: NicheHunterProfile = {
  id: 'electronics',
  name: 'Electrónica / Celulares',
  lane: 'electronics',
  categories: ['tecnologia', 'gaming'],
  mlCategoryIds: ['MLM1000', 'MLM1648', 'MLM1574', 'MLM1144'],
  mlQueries: [
    'celular oferta',
    'smartphone android',
    'laptop oferta',
    'audifonos bluetooth oferta',
    'monitor 27 oferta',
    'tablet oferta',
    'ssd nvme oferta',
    'nintendo switch juego',
  ],
  allowedSources: ['ml_api_legacy', 'ml_worker', 'amazon_paapi', 'amazon_asin'],
  priority: 80,
  candidateBudget: 28,
  insertBudget: 10,
  minDiscountPercent: 15,
  priceMin: 99,
  priceMax: 45000,
  minHistoryDays: 4,
  preferHistoryReady: true,
  enabled: true,
};

/**
 * Día a día — ingreso hormiga vía ML queries (retailer DTD flags siguen OFF).
 * No activa Chedraui/Walmart/Bodega.
 */
export const NICHE_DAY_TO_DAY: NicheHunterProfile = {
  id: 'day_to_day',
  name: 'Día a Día / Hogar / Básicos',
  lane: 'day_to_day',
  categories: ['supermercado', 'hogar'],
  mlCategoryIds: ['MLM1430', 'MLM1575'],
  mlQueries: [
    'papel higienico oferta',
    'detergente oferta',
    'aceite cocina oferta',
    'arroz oferta',
    'freidora de aire',
    'sabanas oferta',
    'toallas oferta',
    'limpiador oferta',
  ],
  allowedSources: ['ml_api_legacy', 'ml_worker'],
  priority: 70,
  candidateBudget: 20,
  insertBudget: 8,
  minDiscountPercent: 12,
  priceMin: 20,
  priceMax: 5000,
  minHistoryDays: 4,
  preferHistoryReady: false,
  enabled: true,
};

export const NICHE_HUNTER_PROFILES: readonly NicheHunterProfile[] = [
  NICHE_BEAUTY,
  NICHE_ELECTRONICS,
  NICHE_DAY_TO_DAY,
] as const;

export function nicheProfileById(id: string): NicheHunterProfile | null {
  return NICHE_HUNTER_PROFILES.find((p) => p.id === id) ?? null;
}

export function enabledNicheProfiles(): NicheHunterProfile[] {
  return NICHE_HUNTER_PROFILES.filter((p) => p.enabled);
}

/** Rotación determinística por wave (cron index). */
export function pickNicheForWave(wave: number, profiles = enabledNicheProfiles()): NicheHunterProfile | null {
  if (profiles.length === 0) return null;
  const sorted = [...profiles].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const idx = Math.abs(Math.floor(wave)) % sorted.length;
  return sorted[idx] ?? null;
}

export function parseSupplyEngineMode(raw: string | null | undefined): SupplyEngineMode {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'enabled' || v === 'write') return 'enabled';
  if (v === 'dry_run' || v === 'dry-run' || v === 'dry') return 'dry_run';
  return 'shadow';
}
