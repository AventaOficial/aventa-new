/**
 * CazaOfertasss — FASE 4. Stages del pipeline.
 *
 * Cada stage es una función bounded, observable y fail-closed que COMPONE
 * autoridades existentes:
 *   NORMALIZE   → validation.parseWithSchema + identity.buildDealIdentity
 *   VALIDATE    → candidate.buildDealCandidate (sin attachment)
 *   SCORE       → lectura de DealScore.grade (scoring.ts ya decidió)
 *   AFFILIATE   → AffiliateAttachmentResolver + candidate.buildDealCandidate (con attachment)
 *   DEDUPE      → DealCandidateRepository.upsertAtomic (CAS / mutex por clave)
 *   ELIGIBILITY → publication.evaluatePublicationEligibility
 *   PREPARE     → publication.preparePublication (saveIdempotent)
 *   RECOVER     → DealPublicationRepository.recoverExpiredLeases
 *   PUBLISH     → publication.processPublication (claimForSend → bot port → saveClaimed)
 *
 * Nota de orden: AFFILIATE corre ANTES de DEDUPE porque `buildDealCandidate`
 * recibe el attachment como input y `mergeDealCandidate` compara
 * `affiliateUrl`/`status`. Adjuntar después del upsert exigiría un segundo
 * upsert por candidato y un bump de `revision` en cada replay.
 *
 * Un fallo en un ítem o stage no toca estados anteriores: los stages sólo
 * escriben vía las autoridades de persistencia (upsertAtomic, saveIdempotent,
 * claimForSend/saveClaimed), todas idempotentes o condicionales.
 */

import { assessAffiliateEligibility } from '../affiliate';
import { buildDealCandidate } from '../candidate';
import type { DealCandidateRepository, DealUpsertAction } from '../dedupe';
import { buildDealIdentity, dealCandidateIdFromIdentity } from '../identity';
import { evaluatePublicationEligibility } from '../publication/eligibility';
import { preparePublication, processPublication } from '../publication/outbox';
import type { CazaTelegramBotPort } from '../telegram/botPort';
import type { TelegramCanaryGate } from '../telegram/canary';
import type { DealPublicationRepository } from '../tracking/publication';
import type { DealCandidate, DealCandidateDraft, DealIdentity } from '../types';
import { dealCandidateDraftSchema, parseWithSchema } from '../validation';
import type { AffiliateAttachmentResolver } from './affiliateResolver';
import { mapBounded } from './bounded';
import type { CazaBudgetTracker } from './budgets';
import {
  isCapabilityUnsupportedResult,
  type DealDiscoverySource,
} from './discoverySource';
import {
  createStageRecorder,
  redactForObservability,
  type CycleErrorSink,
  type StageRecorder,
} from './observability';
import type {
  CazaClock,
  CazaCycleObserver,
  CazaDiscoverySourceReport,
  CazaPipelineCycleInput,
  CazaPipelineStage,
  CazaStageReport,
} from './types';

// ---------------------------------------------------------------------------
// Contexto compartido de un ciclo
// ---------------------------------------------------------------------------

export interface CycleCounters {
  discovered: number;
  validated: number;
  rejected: number;
  scored: number;
  deduplicated: number;
  affiliateEligible: number;
  prepared: number;
  published: number;
  retried: number;
  recovered: number;
  failed: number;
  skipped: number;
}

export function createCycleCounters(): CycleCounters {
  return {
    discovered: 0,
    validated: 0,
    rejected: 0,
    scored: 0,
    deduplicated: 0,
    affiliateEligible: 0,
    prepared: 0,
    published: 0,
    retried: 0,
    recovered: 0,
    failed: 0,
    skipped: 0,
  };
}

export interface StageContext {
  readonly cycleId: string;
  /** Reloj de dominio del ciclo: fijo en startedAt (determinismo intra-ciclo). */
  readonly now: Date;
  /** Reloj real: budgets y duraciones. */
  readonly clock: CazaClock;
  readonly budget: CazaBudgetTracker;
  readonly errors: CycleErrorSink;
  readonly counters: CycleCounters;
  readonly reports: CazaStageReport[];
  readonly observer: CazaCycleObserver | null;
}

const BUDGET_TIME_REASON = 'budget.execution_ms_exhausted';
const BUDGET_CANDIDATES_REASON = 'budget.candidates_exhausted';
const BUDGET_PUBLICATIONS_REASON = 'budget.publications_exhausted';
const BUDGET_SENDS_REASON = 'budget.telegram_sends_exhausted';
const GATE_UNAVAILABLE_REASON = 'publication.gate_unavailable';

