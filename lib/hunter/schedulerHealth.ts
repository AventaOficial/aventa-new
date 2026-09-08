import type { HunterSourceHealth, HunterSourceId } from './types';

/**
 * Salud del PLANIFICADOR, que es una pregunta distinta de la salud de la fuente.
 *
 * Una fuente puede estar `healthy` (su última corrida fue perfecta) y aun así
 * llevar seis horas sin ejecutarse porque quien la dispara dejó de hacerlo. Ese
 * caso es invisible en `hunter_source_health.status` y es exactamente el que
 * dejó a Aventa sin supply.
 *
 * Se deriva de datos que ya existen (`last_run_at`, `expected_interval_ms`):
 * no hace falta tabla ni columna nueva.
 */
export type SchedulerHealthState = 'healthy' | 'degraded' | 'stale' | 'down' | 'disabled';

/**
 * Múltiplos del intervalo prometido por la fuente. Son tolerancias relativas, no
 * minutos fijos: una fuente que promete 30 min y otra que promete 15 no pueden
 * juzgarse con el mismo reloj.
 *
 * El cron de GitHub Actions no garantiza puntualidad, así que llegar tarde no es
 * por sí mismo una avería; dejar de llegar sí lo es.
 */
export const SCHEDULER_TOLERANCE = {
  /** Hasta 1.5x: retraso normal de cualquier cron. */
  healthy: 1.5,
  /** Hasta 3x: llega tarde pero sigue llegando. */
  degraded: 3,
  /** Hasta 8x: ya no se puede llamar retraso. */
  stale: 8,
} as const;

export type SchedulerHealth = {
  sourceId: HunterSourceId;
  state: SchedulerHealthState;
  lastRunAt: string | null;
  /** Horas desde la última corrida. null = nunca corrió. */
  hoursSinceLastRun: number | null;
  expectedIntervalMinutes: number;
  /** Cuándo debería haber corrido ya. null si nunca corrió. */
  expectedNextRunAt: string | null;
  /** Corridas que deberían haber ocurrido en 24 h si el intervalo se cumpliera. */
  expectedRunsPerDay: number;
  reason: string;
};

function hoursBetween(fromIso: string | null | undefined, now: Date): number | null {
  if (typeof fromIso !== 'string' || !fromIso.trim()) return null;
  const ts = Date.parse(fromIso);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round(((now.getTime() - ts) / 3_600_000) * 10) / 10);
}

/**
 * Clasifica UNA fuente. Determinista y puro: no consulta la DB ni escribe nada.
 *
 * Fail-closed: sin `last_run_at` usable el estado es `down`, nunca `healthy`.
 * No saber cuándo corrió por última vez no es una buena noticia.
 */
export function classifySchedulerHealth(
  row: Pick<
    HunterSourceHealth,
    'sourceId' | 'enabled' | 'lastRunAt' | 'expectedIntervalMs' | 'consecutiveFailures'
  >,
  now: Date = new Date()
): SchedulerHealth {
  const intervalMs =
    Number.isFinite(row.expectedIntervalMs) && row.expectedIntervalMs > 0
      ? row.expectedIntervalMs
      : 15 * 60 * 1000;
  const expectedIntervalMinutes = Math.round(intervalMs / 60_000);
  const expectedRunsPerDay = Math.round((24 * 60) / Math.max(1, expectedIntervalMinutes));
  const hoursSinceLastRun = hoursBetween(row.lastRunAt, now);
  const lastRunMs = row.lastRunAt ? Date.parse(row.lastRunAt) : Number.NaN;
  const expectedNextRunAt = Number.isFinite(lastRunMs)
    ? new Date(lastRunMs + intervalMs).toISOString()
    : null;

  const base = {
    sourceId: row.sourceId,
    lastRunAt: row.lastRunAt ?? null,
    hoursSinceLastRun,
    expectedIntervalMinutes,
    expectedNextRunAt,
    expectedRunsPerDay,
  };

  if (!row.enabled) {
    return { ...base, state: 'disabled', reason: 'Fuente desactivada a propósito' };
  }
  if (!Number.isFinite(lastRunMs)) {
    return { ...base, state: 'down', reason: 'Sin registro de ninguna corrida' };
  }

  const elapsed = now.getTime() - lastRunMs;
  const lateBy = elapsed / intervalMs;

  if (lateBy <= SCHEDULER_TOLERANCE.healthy) {
    return { ...base, state: 'healthy', reason: 'Corriendo dentro del intervalo esperado' };
  }
  if (lateBy <= SCHEDULER_TOLERANCE.degraded) {
    return {
      ...base,
      state: 'degraded',
      reason: `Retrasado ${lateBy.toFixed(1)}x el intervalo prometido`,
    };
  }
  if (lateBy <= SCHEDULER_TOLERANCE.stale) {
    return {
      ...base,
      state: 'stale',
      reason: `Sin correr desde hace ${hoursSinceLastRun} h`,
    };
  }
  return { ...base, state: 'down', reason: `Sin correr desde hace ${hoursSinceLastRun} h` };
}

/** Peor estado primero: es lo que el fundador necesita ver arriba. */
const SEVERITY: SchedulerHealthState[] = ['down', 'stale', 'degraded', 'healthy', 'disabled'];

export type SchedulerHealthSummary = {
  /** El peor estado entre las fuentes habilitadas. `disabled` no cuenta. */
  worstState: SchedulerHealthState;
  needsAttention: boolean;
  sources: SchedulerHealth[];
};

export function summarizeSchedulerHealth(
  rows: readonly Pick<
    HunterSourceHealth,
    'sourceId' | 'enabled' | 'lastRunAt' | 'expectedIntervalMs' | 'consecutiveFailures'
  >[],
  now: Date = new Date()
): SchedulerHealthSummary {
  const sources = rows
    .map((row) => classifySchedulerHealth(row, now))
    .sort((a, b) => SEVERITY.indexOf(a.state) - SEVERITY.indexOf(b.state));

  const active = sources.filter((s) => s.state !== 'disabled');
  const worstState = active[0]?.state ?? 'disabled';

  return {
    worstState,
    needsAttention: worstState === 'stale' || worstState === 'down',
    sources,
  };
}
