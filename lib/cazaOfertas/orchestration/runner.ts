/**
 * CazaOfertasss — FASE 4. CazaPipelineRunner.
 *
 * Un ciclo = una ejecución bounded e idempotente que coordina ports
 * existentes. El runner no contiene lógica de negocio: ninguna decisión de
 * precio, validez, score, identidad, monetización o estado de publicación
 * vive aquí.
 *
 * Concurrencia ×N sin duplicados: no hay sleeps ni locks propios. Las
 * autoridades son las de persistencia existentes:
 *   - candidatos    → upsertAtomic (CAS / mutex por identity_key)
 *   - publicaciones → saveIdempotent (unique publication_id)
 *   - envíos        → claimForSend (lease) + saveClaimed (condicional al owner)
 *
 * El orchestrator no habla HTTP con Telegram: sólo `processPublication` con el
 * bot port inyectado.
 */

import type { DealCandidateRepository } from '../dedupe';
import { stableHash } from '../identity';
import { assertCazaOfertasMoneyUntouched } from '../safety';
import type { CazaTelegramBotPort } from '../telegram/botPort';
import type { TelegramCanaryGate } from '../telegram/canary';
import type { DealPublicationRepository } from '../tracking/publication';
import {
  createNullAffiliateResolver,
  type AffiliateAttachmentResolver,
} from './affiliateResolver';
import { createCazaBudgetTracker, resolveCazaPipelineBudgets } from './budgets';
import type { DealDiscoverySource } from './discoverySource';
import { createCycleErrorSink, redactForObservability } from './observability';
import {
  createCycleCounters,
  runStage,
  stageAffiliate,
  stageDedupe,
  stageDiscover,
  stageEligibility,
  stageNormalize,
  stagePrepare,
  stagePublish,
  stageRecover,
  stageScore,
  stageValidate,
  type AttachedItem,
  type DedupedItem,
  type DiscoveredItem,
  type NormalizedItem,
  type ScoredItem,
  type StageContext,
  type ValidatedItem,
} from './stages';
import type {
  CazaClock,
  CazaCycleObserver,
  CazaDiscoverySourceReport,
  CazaPipelineCycleInput,
  CazaPipelineCycleResult,
  CazaPipelineRunner,
  CazaStageReport,
} from './types';

export interface CazaPipelineRunnerDeps {
  readonly sources: readonly DealDiscoverySource[];
  readonly candidateRepository: DealCandidateRepository;
  readonly publicationRepository: DealPublicationRepository;
  readonly bot: CazaTelegramBotPort;
  /** `null` ⇒ PREPARE/PUBLISH se saltan fail-closed (gate no disponible). */
  readonly gate: TelegramCanaryGate | null;
  readonly telegramChannel: string;
  /** Default: resolver nulo (nunca monetiza). */
  readonly affiliateResolver?: AffiliateAttachmentResolver;
  readonly observer?: CazaCycleObserver;
  /** Reloj inyectable: budgets y duraciones deterministas en tests. */
  readonly clock?: CazaClock;
  /** Identidad del proceso runner; forma parte del lease owner. */
  readonly runnerId?: string;
}

const CYCLE_ID_PATTERN = /^[A-Za-z0-9_.:-]{4,96}$/;

function resolveCycleId(input: CazaPipelineCycleInput, startedAt: Date): string {
  const requested = input.cycleId?.trim();
  if (requested && CYCLE_ID_PATTERN.test(requested)) return requested;
  return `caza_cycle_${input.mode}_${stableHash(`${input.mode}|${startedAt.toISOString()}`)}`;
}