/**
 * Ejecuta un stage con recorder + aislamiento de excepciones. Si el stage
 * lanza, se registra el error y se devuelve `fallback`; el ciclo continúa.
 */
export async function runStage<T>(
  ctx: StageContext,
  stage: CazaPipelineStage,
  fallback: T,
  fn: (rec: StageRecorder) => Promise<T>
): Promise<T> {
  const rec = createStageRecorder(ctx.cycleId, stage, ctx.clock);
  let value = fallback;
  try {
    value = await fn(rec);
  } catch (e) {
    rec.failed([`${stage.toLowerCase()}.stage_exception`]);
    ctx.counters.failed += 1;
    ctx.errors.push({
      stage,
      code: `${stage.toLowerCase()}.stage_exception`,
      message: redactForObservability(e),
      sourceId: null,
      identityKey: null,
    });
  }
  const report = rec.finish();
  ctx.reports.push(report);
  try {
    ctx.observer?.onStage?.(report);
  } catch {
    // El observer nunca puede romper el ciclo.
  }
  return value;
}

// ---------------------------------------------------------------------------
// Tipos de ítem entre stages
// ---------------------------------------------------------------------------

export interface DiscoveredItem {
  readonly sourceId: string;
  readonly draft: DealCandidateDraft;
}

export interface NormalizedItem extends DiscoveredItem {
  readonly identity: DealIdentity;
  readonly dealId: string;
}

export interface ValidatedItem extends NormalizedItem {
  /** Candidato ensamblado sin attachment. */
  readonly base: DealCandidate;
}

export interface ScoredItem extends ValidatedItem {
  readonly rejectedByScore: boolean;
}

export interface AttachedItem extends ScoredItem {
  /** Candidato final (con attachment si resultó monetizable). */
  readonly candidate: DealCandidate;
}

export interface DedupedItem {
  readonly sourceId: string;
  readonly candidate: DealCandidate;
  readonly action: DealUpsertAction;
}

// ---------------------------------------------------------------------------
// DISCOVER
// ---------------------------------------------------------------------------

export async function stageDiscover(
  ctx: StageContext,
  rec: StageRecorder,
  sources: readonly DealDiscoverySource[],
  input: CazaPipelineCycleInput,
  sourceReports: CazaDiscoverySourceReport[]
): Promise<DiscoveredItem[]> {
  const items: DiscoveredItem[] = [];
  if (sources.length === 0) return items;

  const perSourceCap = Math.max(
    1,
    Math.floor(ctx.budget.budgets.MAX_DISCOVERY_PER_RUN / sources.length)
  );

  for (const source of sources) {
    let cursor: string | null = input.cursors?.[source.sourceId] ?? null;
    let got = 0;
    let pages = 0;
    let observedAt: string | null = null;
    let outcome: CazaDiscoverySourceReport['outcome'] | null = null;

    if (ctx.budget.remaining('MAX_DISCOVERY_PER_RUN') === 0) {
      rec.skipped(['budget.discovery_exhausted']);
      outcome = 'skipped_budget';
    } else if (ctx.budget.timeExhausted()) {
      rec.skipped([BUDGET_TIME_REASON]);
      outcome = 'skipped_budget';
    }

    while (outcome === null && got < perSourceCap) {
      const want = Math.min(
        ctx.budget.budgets.MAX_DISCOVERY_PAGE_SIZE,
        perSourceCap - got,
        ctx.budget.remaining('MAX_DISCOVERY_PER_RUN')
      );
      if (want <= 0) break;

      let page;
      try {
        page = await source.discover({ limit: want, cursor, since: input.since ?? null });
      } catch (e) {
        outcome = 'failed';
        rec.failed(['discovery.source_exception']);
        ctx.counters.failed += 1;
        ctx.errors.push({
          stage: 'DISCOVER',
          code: 'discovery.source_exception',
          message: redactForObservability(e),
          sourceId: source.sourceId,
          identityKey: null,
        });
        break;
      }
      pages += 1;

      if (!page.ok) {
        if (isCapabilityUnsupportedResult(page)) {
          outcome = 'unsupported';
          rec.skipped(page.reasons);
        } else {
          outcome = 'failed';
          rec.failed(page.reasons);
          ctx.counters.failed += 1;
          ctx.errors.push({
            stage: 'DISCOVER',
            code: page.reasons[0] ?? 'discovery.source_failed',
            message: page.reasons.join(','),
            sourceId: source.sourceId,
            identityKey: null,
          });
        }
        break;
      }

      // Defensa: una fuente que ignore `limit` no rompe el budget.
      const accepted = page.value.items.slice(0, want);
      if (accepted.length > 0) {
        ctx.budget.consume('MAX_DISCOVERY_PER_RUN', accepted.length);
        for (const draft of accepted) items.push({ sourceId: source.sourceId, draft });
        got += accepted.length;
        rec.input(accepted.length);
        rec.success(accepted.length);
      }
      observedAt = page.value.observedAt;
      cursor = page.value.nextCursor;
      if (cursor === null || accepted.length === 0) break;
      if (ctx.budget.timeExhausted()) break;
    }

    sourceReports.push({
      sourceId: source.sourceId,
      outcome: outcome ?? (got === 0 ? 'empty' : 'ok'),
      discovered: got,
      pages,
      nextCursor: cursor,
      observedAt,
    });
  }

  ctx.counters.discovered = items.length;
  return items;
}

