/**
 * CazaOfertasss — FASE 4. Contratos del orchestrator.
 *
 * El orchestrator COORDINA. No decide precio, validez, score, identidad,
 * monetización ni estado de publicación: cada uno de esos módulos conserva su
 * autoridad. Aquí sólo viven los tipos del ciclo, los stages y los reportes.
 */

import type { IsoTimestamp } from '../types';

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export const CAZA_PIPELINE_STAGES = [
  'DISCOVER',
  'NORMALIZE',
  'VALIDATE',
  'SCORE',
  'AFFILIATE',
  'DEDUPE',
  'ELIGIBILITY',
  'PREPARE_PUBLICATION',
  'PUBLISH',
  'RECOVER',
] as const;

export type CazaPipelineStage = (typeof CAZA_PIPELINE_STAGES)[number];

/**
 * Modo del ciclo. Cada modo ejecuta un subconjunto fijo de stages:
 *   discovery         → DISCOVER … PREPARE_PUBLICATION (no envía)
 *   publication_drain → RECOVER + PUBLISH (outbox existente)
 *   recovery          → RECOVER
 *   full              → discovery + publication_drain
 */
export type CazaPipelineCycleMode = 'discovery' | 'publication_drain' | 'recovery' | 'full';

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export interface CazaPipelineBudgets {
  readonly MAX_DISCOVERY_PER_RUN: number;
  readonly MAX_CANDIDATES_PER_RUN: number;
  readonly MAX_PUBLICATIONS_PER_RUN: number;
  readonly MAX_TELEGRAM_SENDS_PER_RUN: number;
  readonly MAX_EXECUTION_MS: number;
  readonly MAX_DISCOVERY_PAGE_SIZE: number;
  readonly MAX_RECOVERY_PER_RUN: number;
  readonly MAX_STAGE_CONCURRENCY: number;
}

export type CazaPipelineBudgetKey = keyof CazaPipelineBudgets;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface CazaPipelineCycleInput {
  /**
   * Identidad del ciclo. Opcional: si se omite se deriva de modo+startedAt.
   * Replay con el mismo `cycleId` NO crea publicaciones ni candidatos
   * duplicados: la idempotencia la garantizan las identidades de dominio.
   */
  readonly cycleId?: string;
  readonly mode: CazaPipelineCycleMode;
  /** Recorte adicional de budgets. Nunca puede superar los techos de constants. */
  readonly budgets?: Partial<CazaPipelineBudgets>;
  /** Pasado tal cual a las fuentes de discovery. */
  readonly since?: IsoTimestamp | null;
  /** Cursor por `sourceId` para reanudar discovery paginado. */
  readonly cursors?: Readonly<Record<string, string | null>>;
}

// ---------------------------------------------------------------------------
// Observabilidad
// ---------------------------------------------------------------------------

export interface CazaStageReport {
  readonly cycleId: string;
  readonly stage: CazaPipelineStage;
  readonly durationMs: number;
  readonly inputCount: number;
  readonly successCount: number;
  readonly rejectedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  /** reason code → ocurrencias. Cardinalidad acotada por MAX_STAGE_REASON_CODES. */
  readonly reasonCodes: Readonly<Record<string, number>>;
}

export interface CazaCycleError {
  readonly stage: CazaPipelineStage | 'CYCLE';
  readonly code: string;
  /** Mensaje ya redactado: sin tokens, tags de afiliado, JWT ni query strings. */
  readonly message: string;
  readonly sourceId: string | null;
  readonly identityKey: string | null;
}

export interface CazaDiscoverySourceReport {
  readonly sourceId: string;
  readonly outcome: 'ok' | 'empty' | 'unsupported' | 'failed' | 'skipped_budget';
  readonly discovered: number;
  readonly pages: number;
  readonly nextCursor: string | null;
  readonly observedAt: IsoTimestamp | null;
}

export interface CazaCycleObserver {
  onStage?(report: CazaStageReport): void;
  onCycle?(result: CazaPipelineCycleResult): void;
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export interface CazaPipelineCycleResult {
  readonly cycleId: string;
  readonly mode: CazaPipelineCycleMode;
  readonly startedAt: IsoTimestamp;
  readonly finishedAt: IsoTimestamp;
  readonly durationMs: number;

  /** Drafts recibidos de discovery (≤ MAX_DISCOVERY_PER_RUN). */
  readonly discovered: number;
  /** Candidatos que pasaron VALIDATE (buildDealCandidate ok). */
  readonly validated: number;
  /** Rechazos de candidato: validación fallida + grade REJECT. */
  readonly rejected: number;
  /** Candidatos con grade ≠ REJECT. */
  readonly scored: number;
  /** Upserts que resolvieron contra una identidad existente (updated|unchanged). */
  readonly deduplicated: number;
  /** Candidatos con attachment monetizable (status PUBLICATION_READY). */
  readonly affiliateEligible: number;
  /** Registros PREPARED insertados en este ciclo. */
  readonly prepared: number;
  /** Publicaciones que alcanzaron PUBLISHED en este ciclo. */
  readonly published: number;
  /** Publicaciones re-programadas (429/5xx → PREPARED + next_attempt_at). */
  readonly retried: number;
  /** Leases SENDING expirados recuperados. */
  readonly recovered: number;
  /** Fallos no-rechazo: excepciones de stage, fuentes caídas, Telegram terminal. */
  readonly failed: number;
  /** Ítems no procesados sin ser error ni rechazo: budget, idempotent hit, no elegible. */
  readonly skipped: number;

  readonly errors: readonly CazaCycleError[];
  readonly stages: readonly CazaStageReport[];
  readonly sources: readonly CazaDiscoverySourceReport[];
  /** Budgets que se agotaron durante el ciclo. */
  readonly budgetsExhausted: readonly CazaPipelineBudgetKey[];
  readonly budgets: CazaPipelineBudgets;
}

// ---------------------------------------------------------------------------
// Runner port
// ---------------------------------------------------------------------------

export type CazaClock = () => Date;

/**
 * Puerto conceptual del orchestrator. Una ejecución = un ciclo bounded.
 * `runCycle` nunca lanza: todo fallo se materializa en `errors[]`.
 */
export interface CazaPipelineRunner {
  runCycle(input: CazaPipelineCycleInput): Promise<CazaPipelineCycleResult>;
}
