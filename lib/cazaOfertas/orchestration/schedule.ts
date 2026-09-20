/**
 * CazaOfertasss — FASE 4. Contrato de scheduling.
 *
 * Define QUÉ se ejecuta periódicamente y con qué límites. NO activa cron
 * productivo: no toca `vercel.json`, no registra timers, no arranca workers.
 * Un scheduler futuro (cron, queue, worker) sólo tiene que invocar estas tres
 * funciones respetando `resolveScheduleIntervalMs`.
 */

import {
  CAZA_SCHEDULE_DEFAULTS,
  CAZAOFERTAS_DISCOVERY_INTERVAL_ENV,
  CAZAOFERTAS_PUBLICATION_INTERVAL_ENV,
  CAZAOFERTAS_RECOVERY_INTERVAL_ENV,
  CAZAOFERTAS_SCHEDULING_BOUNDARY,
} from '../constants';
import type { IsoTimestamp } from '../types';
import type {
  CazaPipelineBudgets,
  CazaPipelineCycleMode,
  CazaPipelineCycleResult,
  CazaPipelineRunner,
} from './types';

export type CazaScheduledJobKind = 'discovery' | 'publication_drain' | 'recovery';

export interface CazaScheduleContract {
  readonly kind: CazaScheduledJobKind;
  readonly mode: CazaPipelineCycleMode;
  /** Env var que puede sobreescribir el intervalo. Nombre, nunca valor secreto. */
  readonly intervalEnvVar: string;
  readonly defaultIntervalMs: number;
  readonly minIntervalMs: number;
  readonly maxIntervalMs: number;
  /** Budgets relevantes para el job (los techos viven en constants). */
  readonly budgetKeys: readonly (keyof CazaPipelineBudgets)[];
}

export const CAZA_SCHEDULE_CONTRACTS: Readonly<Record<CazaScheduledJobKind, CazaScheduleContract>> =
  {
    discovery: {
      kind: 'discovery',
      mode: 'discovery',
      intervalEnvVar: CAZAOFERTAS_DISCOVERY_INTERVAL_ENV,
      defaultIntervalMs: CAZA_SCHEDULE_DEFAULTS.discoveryIntervalMs,
      minIntervalMs: CAZA_SCHEDULE_DEFAULTS.minIntervalMs,
      maxIntervalMs: CAZA_SCHEDULE_DEFAULTS.maxIntervalMs,
      budgetKeys: [
        'MAX_DISCOVERY_PER_RUN',
        'MAX_CANDIDATES_PER_RUN',
        'MAX_PUBLICATIONS_PER_RUN',
        'MAX_EXECUTION_MS',
      ],
    },
    publication_drain: {
      kind: 'publication_drain',
      mode: 'publication_drain',
      intervalEnvVar: CAZAOFERTAS_PUBLICATION_INTERVAL_ENV,
      defaultIntervalMs: CAZA_SCHEDULE_DEFAULTS.publicationIntervalMs,
      minIntervalMs: CAZA_SCHEDULE_DEFAULTS.minIntervalMs,
      maxIntervalMs: CAZA_SCHEDULE_DEFAULTS.maxIntervalMs,
      budgetKeys: ['MAX_TELEGRAM_SENDS_PER_RUN', 'MAX_RECOVERY_PER_RUN', 'MAX_EXECUTION_MS'],
    },
    recovery: {
      kind: 'recovery',
      mode: 'recovery',
      intervalEnvVar: CAZAOFERTAS_RECOVERY_INTERVAL_ENV,
      defaultIntervalMs: CAZA_SCHEDULE_DEFAULTS.recoveryIntervalMs,
      minIntervalMs: CAZA_SCHEDULE_DEFAULTS.minIntervalMs,
      maxIntervalMs: CAZA_SCHEDULE_DEFAULTS.maxIntervalMs,
      budgetKeys: ['MAX_RECOVERY_PER_RUN', 'MAX_EXECUTION_MS'],
    },
  };

/**
 * Intervalo efectivo: env válido recortado a [min, max]; env ausente o
 * inválido ⇒ default. Nunca lanza.
 */
export function resolveScheduleIntervalMs(
  kind: CazaScheduledJobKind,
  env: NodeJS.ProcessEnv = process.env
): number {
  const contract = CAZA_SCHEDULE_CONTRACTS[kind];
  const raw = env[contract.intervalEnvVar];
  if (typeof raw !== 'string' || !/^\d{1,12}$/.test(raw.trim())) {
    return contract.defaultIntervalMs;
  }
  const parsed = Number(raw.trim());
  return Math.min(contract.maxIntervalMs, Math.max(contract.minIntervalMs, parsed));
}

export function assertProductionCronDisabled(): void {
  if (
    CAZAOFERTAS_SCHEDULING_BOUNDARY.productionCronEnabled ||
    CAZAOFERTAS_SCHEDULING_BOUNDARY.vercelCronConfigured
  ) {
    throw new Error('CazaOfertasss FASE 4: el cron productivo debe permanecer desactivado');
  }
}

export interface ScheduledCycleOptions {
  readonly cycleId?: string;
  readonly budgets?: Partial<CazaPipelineBudgets>;
}

export interface DiscoveryCycleOptions extends ScheduledCycleOptions {
  readonly since?: IsoTimestamp | null;
  readonly cursors?: Readonly<Record<string, string | null>>;
}

/** DISCOVER → … → PREPARE_PUBLICATION. No envía a Telegram. */
export function runDiscoveryCycle(
  runner: CazaPipelineRunner,
  options: DiscoveryCycleOptions = {}
): Promise<CazaPipelineCycleResult> {
  assertProductionCronDisabled();
  return runner.runCycle({
    mode: 'discovery',
    cycleId: options.cycleId,
    budgets: options.budgets,
    since: options.since ?? null,
    cursors: options.cursors,
  });
}

/** RECOVER + PUBLISH sobre el outbox existente (PREPARED → SENDING → PUBLISHED). */
export function runPublicationDrain(
  runner: CazaPipelineRunner,
  options: ScheduledCycleOptions = {}
): Promise<CazaPipelineCycleResult> {
  assertProductionCronDisabled();
  return runner.runCycle({
    mode: 'publication_drain',
    cycleId: options.cycleId,
    budgets: options.budgets,
  });
}

/** Sólo RECOVER: leases SENDING expirados → PREPARED | FAILED. */
export function runRecoveryCycle(
  runner: CazaPipelineRunner,
  options: ScheduledCycleOptions = {}
): Promise<CazaPipelineCycleResult> {
  assertProductionCronDisabled();
  return runner.runCycle({
    mode: 'recovery',
    cycleId: options.cycleId,
    budgets: options.budgets,
  });
}
