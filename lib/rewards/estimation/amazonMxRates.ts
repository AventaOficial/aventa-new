/**
 * Tasas estándar de Amazon Associates MX, versión amazon_mx_standard_2026_10.
 * Una versión nueva se agrega con otra effectiveFrom. La anterior no se reescribe.
 * Mercado Libre no tiene tasas aquí: no hay una fuente confiable en el producto.
 */

export const AMAZON_MX_RATE_VERSION = 'amazon_mx_standard_2026_10' as const;
export const AMAZON_MX_RATE_SOURCE = 'amazon_associates_mx_standard' as const;

const CAP_800_CENTS = 80_000;
const CAP_500_CENTS = 50_000;
const EFFECTIVE_FROM = '2026-10-01T00:00:00.000Z';

export type CommissionRateRule = {
  retailer: string;
  category: string;
  match: readonly string[];
  rateBps: number;
  maximumCommissionCents: number | null;
  currency: 'MXN';
  rateSource: string;
  rateVersion: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  fallback: boolean;
};

function rule(
  category: string,
  match: readonly string[],
  rateBps: number,
  maximumCommissionCents: number,
  fallback = false,
): CommissionRateRule {
  return {
    retailer: 'amazon_mx',
    category,
    match,
    rateBps,
    maximumCommissionCents,
    currency: 'MXN',
    rateSource: AMAZON_MX_RATE_SOURCE,
    rateVersion: AMAZON_MX_RATE_VERSION,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveUntil: null,
    fallback,
  };
}

export const AMAZON_MX_COMMISSION_RULES: readonly CommissionRateRule[] = [
  rule('Cómputo', ['computo', 'computing', 'laptops', 'computadoras'], 500, CAP_800_CENTS),
  rule('Videojuegos', ['videojuegos', 'video games', 'videojuegos y consolas'], 500, CAP_800_CENTS),
  rule('TV y Entretenimiento del Hogar', ['tv y entretenimiento del hogar', 'tv', 'home entertainment', 'television'], 500, CAP_800_CENTS),
  rule('Instrumentos Musicales', ['instrumentos musicales'], 500, CAP_500_CENTS),
  rule('Cámara', ['camara', 'camaras', 'camera'], 500, CAP_500_CENTS),
  rule('Software', ['software'], 500, CAP_500_CENTS),
  rule('Películas', ['peliculas', 'movies'], 500, CAP_500_CENTS),
  rule('Celulares y Accesorios Móviles', ['celulares', 'celulares y accesorios moviles', 'celulares y accesorios', 'smartphones'], 700, CAP_500_CENTS),
  rule('Audio', ['audio'], 700, CAP_500_CENTS),
  rule('Al Aire Libre', ['al aire libre', 'outdoors'], 700, CAP_500_CENTS),
  rule('Automóvil', ['automovil', 'auto'], 800, CAP_500_CENTS),
  rule('Vinos y Licores', ['vinos y licores', 'vinos'], 800, CAP_500_CENTS),
  rule('Equipaje', ['equipaje'], 800, CAP_500_CENTS),
  rule('Libros Digitales', ['libros digitales'], 800, CAP_500_CENTS),
  rule('Muebles', ['muebles'], 800, CAP_500_CENTS),
  rule('Tarjetas de Regalo', ['tarjetas de regalo'], 800, CAP_500_CENTS),
  rule('Alimentos', ['alimentos'], 800, CAP_500_CENTS),
  rule('Handmade', ['handmade'], 800, CAP_500_CENTS),
  rule('Hogar', ['hogar'], 800, CAP_500_CENTS),
  rule('Mejoras del Hogar', ['mejoras del hogar'], 800, CAP_500_CENTS),
  rule('Joyería', ['joyeria'], 800, CAP_500_CENTS),
  rule('Cocina', ['cocina'], 800, CAP_500_CENTS),
  rule('Jardín', ['jardin'], 800, CAP_500_CENTS),
  rule('Electrodomésticos', ['electrodomesticos'], 800, CAP_500_CENTS),
  rule('Productos de Oficina', ['productos de oficina', 'oficina'], 800, CAP_500_CENTS),
  rule('Electrónicos para el Cuidado Personal', ['electronicos para el cuidado personal'], 800, CAP_500_CENTS),
  rule('Mascotas', ['mascotas'], 800, CAP_500_CENTS),
  rule('Deportes', ['deportes'], 800, CAP_500_CENTS),
  rule('Llantas', ['llantas'], 800, CAP_500_CENTS),
  rule('Herramientas', ['herramientas'], 800, CAP_500_CENTS),
  rule('Juguetes', ['juguetes'], 800, CAP_500_CENTS),
  rule('Relojes', ['relojes', 'watches'], 900, CAP_500_CENTS),
  rule('Ropa y Accesorios', ['ropa y accesorios', 'ropa'], 1000, CAP_500_CENTS),
  rule('Bebé', ['bebe'], 1000, CAP_500_CENTS),
  rule('Belleza', ['belleza'], 1000, CAP_500_CENTS),
  rule('Cuidado Personal', ['cuidado personal'], 1000, CAP_500_CENTS),
  rule('Música', ['musica'], 1000, CAP_500_CENTS),
  rule('Libros', ['libros'], 1000, CAP_500_CENTS),
  rule('Zapatos', ['zapatos'], 1000, CAP_500_CENTS),
  rule('Coach', ['coach'], 0, 0),
  rule('Otros', [], 800, CAP_500_CENTS, true),
];

export function foldCategory(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveRetailer(value: string | null | undefined): 'amazon_mx' | 'mercadolibre_mx' | 'unknown' {
  const folded = foldCategory(value ?? '');
  if (!folded) return 'unknown';
  if (folded.includes('mercado libre') || folded.includes('mercadolibre') || folded === 'ml') return 'mercadolibre_mx';
  if (folded.includes('amazon')) return 'amazon_mx';
  return 'unknown';
}

export function resolveAmazonCommissionRule(
  category: string | null | undefined,
  asOf: string,
  rules: readonly CommissionRateRule[] = AMAZON_MX_COMMISSION_RULES,
): CommissionRateRule | null {
  const at = Date.parse(asOf);
  if (!Number.isFinite(at)) return null;
  const active = rules.filter((item) => {
    if (item.retailer !== 'amazon_mx') return false;
    const from = Date.parse(item.effectiveFrom);
    const until = item.effectiveUntil ? Date.parse(item.effectiveUntil) : Number.POSITIVE_INFINITY;
    return Number.isFinite(from) && at >= from && at < until;
  });
  const folded = foldCategory(category ?? '');
  const specific = folded
    ? active
        .filter((item) => !item.fallback && item.match.some((key) => foldCategory(key) === folded))
        .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))
    : [];
  if (specific[0]) return specific[0];
  return active
    .filter((item) => item.fallback)
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0] ?? null;
}
