/**
 * Budgets sticky centralizados — por nicho + techo global de seguridad.
 * Modificar aquí / vía env; no hardcodear en el selector.
 */

import { nicheProfileById } from './nicheProfiles';

export type StickyBudgetConfig = {
  /** Techo absoluto por ola (nunca exceder). */
  globalMaxPerWave: number;
  /** Default si el nicho no tiene override. */
  defaultNicheMaxPerWave: number;
  /** Overrides explícitos por nicheId. */
  nicheMaxPerWave: Readonly<Record<string, number>>;
  /** Máx. SKUs del mismo store/seller en una ola (diversidad). */
  maxPerStore: number;
};

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadStickyBudgetConfig(): StickyBudgetConfig {
  return {
    globalMaxPerWave: envInt('SUPPLY_STICKY_GLOBAL_MAX_PER_WAVE', 24),
    defaultNicheMaxPerWave: envInt('SUPPLY_STICKY_MAX_PER_WAVE', 8),
    nicheMaxPerWave: {
      beauty: envInt('SUPPLY_STICKY_BUDGET_BEAUTY', 8),
      electronics: envInt('SUPPLY_STICKY_BUDGET_ELECTRONICS', 8),
      day_to_day: envInt('SUPPLY_STICKY_BUDGET_DAY_TO_DAY', 8),
    },
    maxPerStore: envInt('SUPPLY_STICKY_MAX_PER_STORE', 2),
  };
}

/**
 * Budget efectivo para un nicho: min(nicheMax, globalMax).
 * Nicho desconocido → 0 (fail-closed).
 */
export function resolveStickyNicheBudget(
  nicheId: string,
  cfg: StickyBudgetConfig = loadStickyBudgetConfig(),
): number {
  if (!nicheProfileById(nicheId)) return 0;
  const nicheMax =
    cfg.nicheMaxPerWave[nicheId] ?? cfg.defaultNicheMaxPerWave;
  return Math.max(0, Math.min(nicheMax, cfg.globalMaxPerWave));
}
