import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  scoreIngestCandidate,
  type ScoreBreakdown,
  type ScoreDecision,
} from '@/lib/bots/ingest/scoreIngestCandidate';
import { shouldAutoApproveWorkerCandidate } from '@/lib/bots/ingest/workerAutoApprove';
import {
  checkAvailability,
  checkDiscount,
  checkDuplicateKnown,
  checkPrice,
  checkQuality,
  checkRisk,
  checkSeller,
  checkUrl,
  emptyChecks,
  hasSuspiciousDiscountGap,
} from './checks';
import { recordDealVerifierResult } from './metrics';
import { confidenceForDecision } from './thresholds';
import type {
  DealVerifierChecks,
  DealVerifierDecision,
  DealVerifierResult,
} from './types';

export type EvaluateDealOptions = {
  meta: ParsedOfferMetadata;
  config: BotIngestConfig;
  source: string;
  /** URL cruda del candidato (fallback si meta.canonicalUrl falta). */
  url?: string;
  /** Si ya se resolvió dedupe positivo. */
  duplicateOfferId?: string | null;
  /**
   * true = se ejecutó un pre-check real de duplicados (aunque no haya match).
   * Si se omite / false → duplicate check = unknown (no pass).
   */
  duplicateChecked?: boolean;
  /**
   * Activa upgrade de auto-approve del worker (card-only).
   * Usar en processExternalWorkerBatch.
   */
  enableWorkerAutoApprove?: boolean;
};

function mapIngestDecision(d: DealVerifierDecision): ScoreDecision {
  if (d === 'auto_approve') return 'auto_approve';
  if (d === 'reject') return 'reject';
  return 'pending';
}

function collectReasons(
  checks: DealVerifierChecks,
  scoreDecision: ScoreDecision,
  scoreTotal: number,
  config: BotIngestConfig,
  extras: string[]
): string[] {
  const reasons: string[] = [...extras];
  for (const key of Object.keys(checks) as Array<keyof DealVerifierChecks>) {
    const c = checks[key];
    if (c.status === 'fail' || c.status === 'warn') {
      reasons.push(c.detail);
    }
  }
  if (!Number.isFinite(scoreTotal)) {
    // already in extras as invalid_score
  } else if (scoreDecision === 'reject') {
    reasons.push(`Score ${scoreTotal} < mínimo de publicación (${config.rejectBelowScore})`);
  } else if (scoreDecision === 'pending') {
    reasons.push(
      `Score ${scoreTotal} entre reject (${config.rejectBelowScore}) y auto-approve (${config.autoApproveMinScore}) → revisión`
    );
  } else {
    reasons.push(`Score ${scoreTotal} ≥ umbral auto-approve (${config.autoApproveMinScore})`);
  }
  return reasons;
}

function hasCriticalFail(checks: DealVerifierChecks): boolean {
  return (
    checks.quality.status === 'fail' ||
    checks.price.status === 'fail' ||
    checks.discount.status === 'fail' ||
    checks.duplicate.status === 'fail'
  );
}

function buildChecks(opts: EvaluateDealOptions): DealVerifierChecks {
  const { meta, config, source, url, duplicateOfferId, duplicateChecked } = opts;
  const urlCheck = checkUrl(meta, url ?? meta.canonicalUrl ?? '');
  const quality = checkQuality(meta, config);
  const qualityMerged =
    urlCheck.status === 'fail'
      ? { status: 'fail' as const, detail: urlCheck.detail }
      : quality;

  return {
    price: checkPrice(meta),
    discount: checkDiscount(meta, config),
    duplicate: checkDuplicateKnown({ duplicateOfferId, duplicateChecked }),
    seller: checkSeller(meta, source),
    availability: checkAvailability(),
    quality: qualityMerged,
    risk: checkRisk(meta),
  };
}

/**
 * Bloquea auto-approve (y worker upgrade) cuando hay señales duras de FASE 3.1.
 */
function mustNotAutoApprove(opts: {
  invalidScore: boolean;
  artificial: boolean;
  suspiciousGap: boolean;
  autoApproveEnabled: boolean;
}): boolean {
  return (
    opts.invalidScore ||
    opts.artificial ||
    opts.suspiciousGap ||
    !opts.autoApproveEnabled
  );
}

/**
 * Evalúa un candidato de forma determinista (sin LLM).
 * Deal Verifier tiene la última palabra sobre auto_approve.
 */
