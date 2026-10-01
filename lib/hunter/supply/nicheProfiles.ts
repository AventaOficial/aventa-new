/**
 * NicheHunterProfile — configuración de nicho para el Supply Engine.
 * Backend/domain only. Agregar un nicho = datos, no copiar código.
 */

export type SupplyNicheLane = 'day_to_day' | 'top_deals' | 'beauty' | 'electronics';

/** Nicho canónico sticky/Price Memory (subset operativos del Supply Engine). */
export const SUPPLY_NICHE_IDS = ['beauty', 'electronics', 'day_to_day'] as const;
export type SupplyNicheId = (typeof SUPPLY_NICHE_IDS)[number];

export function isSupplyNicheId(raw: string | null | undefined): raw is SupplyNicheId {
  const v = (raw ?? '').trim();
  return (SUPPLY_NICHE_IDS as readonly string[]).includes(v);
}

export function normalizeSupplyNicheId(raw: string | null | undefined): SupplyNicheId | null {
  const v = (raw ?? '').trim();
  return isSupplyNicheId(v) ? v : null;
}

export type SupplyEngineMode = 'shadow' | 'dry_run' | 'enabled';

export type SupplyQueryIntent =
  | 'price_drop'
  | 'brand_product'
  | 'category'
  | 'coupon'
  | 'anomaly';

export type NicheQuerySpec = {
  query: string;
  intent: SupplyQueryIntent;
  priority: number;
};

