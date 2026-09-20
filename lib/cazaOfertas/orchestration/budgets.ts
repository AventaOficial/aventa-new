/**
 * CazaOfertasss — FASE 4. Resolución y seguimiento de budgets.
 *
 * Los techos viven en `constants.ts`. Un input sólo puede RECORTAR.
 */

import { CAZA_PIPELINE_BUDGETS, PUBLICATION_DRAIN_MAX_BATCH } from '../constants';
import type { CazaClock, CazaPipelineBudgetKey, CazaPipelineBudgets } from './types';

const BUDGET_KEYS: readonly CazaPipelineBudgetKey[] = [
  'MAX_DISCOVERY_PER_RUN',
  'MAX_CANDIDATES_PER_RUN',
  'MAX_PUBLICATIONS_PER_RUN',
  'MAX_TELEGRAM_SENDS_PER_RUN',
  'MAX_EXECUTION_MS',
  'MAX_DISCOVERY_PAGE_SIZE',
  'MAX_RECOVERY_PER_RUN',
  'MAX_STAGE_CONCURRENCY',
];

function clampBudget(requested: unknown, ceiling: number): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return ceiling;
  const floored = Math.floor(requested);
  if (floored < 1) return 1;
  return Math.min(floored, ceiling);
}

/**
 * Recorta los overrides contra los techos de constants. Valores inválidos,
 * ausentes o mayores al techo ⇒ techo. Valores < 1 ⇒ 1 (nunca 0: un budget
 * cero sería un ciclo vacío silencioso).
 */
export function resolveCazaPipelineBudgets(
  overrides: Partial<CazaPipelineBudgets> | undefined
): CazaPipelineBudgets {
  const resolved = {} as Record<CazaPipelineBudgetKey, number>;
  for (const key of BUDGET_KEYS) {
    resolved[key] = clampBudget(overrides?.[key], CAZA_PIPELINE_BUDGETS[key]);
  }
  // El drain del outbox tiene su propio techo histórico; los envíos nunca lo superan.
  resolved.MAX_TELEGRAM_SENDS_PER_RUN = Math.min(
    resolved.MAX_TELEGRAM_SENDS_PER_RUN,
    PUBLICATION_DRAIN_MAX_BATCH
  );
  return resolved;
}

/**
 * Tracker de consumo dentro de un ciclo. No duerme, no reintenta: sólo
 * responde "¿queda presupuesto?" y recuerda qué se agotó.
 */
export interface CazaBudgetTracker {
  readonly budgets: CazaPipelineBudgets;
  /** true si el presupuesto de tiempo se agotó (marca MAX_EXECUTION_MS). */
  timeExhausted(): boolean;
  /** Intenta consumir `n` unidades. false ⇒ agotado (y lo marca). */
  consume(key: Exclude<CazaPipelineBudgetKey, 'MAX_EXECUTION_MS'>, n?: number): boolean;
  remaining(key: Exclude<CazaPipelineBudgetKey, 'MAX_EXECUTION_MS'>): number;
  exhausted(): readonly CazaPipelineBudgetKey[];
}

export function createCazaBudgetTracker(
  budgets: CazaPipelineBudgets,
  clock: CazaClock,
  startedAtMs: number
): CazaBudgetTracker {
  const used = new Map<CazaPipelineBudgetKey, number>();
  const exhausted = new Set<CazaPipelineBudgetKey>();

  return {
    budgets,
    timeExhausted() {
      const elapsed = clock().getTime() - startedAtMs;
      if (elapsed >= budgets.MAX_EXECUTION_MS) {
        exhausted.add('MAX_EXECUTION_MS');
        return true;
      }
      return false;
    },
    consume(key, n = 1) {
      const current = used.get(key) ?? 0;
      if (current + n > budgets[key]) {
        exhausted.add(key);
        return false;
      }
      used.set(key, current + n);
      return true;
    },
    remaining(key) {
      return Math.max(0, budgets[key] - (used.get(key) ?? 0));
    },
    exhausted() {
      return [...exhausted].sort();
    },
  };
}