export function evaluateDeal(opts: EvaluateDealOptions): DealVerifierResult {
  const { meta, config, enableWorkerAutoApprove } = opts;
  const checks = buildChecks(opts);
  const critical = hasCriticalFail(checks);
  const artificial = Boolean(meta.signals?.suspectedArtificialListPrice);
  const suspiciousGap = hasSuspiciousDiscountGap(meta);

  const scored = scoreIngestCandidate(meta, meta.signals, config);
  const scoreTotal = scored.breakdown.total;
  const invalidScore = !Number.isFinite(scoreTotal);
  const extras: string[] = [];

  let decision: DealVerifierDecision;

  if (critical) {
    decision = 'reject';
  } else if (invalidScore) {
    decision = 'review';
    extras.push('invalid_score');
  } else {
    decision =
      scored.decision === 'auto_approve'
        ? 'auto_approve'
        : scored.decision === 'reject'
          ? 'reject'
          : 'review';

    // Artificial: jamás auto; preferir review sobre reject si no hay critical.
    if (artificial) {
      if (decision === 'auto_approve' || decision === 'reject') {
        decision = 'review';
        extras.push('artificial_list_price: forzar revisión (no auto-approve)');
      }
    }

    // Gap card vs effective: no auto-approve; preferir review.
    if (suspiciousGap) {
      if (decision === 'auto_approve' || decision === 'reject') {
        decision = 'review';
        extras.push('suspicious_discount_gap: forzar revisión (no auto-approve)');
      }
    }

    if (decision === 'auto_approve' && !config.autoApproveEnabled) {
      decision = 'review';
      extras.push('Auto-approve deshabilitado en config → cola de revisión');
    }

    // Worker upgrade: solo desde review, y nunca con invalid/artificial/gap.
    if (
      enableWorkerAutoApprove &&
      decision === 'review' &&
      !mustNotAutoApprove({
        invalidScore,
        artificial,
        suspiciousGap,
        autoApproveEnabled: config.autoApproveEnabled,
      })
    ) {
      const allow = shouldAutoApproveWorkerCandidate({
        config,
        decision: scored.decision,
        scoreTotal,
        meta,
      });
      if (allow && Number.isFinite(scoreTotal)) {
        decision = 'auto_approve';
        extras.push('Upgrade worker: score/descuento/imagen/URL cumplen auto-approve de card');
      }
    }
  }

  // Guardrail final: nada de lo bloqueante puede quedar en auto_approve.
  if (
    decision === 'auto_approve' &&
    mustNotAutoApprove({
      invalidScore,
      artificial,
      suspiciousGap,
      autoApproveEnabled: config.autoApproveEnabled,
    })
  ) {
    decision = critical ? 'reject' : 'review';
    extras.push('auto_approve_blocked: invalid_score|artificial|gap|disabled');
  }

  if (!Number.isFinite(scoreTotal) && decision === 'auto_approve') {
    decision = 'review';
    extras.push('invalid_score');
  }

  const safeScore = Number.isFinite(scoreTotal) ? scoreTotal : 0;
  const reasons = collectReasons(
    checks,
    invalidScore ? 'pending' : scored.decision,
    safeScore,
    config,
    extras
  );

  const result: DealVerifierResult = {
    decision,
    score: safeScore,
    confidence: confidenceForDecision(decision, scoreTotal),
    reasons,
    checks,
    breakdown: {
      ...scored.breakdown,
      total: safeScore,
    },
    ingestDecision: mapIngestDecision(decision),
    duplicateOfferId: opts.duplicateOfferId ?? null,
  };

  recordDealVerifierResult(result);
  return result;
}

/**
 * Fail closed: cualquier excepción → reject explicable.
 */
export function evaluateDealSafe(opts: EvaluateDealOptions): DealVerifierResult {
  try {
    return evaluateDeal(opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const breakdown: ScoreBreakdown = {
      discount: 0,
      popularity: 0,
      rating: 0,
      category: 0,
      priceAppeal: 0,
      historical: 0,
      total: 0,
    };
    const result: DealVerifierResult = {
      decision: 'reject',
      score: 0,
      confidence: 0,
      reasons: [`Error interno del verifier (fail closed): ${message}`],
      checks: emptyChecks(),
      breakdown,
      ingestDecision: 'reject',
      duplicateOfferId: opts.duplicateOfferId ?? null,
    };
    recordDealVerifierResult(result);
    return result;
  }
}