export type NicheHunterProfile = {
  id: string;
  name: string;
  lane: SupplyLaneTag;
  /** Categorías Aventa canónicas preferidas (telemetría / scoring). */
  categories: string[];
  /** Categorías MLM para discovery API. */
  mlCategoryIds: string[];
  /** Queries de búsqueda ML (legacy flat list — derivado de querySpecs). */
  mlQueries: string[];
  /**
   * Estrategia de queries medible (intent + priority).
   * Agregar queries = datos aquí, no código nuevo.
   */
  querySpecs: readonly NicheQuerySpec[];
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

function queriesFromSpecs(specs: readonly NicheQuerySpec[]): string[] {
  return [...specs]
    .sort((a, b) => b.priority - a.priority || a.query.localeCompare(b.query))
    .map((s) => s.query);
}

const BEAUTY_QUERY_SPECS: readonly NicheQuerySpec[] = [
  { query: 'perfume mujer oferta', intent: 'price_drop', priority: 95 },
  { query: 'perfume hombre oferta', intent: 'price_drop', priority: 90 },
  { query: 'fragancia eau de parfum', intent: 'category', priority: 85 },
  { query: 'maquillaje oferta', intent: 'price_drop', priority: 80 },
  { query: 'skincare serum oferta', intent: 'price_drop', priority: 88 },
  { query: 'crema facial oferta', intent: 'price_drop', priority: 78 },
  { query: 'labial maybelline', intent: 'brand_product', priority: 82 },
  { query: 'cerave limpiador oferta', intent: 'brand_product', priority: 86 },
  { query: 'shampoo oferta', intent: 'category', priority: 70 },
  { query: 'protector solar oferta', intent: 'price_drop', priority: 84 },
  { query: 'dior sauvage oferta', intent: 'brand_product', priority: 89 },
  { query: 'carolina herrera perfume oferta', intent: 'brand_product', priority: 87 },
  { query: 'la roche posay oferta', intent: 'brand_product', priority: 86 },
  { query: 'isdin protector solar oferta', intent: 'brand_product', priority: 83 },
] as const;

/** Belleza / perfumería — alta señal observada en moderación. */
export const NICHE_BEAUTY: NicheHunterProfile = {
  id: 'beauty',
  name: 'Perfumería / Belleza',
  lane: 'beauty',
  categories: ['belleza'],
  mlCategoryIds: ['MLM1246', 'MLM1271'],
  querySpecs: BEAUTY_QUERY_SPECS,
  mlQueries: queriesFromSpecs(BEAUTY_QUERY_SPECS),
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

const ELECTRONICS_QUERY_SPECS: readonly NicheQuerySpec[] = [
  { query: 'celular oferta', intent: 'price_drop', priority: 95 },
  { query: 'smartphone android', intent: 'category', priority: 88 },
  { query: 'laptop oferta', intent: 'price_drop', priority: 90 },
  { query: 'audifonos bluetooth oferta', intent: 'price_drop', priority: 80 },
  { query: 'monitor 27 oferta', intent: 'price_drop', priority: 78 },
  { query: 'tablet oferta', intent: 'price_drop', priority: 82 },
  { query: 'ssd nvme oferta', intent: 'price_drop', priority: 85 },
  { query: 'samsung galaxy oferta', intent: 'brand_product', priority: 92 },
  { query: 'nintendo switch juego', intent: 'brand_product', priority: 75 },
  { query: 'motorola edge oferta', intent: 'brand_product', priority: 91 },
  { query: 'xiaomi redmi oferta', intent: 'brand_product', priority: 90 },
  { query: 'samsung galaxy s25 oferta', intent: 'brand_product', priority: 93 },
  { query: 'poco x7 oferta', intent: 'brand_product', priority: 86 },
  { query: 'hisense tv oferta', intent: 'brand_product', priority: 88 },
  { query: 'lg oled oferta', intent: 'brand_product', priority: 89 },
  { query: 'smart tv 55 oferta', intent: 'price_drop', priority: 84 },
  { query: 'asus vivobook oferta', intent: 'brand_product', priority: 81 },
  { query: 'lenovo loq oferta', intent: 'brand_product', priority: 80 },
  { query: 'playstation 5 oferta', intent: 'brand_product', priority: 87 },
  { query: 'airpods oferta', intent: 'brand_product', priority: 83 },
  { query: 'tablet samsung oferta', intent: 'brand_product', priority: 79 },
] as const;

/** Electrónica / celulares — fuerte en SKU + Price Memory. */
export const NICHE_ELECTRONICS: NicheHunterProfile = {
  id: 'electronics',
  name: 'Electrónica / Celulares',
  lane: 'electronics',
  categories: ['tecnologia', 'gaming'],
  mlCategoryIds: ['MLM1000', 'MLM1648', 'MLM1574', 'MLM1144', 'MLM1051'],
  querySpecs: ELECTRONICS_QUERY_SPECS,
  mlQueries: queriesFromSpecs(ELECTRONICS_QUERY_SPECS),
  allowedSources: ['ml_api_legacy', 'ml_worker', 'amazon_paapi', 'amazon_asin'],
  priority: 80,
  candidateBudget: 32,
  insertBudget: 10,
  minDiscountPercent: 15,
  priceMin: 99,
  priceMax: 45000,
  minHistoryDays: 4,
  preferHistoryReady: true,
  enabled: true,
};

const DAY_TO_DAY_QUERY_SPECS: readonly NicheQuerySpec[] = [
  { query: 'papel higienico oferta', intent: 'price_drop', priority: 90 },
  { query: 'detergente oferta', intent: 'price_drop', priority: 88 },
  { query: 'aceite cocina oferta', intent: 'price_drop', priority: 85 },
  { query: 'arroz oferta', intent: 'price_drop', priority: 80 },
  { query: 'freidora de aire', intent: 'category', priority: 75 },
  { query: 'sabanas oferta', intent: 'price_drop', priority: 70 },
  { query: 'toallas oferta', intent: 'price_drop', priority: 68 },
  { query: 'limpiador oferta', intent: 'price_drop', priority: 72 },
  { query: 'pasta dental oferta', intent: 'price_drop', priority: 86 },
  { query: 'shampoo oferta', intent: 'category', priority: 74 },
  { query: 'suavizante oferta', intent: 'price_drop', priority: 82 },
  { query: 'persil oferta', intent: 'brand_product', priority: 87 },
  { query: 'regio 32 rollos oferta', intent: 'brand_product', priority: 85 },
  { query: 'colgate pack oferta', intent: 'brand_product', priority: 84 },
  { query: 'downy oferta', intent: 'brand_product', priority: 81 },
  { query: 'ariel 9kg oferta', intent: 'brand_product', priority: 83 },
  { query: 'pañales oferta', intent: 'price_drop', priority: 76 },
  { query: 'cafe soluble oferta', intent: 'price_drop', priority: 73 },
  { query: 'cloro oferta', intent: 'price_drop', priority: 71 },
] as const;

/**
 * Día a día — ingreso hormiga vía ML queries (retailer DTD flags siguen OFF).
 * No activa Chedraui/Walmart/Bodega.
 */
export const NICHE_DAY_TO_DAY: NicheHunterProfile = {
  id: 'day_to_day',
  name: 'Día a Día / Hogar / Básicos',
  lane: 'day_to_day',
  categories: ['supermercado', 'hogar'],
  mlCategoryIds: ['MLM1430', 'MLM1575', 'MLM1403'],
  querySpecs: DAY_TO_DAY_QUERY_SPECS,
  mlQueries: queriesFromSpecs(DAY_TO_DAY_QUERY_SPECS),
  allowedSources: ['ml_api_legacy', 'ml_worker'],
  priority: 70,
  candidateBudget: 24,
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