// ---------------------------------------------------------------------------
// NORMALIZE
// ---------------------------------------------------------------------------

export function stageNormalize(
  ctx: StageContext,
  rec: StageRecorder,
  discovered: readonly DiscoveredItem[]
): NormalizedItem[] {
  const out: NormalizedItem[] = [];
  for (const item of discovered) {
    rec.input();
    if (!ctx.budget.consume('MAX_CANDIDATES_PER_RUN')) {
      rec.skipped([BUDGET_CANDIDATES_REASON]);
      ctx.counters.skipped += 1;
      continue;
    }
    if (ctx.budget.timeExhausted()) {
      rec.skipped([BUDGET_TIME_REASON]);
      ctx.counters.skipped += 1;
      continue;
    }
    const parsed = parseWithSchema(dealCandidateDraftSchema, item.draft);
    if (!parsed.ok) {
      rec.rejected(parsed.reasons);
      ctx.counters.rejected += 1;
      continue;
    }
    const identity = buildDealIdentity({
      store: parsed.value.store,
      url: parsed.value.url,
      externalProductId: parsed.value.externalProductId ?? null,
    });
    if (!identity.ok) {
      rec.rejected(identity.reasons);
      ctx.counters.rejected += 1;
      continue;
    }
    rec.success();
    out.push({
      ...item,
      identity: identity.value,
      dealId: dealCandidateIdFromIdentity(identity.value),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// VALIDATE
// ---------------------------------------------------------------------------

export function stageValidate(
  ctx: StageContext,
  rec: StageRecorder,
  normalized: readonly NormalizedItem[]
): ValidatedItem[] {
  const out: ValidatedItem[] = [];
  for (const item of normalized) {
    rec.input();
    if (ctx.budget.timeExhausted()) {
      rec.skipped([BUDGET_TIME_REASON]);
      ctx.counters.skipped += 1;
      continue;
    }
    const built = buildDealCandidate(item.draft, { now: ctx.now, affiliate: null });
    if (!built.ok) {
      rec.rejected(built.reasons);
      ctx.counters.rejected += 1;
      continue;
    }
    rec.success();
    ctx.counters.validated += 1;
    out.push({ ...item, base: built.value });
  }
  return out;
}

// ---------------------------------------------------------------------------
// SCORE
// ---------------------------------------------------------------------------

export function stageScore(
  ctx: StageContext,
  rec: StageRecorder,
  validated: readonly ValidatedItem[]
): ScoredItem[] {
  const out: ScoredItem[] = [];
  for (const item of validated) {
    rec.input();
    const score = item.base.score;
    if (score.grade === 'REJECT') {
      rec.rejected(['score.grade_reject', ...score.gatesFailed.map((g) => `score.gate:${g}`)]);
      ctx.counters.rejected += 1;
      out.push({ ...item, rejectedByScore: true });
      continue;
    }
    rec.success();
    rec.reason(`score.grade:${score.grade}`);
    ctx.counters.scored += 1;
    out.push({ ...item, rejectedByScore: false });
  }
  return out;
}

// ---------------------------------------------------------------------------
// AFFILIATE
// ---------------------------------------------------------------------------

export async function stageAffiliate(
  ctx: StageContext,
  rec: StageRecorder,
  scored: readonly ScoredItem[],
  resolver: AffiliateAttachmentResolver
): Promise<AttachedItem[]> {
  return mapBounded(scored, ctx.budget.budgets.MAX_STAGE_CONCURRENCY, async (item) => {
    // Los REJECT no se monetizan: pasan tal cual a DEDUPE para persistir su estado.
    if (item.rejectedByScore) return { ...item, candidate: item.base };

    rec.input();
    if (ctx.budget.timeExhausted()) {
      rec.skipped([BUDGET_TIME_REASON]);
      return { ...item, candidate: item.base };
    }

    let resolved;
    try {
      resolved = await resolver.resolve({
        identity: item.identity,
        dealId: item.dealId,
        canonicalUrl: item.base.canonicalUrl,
        now: ctx.now.toISOString(),
      });
    } catch (e) {
      // Fail-closed: excepción del resolver ⇒ sin attachment. No es fallo del ciclo.
      rec.rejected(['affiliate.resolver_exception']);
      ctx.errors.push({
        stage: 'AFFILIATE',
        code: 'affiliate.resolver_exception',
        message: redactForObservability(e),
        sourceId: item.sourceId,
        identityKey: item.identity.key,
      });
      return { ...item, candidate: item.base };
    }

    if (!resolved.ok) {
      rec.rejected(resolved.reasons);
      return { ...item, candidate: item.base };
    }

    const withAffiliate = buildDealCandidate(item.draft, {
      now: ctx.now,
      affiliate: resolved.value,
    });
    if (!withAffiliate.ok) {
      rec.rejected(withAffiliate.reasons);
      return { ...item, candidate: item.base };
    }
    if (withAffiliate.value.status !== 'PUBLICATION_READY') {
      const eligibility = assessAffiliateEligibility({
        identity: item.identity,
        canonicalUrl: item.base.canonicalUrl,
        attachment: resolved.value,
      });
      rec.rejected(eligibility.reasons);
      return { ...item, candidate: withAffiliate.value };
    }

    rec.success();
    ctx.counters.affiliateEligible += 1;
    return { ...item, candidate: withAffiliate.value };
  });
}

// ---------------------------------------------------------------------------
// DEDUPE
// ---------------------------------------------------------------------------

export async function stageDedupe(
  ctx: StageContext,
  rec: StageRecorder,
  attached: readonly AttachedItem[],
  repository: DealCandidateRepository
): Promise<DedupedItem[]> {
  const results = await mapBounded(
    attached,
    ctx.budget.budgets.MAX_STAGE_CONCURRENCY,
    async (item): Promise<DedupedItem | null> => {
      rec.input();
      if (ctx.budget.timeExhausted()) {
        rec.skipped([BUDGET_TIME_REASON]);
        ctx.counters.skipped += 1;
        return null;
      }
      try {
        const outcome = await repository.upsertAtomic(item.candidate);
        rec.success();
        rec.reason(`dedupe.${outcome.action}`);
        if (outcome.action !== 'created') ctx.counters.deduplicated += 1;
        return { sourceId: item.sourceId, candidate: outcome.candidate, action: outcome.action };
      } catch (e) {
        rec.failed(['dedupe.upsert_exception']);
        ctx.counters.failed += 1;
        ctx.errors.push({
          stage: 'DEDUPE',
          code: 'dedupe.upsert_exception',
          message: redactForObservability(e),
          sourceId: item.sourceId,
          identityKey: item.identity.key,
        });
        return null;
      }
    }
  );

  // Colapso intra-lote: dos drafts con la misma identidad ⇒ un solo candidato
  // hacia ELIGIBILITY (gana la última observación, ya fusionada por el repo).
  const byKey = new Map<string, DedupedItem>();
  for (const r of results) {
    if (r === null) continue;
    byKey.set(r.candidate.identity.key, r);
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// ELIGIBILITY
// ---------------------------------------------------------------------------

export function stageEligibility(
  ctx: StageContext,
  rec: StageRecorder,
  deduped: readonly DedupedItem[]
): DealCandidate[] {
  const out: DealCandidate[] = [];
  for (const item of deduped) {
    if (item.candidate.status === 'REJECTED') continue;
    rec.input();
    const e = evaluatePublicationEligibility(item.candidate);
    if (!e.eligible) {
      rec.rejected(e.reasons);
      ctx.counters.skipped += 1;
      continue;
    }
    rec.success();
    out.push(item.candidate);
  }
  return out;
}

// ---------------------------------------------------------------------------
// PREPARE_PUBLICATION
// ---------------------------------------------------------------------------

export async function stagePrepare(
  ctx: StageContext,
  rec: StageRecorder,
  eligible: readonly DealCandidate[],
  repository: DealPublicationRepository,
  gate: TelegramCanaryGate | null,
  telegramChannel: string
): Promise<void> {
  for (const candidate of eligible) {
    rec.input();
    if (gate === null) {
      rec.skipped([GATE_UNAVAILABLE_REASON]);
      ctx.counters.skipped += 1;
      continue;
    }
    if (ctx.budget.timeExhausted()) {
      rec.skipped([BUDGET_TIME_REASON]);
      ctx.counters.skipped += 1;
      continue;
    }
    if (ctx.budget.remaining('MAX_PUBLICATIONS_PER_RUN') === 0) {
      ctx.budget.consume('MAX_PUBLICATIONS_PER_RUN'); // marca agotado
      rec.skipped([BUDGET_PUBLICATIONS_REASON]);
      ctx.counters.skipped += 1;
      continue;
    }
    try {
      const r = await preparePublication(repository, {
        candidate,
        telegramChannel,
        now: ctx.now,
        gate,
      });
      switch (r.outcome) {
        case 'prepared':
          ctx.budget.consume('MAX_PUBLICATIONS_PER_RUN');
          ctx.counters.prepared += 1;
          rec.success();
          rec.reason('prepare.inserted');
          break;
        case 'already_prepared':
        case 'already_published':
          ctx.counters.skipped += 1;
          rec.skipped(r.reasons);
          break;
        case 'rejected':
          ctx.counters.skipped += 1;
          rec.rejected(r.reasons);
          break;
      }
    } catch (e) {
      rec.failed(['prepare.exception']);
      ctx.counters.failed += 1;
      ctx.errors.push({
        stage: 'PREPARE_PUBLICATION',
        code: 'prepare.exception',
        message: redactForObservability(e),
        sourceId: null,
        identityKey: candidate.identity.key,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// RECOVER
// ---------------------------------------------------------------------------

export async function stageRecover(
  ctx: StageContext,
  rec: StageRecorder,
  repository: DealPublicationRepository
): Promise<number> {
  rec.input();
  const recovered = await repository.recoverExpiredLeases(
    ctx.now,
    ctx.budget.budgets.MAX_RECOVERY_PER_RUN
  );
  rec.success(recovered);
  ctx.counters.recovered += recovered;
  return recovered;
}

// ---------------------------------------------------------------------------
// PUBLISH
// ---------------------------------------------------------------------------

export async function stagePublish(
  ctx: StageContext,
  rec: StageRecorder,
  repository: DealPublicationRepository,
  bot: CazaTelegramBotPort,
  gate: TelegramCanaryGate | null,
  leaseOwner: string
): Promise<void> {
  if (gate === null) {
    rec.skipped([GATE_UNAVAILABLE_REASON]);
    return;
  }
  const limit = ctx.budget.remaining('MAX_TELEGRAM_SENDS_PER_RUN');
  if (limit === 0) {
    rec.skipped([BUDGET_SENDS_REASON]);
    return;
  }
  const due = await repository.listDueForSend(limit, ctx.now);

  for (const record of due) {
    rec.input();
    if (ctx.budget.timeExhausted()) {
      rec.skipped([BUDGET_TIME_REASON]);
      ctx.counters.skipped += 1;
      continue;
    }
    if (!ctx.budget.consume('MAX_TELEGRAM_SENDS_PER_RUN')) {
      rec.skipped([BUDGET_SENDS_REASON]);
      ctx.counters.skipped += 1;
      continue;
    }
    try {
      const r = await processPublication({
        publicationId: record.publicationId,
        repository,
        bot,
        gate,
        leaseOwner,
        now: ctx.now,
      });
      switch (r.outcome) {
        case 'published':
          ctx.counters.published += 1;
          rec.success();
          rec.reason('publish.published');
          break;
        case 'retry_scheduled':
          ctx.counters.retried += 1;
          rec.reason(r.reasons[0] ?? 'publish.retry_scheduled');
          break;
        case 'failed':
          ctx.counters.failed += 1;
          rec.failed(r.reasons);
          ctx.errors.push({
            stage: 'PUBLISH',
            code: r.reasons[0] ?? 'publish.failed',
            message: r.record?.lastErrorCode ?? 'publication failed',
            sourceId: null,
            identityKey: record.publicationId,
          });
          break;
        default:
          ctx.counters.skipped += 1;
          rec.skipped(r.reasons);
          break;
      }
    } catch (e) {
      rec.failed(['publish.exception']);
      ctx.counters.failed += 1;
      ctx.errors.push({
        stage: 'PUBLISH',
        code: 'publish.exception',
        message: redactForObservability(e),
        sourceId: null,
        identityKey: record.publicationId,
      });
    }
  }
}
