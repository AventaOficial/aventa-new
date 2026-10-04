import type { CeoPriority, HealthCategory } from './types';

export type OverallState = 'healthy' | 'attention' | 'critical' | 'unknown';

export type DecisionSummary = {
  state: OverallState;
  headline: string;
  critical: number;
  high: number;
  /** La siguiente acción más importante; null si nada la requiere. */
  next: CeoPriority | null;
};

const HEADLINE: Record<OverallState, string> = {
  healthy: 'Todo en orden',
  attention: 'Requiere atención',
  critical: 'Hay algo crítico',
  unknown: 'Sin datos suficientes',
};

/**
 * Responde «¿qué debo decidir ahora?» con lo que ya calculan salud y prioridades.
 * FROZEN no cuenta como problema: es un congelamiento intencional.
 */
export function summarizeDecision(health: HealthCategory[], priorities: CeoPriority[]): DecisionSummary {
  const critical = priorities.filter((p) => p.severity === 'critical').length;
  const high = priorities.filter((p) => p.severity === 'high').length;
  const levels = health.map((h) => h.level);

  let state: OverallState;
  if (critical > 0 || levels.includes('CRITICAL')) state = 'critical';
  else if (high > 0 || levels.includes('WARNING')) state = 'attention';
  else if (levels.length === 0 || levels.every((l) => l === 'UNKNOWN')) state = 'unknown';
  else state = 'healthy';

  const next = priorities.find((p) => p.severity !== 'info') ?? null;
  return { state, headline: HEADLINE[state], critical, high, next };
}
