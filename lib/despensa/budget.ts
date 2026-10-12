/**
 * Presupuesto de despensa declarado por la persona usuaria.
 *
 * Es una preferencia opcional para ordenar «Día a día». No es un filtro: ninguna oferta
 * se oculta por su precio. Aventa no deduce ingresos, nivel socioeconómico ni tamaño del
 * hogar a partir de este dato, y no lo registra en analítica (solo horizonte y nivel).
 *
 * Persistencia: `user_metadata.despensa_budget` de Supabase Auth para sesiones (solo la
 * propia cuenta lo lee o escribe) y `localStorage` sin sesión. Ver `budgetStore.ts`.
 */

export const DESPENSA_BUDGET_VERSION = 1 as const;

export const DESPENSA_BUDGET_HORIZONS = ['weekly', 'monthly'] as const;
export type DespensaBudgetHorizon = (typeof DESPENSA_BUDGET_HORIZONS)[number];

export const DESPENSA_BUDGET_TIERS = ['low', 'medium', 'high', 'custom'] as const;
export type DespensaBudgetTier = (typeof DESPENSA_BUDGET_TIERS)[number];

export type DespensaBudget = {
  v: typeof DESPENSA_BUDGET_VERSION;
  horizon: DespensaBudgetHorizon;
  amountMxn: number;
  tier: DespensaBudgetTier;
  updatedAt: string;
};

export const DESPENSA_BUDGET_LIMITS = { minMxn: 100, maxMxn: 200_000 } as const;

/** Semanas promedio por mes (365.25 / 12 / 7). */
export const WEEKS_PER_MONTH = 4.348;

/**
 * Opciones rápidas. Son puntos de partida para elegir rápido, no recomendaciones:
 * la cantidad personalizada siempre está disponible.
 */
export const DESPENSA_BUDGET_PRESETS: Record<DespensaBudgetHorizon, Record<Exclude<DespensaBudgetTier, 'custom'>, number>> = {
  weekly: { low: 500, medium: 1_000, high: 2_000 },
  monthly: { low: 2_000, medium: 4_000, high: 8_000 },
};

export const DESPENSA_BUDGET_TIER_LABELS: Record<DespensaBudgetTier, string> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
  custom: 'Otra cantidad',
};

export const DESPENSA_BUDGET_HORIZON_LABELS: Record<DespensaBudgetHorizon, string> = {
  weekly: 'A la semana',
  monthly: 'Al mes',
};

/**
 * Regla de ajuste. Una oferta «cabe» si su precio total no pasa de esta fracción del
 * presupuesto semanal equivalente. Solo desempata ofertas con el mismo nivel de precio
 * unitario: un paquete grande con mejor precio por kilo sigue arriba aunque no quepa.
 */
export const DESPENSA_BUDGET_RULES = {
  version: 'despensa-budget-v1',
  maxShareOfWeeklyBudget: 0.25,
} as const;

function roundMxn(n: number): number {
  return Math.round(n);
}

export function isValidBudgetAmount(amount: unknown): amount is number {
  return (
    typeof amount === 'number' &&
    Number.isFinite(amount) &&
    amount >= DESPENSA_BUDGET_LIMITS.minMxn &&
    amount <= DESPENSA_BUDGET_LIMITS.maxMxn
  );
}

/** Construye un presupuesto válido o null. La cantidad se redondea a pesos. */
export function buildDespensaBudget(input: {
  horizon: DespensaBudgetHorizon;
  tier: DespensaBudgetTier;
  amountMxn?: number | null;
  now?: Date;
}): DespensaBudget | null {
  if (!DESPENSA_BUDGET_HORIZONS.includes(input.horizon)) return null;
  if (!DESPENSA_BUDGET_TIERS.includes(input.tier)) return null;
  const amount =
    input.tier === 'custom' ? input.amountMxn : DESPENSA_BUDGET_PRESETS[input.horizon][input.tier];
  if (amount == null) return null;
  const rounded = roundMxn(amount);
  if (!isValidBudgetAmount(rounded)) return null;
  return {
    v: DESPENSA_BUDGET_VERSION,
    horizon: input.horizon,
    tier: input.tier,
    amountMxn: rounded,
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** Lee un presupuesto guardado. Cualquier forma inesperada devuelve null (sin presupuesto). */
export function parseDespensaBudget(raw: unknown): DespensaBudget | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== DESPENSA_BUDGET_VERSION) return null;
  if (!DESPENSA_BUDGET_HORIZONS.includes(r.horizon as DespensaBudgetHorizon)) return null;
  if (!DESPENSA_BUDGET_TIERS.includes(r.tier as DespensaBudgetTier)) return null;
  if (!isValidBudgetAmount(r.amountMxn)) return null;
  if (typeof r.updatedAt !== 'string' || !Number.isFinite(Date.parse(r.updatedAt))) return null;
  return {
    v: DESPENSA_BUDGET_VERSION,
    horizon: r.horizon as DespensaBudgetHorizon,
    tier: r.tier as DespensaBudgetTier,
    amountMxn: roundMxn(r.amountMxn),
    updatedAt: r.updatedAt,
  };
}

export function weeklyEquivalentMxn(budget: Pick<DespensaBudget, 'horizon' | 'amountMxn'>): number {
  return budget.horizon === 'weekly' ? budget.amountMxn : budget.amountMxn / WEEKS_PER_MONTH;
}

export type BudgetFit = 'fits' | 'over_share' | 'unknown_price' | 'no_budget';

export function budgetFit(price: number | null | undefined, budget: DespensaBudget | null | undefined): BudgetFit {
  if (!budget) return 'no_budget';
  if (price == null || !(price > 0)) return 'unknown_price';
  const ceiling = weeklyEquivalentMxn(budget) * DESPENSA_BUDGET_RULES.maxShareOfWeeklyBudget;
  return price <= ceiling ? 'fits' : 'over_share';
}

export function formatMxn(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount);
}

export function describeDespensaBudget(budget: DespensaBudget): string {
  return `${formatMxn(budget.amountMxn)} ${budget.horizon === 'weekly' ? 'a la semana' : 'al mes'}`;
}
