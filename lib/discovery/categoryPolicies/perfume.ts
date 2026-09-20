import type { CategoryDiscoveryPolicy } from './types';

/**
 * Política inicial: perfumería / fragancias.
 * Marcas árabes como señales de interés — NO auto-approve; requiere descuento/precio.
 * Threshold de descuento alineado al mínimo histórico de ingest (20%), no inventado.
 */
export const PERFUME_DISCOVERY_POLICY: CategoryDiscoveryPolicy = {
  id: 'perfume',
  categoryIds: ['belleza'],
  preferredBrands: [
    'lattafa',
    'armaf',
    'afnan',
    'maison alhambra',
    'rasasi',
    'al haramain',
    'swiss arabian',
    'fragrance world',
    'paris corner',
  ],
  preferredProductKeywords: [
    'perfume',
    'eau de parfum',
    'edp',
    'edt',
    'fragancia',
    'colonia',
  ],
  preferredMinDiscountPercent: 20,
  preferredPriceMin: 199,
  preferredPriceMax: 4500,
  noveltyPreference: 1.1,
  notes: 'Perfumes árabes + fragancias con descuento real; mediocre discount → sin boost',
};

export const CATEGORY_DISCOVERY_POLICIES: readonly CategoryDiscoveryPolicy[] = [
  PERFUME_DISCOVERY_POLICY,
];
