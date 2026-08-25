/**
 * Rangos de presupuesto del catálogo. Sirven para tres cosas con el mismo dato:
 * moderación (qué aprobar primero), cazadores (qué falta buscar) y el bot
 * (hacia dónde sesgar el descubrimiento).
 */

export type PriceBracketId =
  | 'hasta_200'
  | 'de_200_1k'
  | 'de_1k_3k'
  | 'de_3k_10k'
  | 'mas_10k';

export type PriceBracket = {
  id: PriceBracketId;
  /** Etiqueta larga para tarjetas y tablas. */
  label: string;
  /** Etiqueta corta para chips. */
  short: string;
  /** Para qué sirve ese presupuesto, en lenguaje de la calle. */
  hint: string;
  min: number;
  /** `null` = sin techo. */
  max: number | null;
};

export const PRICE_BRACKETS: readonly PriceBracket[] = [
  {
    id: 'hasta_200',
    label: 'Hasta $200',
    short: '≤ $200',
    hint: 'Antojos, despensa, cosas de uso diario',
    min: 0,
    max: 200,
  },
  {
    id: 'de_200_1k',
    label: '$200 a $1,000',
    short: '$200–1k',
    hint: 'Ropa, belleza, cosas para la casa',
    min: 200,
    max: 1000,
  },
  {
    id: 'de_1k_3k',
    label: '$1,000 a $3,000',
    short: '$1k–3k',
    hint: 'Regalos, muebles chicos, gadgets',
    min: 1000,
    max: 3000,
  },
  {
    id: 'de_3k_10k',
    label: '$3,000 a $10,000',
    short: '$3k–10k',
    hint: 'Electrodomésticos, celulares, viajes',
    min: 3000,
    max: 10000,
  },
  {
    id: 'mas_10k',
    label: 'Más de $10,000',
    short: '> $10k',
    hint: 'Pantallas grandes, laptops, muebles fuertes',
    min: 10000,
    max: null,
  },
] as const;

export const CATALOG_TARGETS_CONFIG_KEY = 'catalog_bracket_targets';

/** Cuántas ofertas vivas queremos por rango. Ajustable desde `app_config`. */
export const DEFAULT_BRACKET_TARGETS: Record<PriceBracketId, number> = {
  hasta_200: 20,
  de_200_1k: 30,
  de_1k_3k: 25,
  de_3k_10k: 15,
  mas_10k: 10,
};

export function bracketForPrice(price: number | null | undefined): PriceBracketId | null {
  const n = typeof price === 'string' ? Number(price) : price;
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  for (const bracket of PRICE_BRACKETS) {
    if (bracket.max == null) return bracket.id;
    if (n < bracket.max) return bracket.id;
  }
  return PRICE_BRACKETS[PRICE_BRACKETS.length - 1].id;
}

/** Lee targets desde `app_config`, ignorando basura y rellenando con los default. */
export function parseBracketTargets(raw: unknown): Record<PriceBracketId, number> {
  const out = { ...DEFAULT_BRACKET_TARGETS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const bracket of PRICE_BRACKETS) {
    const value = (raw as Record<string, unknown>)[bracket.id];
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      out[bracket.id] = Math.round(n);
    }
  }
  return out;
}

export type CatalogGap = PriceBracket & {
  count: number;
  target: number;
  /** Cuántas faltan para llegar a la meta (0 si ya se cumplió). */
  missing: number;
  /** 0–100, para barras de progreso. */
  fillPercent: number;
};

export function buildCatalogGaps(
  counts: Partial<Record<PriceBracketId, number>>,
  targets: Record<PriceBracketId, number> = DEFAULT_BRACKET_TARGETS
): CatalogGap[] {
  return PRICE_BRACKETS.map((bracket) => {
    const count = Math.max(0, Math.round(counts[bracket.id] ?? 0));
    const target = Math.max(0, Math.round(targets[bracket.id] ?? 0));
    const missing = Math.max(0, target - count);
    const fillPercent = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 100;
    return { ...bracket, count, target, missing, fillPercent };
  });
}

/** El rango con mayor hueco absoluto; null si el catálogo está completo. */
export function biggestGap(gaps: CatalogGap[]): CatalogGap | null {
  const pending = gaps.filter((g) => g.missing > 0);
  if (pending.length === 0) return null;
  return pending.reduce((worst, g) => (g.missing > worst.missing ? g : worst), pending[0]);
}