function sanitizeRunnerId(raw: string | undefined): string {
  const cleaned = (raw ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  if (cleaned.length >= 4) return cleaned;
  return `runner_${stableHash(`${Date.now()}|${Math.random()}`)}`;
}

function runsDiscovery(mode: CazaPipelineCycleInput['mode']): boolean {
  return mode === 'discovery' || mode === 'full';
}

function runsRecovery(mode: CazaPipelineCycleInput['mode']): boolean {
  return mode === 'recovery' || mode === 'publication_drain' || mode === 'full';
}

function runsPublish(mode: CazaPipelineCycleInput['mode']): boolean {
  return mode === 'publication_drain' || mode === 'full';
}

export function createCazaPipelineRunner(deps: CazaPipelineRunnerDeps): CazaPipelineRunner {
  const clock: CazaClock = deps.clock ?? (() => new Date());
  const resolver = deps.affiliateResolver ?? createNullAffiliateResolver();
  const runnerId = sanitizeRunnerId(deps.runnerId);
  const observer = deps.observer ?? null;

  return {
    async runCycle(input) {
      assertCazaOfertasMoneyUntouched();

      const startedAt = clock();
      const cycleId = resolveCycleId(input, startedAt);
      const budgets = resolveCazaPipelineBudgets(input.budgets);
      const budget = createCazaBudgetTracker(budgets, clock, startedAt.getTime());
      const errors = createCycleErrorSink();
      const counters = createCycleCounters();
      const reports: CazaStageReport[] = [];
      const sourceReports: CazaDiscoverySourceReport[] = [];

      const ctx: StageContext = {
        cycleId,
        now: startedAt,
        clock,
        budget,
        errors,
        counters,
        reports,
        observer,
      };

      const leaseOwner = `${runnerId}_${stableHash(cycleId)}`;

      try {
        if (runsDiscovery(input.mode)) {
          const discovered = await runStage<DiscoveredItem[]>(ctx, 'DISCOVER', [], (rec) =>
            stageDiscover(ctx, rec, deps.sources, input, sourceReports)
          );
          const normalized = await runStage<NormalizedItem[]>(ctx, 'NORMALIZE', [], async (rec) =>
            stageNormalize(ctx, rec, discovered)
          );
          const validated = await runStage<ValidatedItem[]>(ctx, 'VALIDATE', [], async (rec) =>
            stageValidate(ctx, rec, normalized)
          );
          const scored = await runStage<ScoredItem[]>(ctx, 'SCORE', [], async (rec) =>
            stageScore(ctx, rec, validated)
          );
          const attached = await runStage<AttachedItem[]>(ctx, 'AFFILIATE', [], (rec) =>
            stageAffiliate(ctx, rec, scored, resolver)
          );
          const deduped = await runStage<DedupedItem[]>(ctx, 'DEDUPE', [], (rec) =>
            stageDedupe(ctx, rec, attached, deps.candidateRepository)
          );
          const eligible = await runStage(ctx, 'ELIGIBILITY', [], async (rec) =>
            stageEligibility(ctx, rec, deduped)
          );
          await runStage(ctx, 'PREPARE_PUBLICATION', undefined, (rec) =>
            stagePrepare(
              ctx,
              rec,
              eligible,
              deps.publicationRepository,
              deps.gate,
              deps.telegramChannel
            )
          );
        }

        // RECOVER y PUBLISH son independientes de discovery: un fallo arriba
        // no impide drenar PREPARED existentes.
        if (runsRecovery(input.mode)) {
          await runStage(ctx, 'RECOVER', 0, (rec) =>
            stageRecover(ctx, rec, deps.publicationRepository)
          );
        }
        if (runsPublish(input.mode)) {
          await runStage(ctx, 'PUBLISH', undefined, (rec) =>
            stagePublish(ctx, rec, deps.publicationRepository, deps.bot, deps.gate, leaseOwner)
          );
        }
      } catch (e) {
        // runStage ya aísla; esto sólo cubre fallos fuera de un stage.
        counters.failed += 1;
        errors.push({
          stage: 'CYCLE',
          code: 'cycle.exception',
          message: redactForObservability(e),
          sourceId: null,
          identityKey: null,
        });
      }

      const finishedAt = clock();
      // Última lectura: si el tiempo se agotó justo al final, queda reflejado.
      budget.timeExhausted();

      const result: CazaPipelineCycleResult = {
        cycleId,
        mode: input.mode,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        discovered: counters.discovered,
        validated: counters.validated,
        rejected: counters.rejected,
        scored: counters.scored,
        deduplicated: counters.deduplicated,
        affiliateEligible: counters.affiliateEligible,
        prepared: counters.prepared,
        published: counters.published,
        retried: counters.retried,
        recovered: counters.recovered,
        failed: counters.failed,
        skipped: counters.skipped,
        errors: errors.all(),
        stages: reports,
        sources: sourceReports,
        budgetsExhausted: budget.exhausted(),
        budgets,
      };

      try {
        observer?.onCycle?.(result);
      } catch {
        // El observer nunca puede romper el ciclo.
      }
      return result;
    },
  };
}
