import type { DealCheckResult, DealCheckStatus } from '@/lib/verifier/types';
import {
  AUTONOMOUS_DECISION_POLICY_V1,
  AUTONOMOUS_POLICY_V1,
} from './policy';
import type {
  AutonomousDecision,
  AutonomousDecisionChecks,
  AutonomousDecisionInput,
  AutonomousDecisionResult,
  AutonomousEngineCheck,
} from './types';

function asCheck(key: string, status: DealCheckStatus, detail: string): AutonomousEngineCheck {
  return { key, status, detail };
}

function fromVerifier(key: string, c: DealCheckResult): AutonomousEngineCheck {
  return { key, status: c.status, detail: c.detail };
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function hasCriticalVerifierFail(input: AutonomousDecisionInput): boolean {
  const c = input.verifier.checks;
  return (
    c.quality.status === 'fail' ||
    c.price.status === 'fail' ||
    c.discount.status === 'fail' ||
    c.duplicate.status === 'fail'
  );
}

function imageCheck(input: AutonomousDecisionInput): AutonomousEngineCheck {
  const url = (input.imageUrl ?? '').trim();
  const missing = !url || url === AUTONOMOUS_POLICY_V1.placeholderImage;
  if (!missing) return asCheck('image', 'pass', 'Imagen presente');
  if (!input.thresholds.requireImage) {
    return asCheck('image', 'pass', 'Imagen no exigida por config');
  }
  return asCheck('image', 'warn', 'Imagen ausente o placeholder');
}

function monetizationCheck(input: AutonomousDecisionInput): AutonomousEngineCheck {
  const s = input.monetization.status;
  if (s === 'ready') return asCheck('monetization', 'pass', input.monetization.detail);
  if (s === 'no_program') {
    return asCheck('monetization', 'pass', 'Sin programa afiliado — no bloquea (política actual)');
  }
  if (s === 'needs_attention') {
    return asCheck('monetization', 'warn', input.monetization.detail);
  }
  return asCheck('monetization', 'unknown', input.monetization.detail);
}

function affiliateCheck(input: AutonomousDecisionInput): AutonomousEngineCheck {
  if (!input.requiresAffiliateValidation) {
    return asCheck('affiliate', 'pass', 'No requiere validación afiliada');
  }
  if (input.monetization.status === 'ready') {
    return asCheck('affiliate', 'pass', 'Enlace afiliado listo');
  }
  if (input.monetization.status === 'needs_attention') {
    return asCheck('affiliate', 'warn', 'Programa existe y el enlace no está listo');
  }
  return asCheck('affiliate', 'unknown', 'Requisito afiliado sin estado listo');
}

function sourceHealthCheck(input: AutonomousDecisionInput): AutonomousEngineCheck {
  const h = input.sourceHealth;
  if (h == null) return asCheck('sourceHealth', 'unknown', 'Salud de fuente desconocida');
  if (h === 'healthy') return asCheck('sourceHealth', 'pass', 'Fuente saludable');
  if (h === 'degraded') return asCheck('sourceHealth', 'warn', 'Fuente degradada');
  if (h === 'down') return asCheck('sourceHealth', 'warn', 'Fuente down');
  return asCheck('sourceHealth', 'warn', 'Fuente disabled');
}

function sellerCheck(input: AutonomousDecisionInput): AutonomousEngineCheck {
  const store = (input.store ?? '').trim();
  if (!store) return asCheck('seller', 'unknown', 'Tienda/vendedor desconocido');
  return fromVerifier('seller', input.verifier.checks.seller);
}

function moderationCheck(input: AutonomousDecisionInput): AutonomousEngineCheck {
  const status = (input.existingModerationStatus ?? '').trim().toLowerCase();
  if (!status || status === 'pending') {
    return asCheck('moderation', 'pass', 'Sin bloqueo de moderación');
  }
  if (status === 'rejected' || status === 'expired' || status === 'deleted') {
    return asCheck('moderation', 'warn', `Estado de moderación existente: ${status}`);
  }
  if (status === 'approved' || status === 'published') {
    return asCheck('moderation', 'warn', `Oferta ya ${status}`);
  }
  return asCheck('moderation', 'unknown', `Estado de moderación no reconocido: ${status}`);
}

function contradictionCheck(input: AutonomousDecisionInput): AutonomousEngineCheck {
  const v = input.verifier;
  const critical = hasCriticalVerifierFail(input);
  const score = v.score;
  const min = input.thresholds.autoApproveMinScore;
  const notes: string[] = [];

  if (v.decision === 'auto_approve' && critical) {
    notes.push('verifier auto_approve con check crítico en fail');
  }
  if (v.decision === 'auto_approve' && input.suspectedArtificialListPrice) {
    notes.push('verifier auto_approve con precio de lista artificial');
  }
  if (
    v.decision === 'reject' &&
    !critical &&
    isFiniteNumber(score) &&
    score >= min
  ) {
    notes.push('verifier reject con score de auto-approve y sin fail crítico');
  }
  if (v.decision === 'auto_approve' && isFiniteNumber(score) && score < min) {
    notes.push('verifier auto_approve con score bajo el umbral');
  }
  if (v.decision === 'auto_approve' && v.checks.risk.status === 'warn') {
    notes.push('verifier auto_approve con riesgo warn');
  }

  if (notes.length === 0) return asCheck('contradictions', 'pass', 'Sin contradicciones');
  return asCheck('contradictions', 'warn', notes.join('; '));
}

function scoreValue(input: AutonomousDecisionInput): number | null {
  return isFiniteNumber(input.verifier.score) ? input.verifier.score : null;
}

function confidenceValue(input: AutonomousDecisionInput): number {
  return isFiniteNumber(input.verifier.confidence) ? input.verifier.confidence : 0;
}

function buildChecks(input: AutonomousDecisionInput): AutonomousDecisionChecks {
  const v = input.verifier;
  const score = scoreValue(input);
  const confidence = input.verifier.confidence;
  const minScore = input.thresholds.autoApproveMinScore;
  const minConf = AUTONOMOUS_POLICY_V1.minAutoApproveConfidence;
  const critical = hasCriticalVerifierFail(input);

  let scoreCheck: AutonomousEngineCheck;
  if (score == null) {
    scoreCheck = asCheck('score', 'unknown', 'Score no finito (NaN/Infinity/ausente)');
  } else if (score >= minScore) {
    scoreCheck = asCheck('score', 'pass', `Score ${score} ≥ ${minScore}`);
  } else {
    scoreCheck = asCheck('score', 'warn', `Score ${score} < umbral auto-approve ${minScore}`);
  }

  let confCheck: AutonomousEngineCheck;
  if (!isFiniteNumber(confidence)) {
    confCheck = asCheck('confidence', 'unknown', 'Confidence no finita');
  } else if (confidence >= minConf) {
    confCheck = asCheck('confidence', 'pass', `Confidence ${confidence} ≥ ${minConf}`);
  } else {
    confCheck = asCheck('confidence', 'warn', `Confidence ${confidence} < ${minConf}`);
  }

  return {
    verifierDecision: asCheck(
      'verifierDecision',
      v.decision === 'auto_approve' ? 'pass' : v.decision === 'reject' ? 'warn' : 'warn',
      `Deal Verifier: ${v.decision}`
    ),
    score: scoreCheck,
    confidence: confCheck,
    critical: critical
      ? asCheck('critical', 'fail', 'Fail crítico en quality/price/discount/duplicate')
      : asCheck('critical', 'pass', 'Sin fail crítico del verifier'),
    duplicate: input.shadowDuplicate
      ? asCheck('duplicate', input.shadowDuplicate.status, input.shadowDuplicate.detail)
      : fromVerifier('duplicate', v.checks.duplicate),
    price: fromVerifier('price', v.checks.price),
    discount: fromVerifier('discount', v.checks.discount),
    quality: fromVerifier('quality', v.checks.quality),
    image: imageCheck(input),
    seller: sellerCheck(input),
    availability: fromVerifier('availability', v.checks.availability),
    risk: fromVerifier('risk', v.checks.risk),
    monetization: monetizationCheck(input),
    affiliate: affiliateCheck(input),
    sourceHealth: sourceHealthCheck(input),
    moderation: moderationCheck(input),
    contradictions: contradictionCheck(input),
  };
}

function autoRejectReasons(checks: AutonomousDecisionChecks): string[] {
  const reasons: string[] = [];
  if (checks.quality.status === 'fail') reasons.push(checks.quality.detail);
  if (checks.duplicate.status === 'fail') reasons.push(checks.duplicate.detail);
  if (checks.price.status === 'fail') reasons.push(checks.price.detail);
  if (checks.discount.status === 'fail') reasons.push(checks.discount.detail);
  if (checks.risk.status === 'fail') reasons.push(checks.risk.detail);
  if (checks.availability.status === 'fail') reasons.push(checks.availability.detail);
  if (checks.seller.status === 'fail') reasons.push(checks.seller.detail);
  if (checks.critical.status === 'fail' && reasons.length === 0) {
    reasons.push(checks.critical.detail);
  }
  return reasons;
}

function reviewReasons(
  input: AutonomousDecisionInput,
  checks: AutonomousDecisionChecks
): string[] {
  const reasons: string[] = [];
  const v = input.verifier;

  if (checks.score.status === 'unknown') reasons.push(checks.score.detail);
  else if (checks.score.status === 'warn') reasons.push(checks.score.detail);

  if (checks.confidence.status === 'unknown' || checks.confidence.status === 'warn') {
    reasons.push(checks.confidence.detail);
  }

  if (v.decision !== 'auto_approve') {
    reasons.push(`Deal Verifier no auto-aprueba (${v.decision})`);
  }
  if (!input.thresholds.autoApproveEnabled) {
    reasons.push('Auto-approve deshabilitado en config');
  }
  if (checks.duplicate.status !== 'pass' && checks.duplicate.status !== 'fail') {
    reasons.push(checks.duplicate.detail);
  }
  if (checks.risk.status === 'warn' || checks.risk.status === 'unknown') {
    reasons.push(checks.risk.detail);
  }
  if (checks.quality.status === 'warn' || checks.quality.status === 'unknown') {
    reasons.push(checks.quality.detail);
  }
  if (checks.image.status === 'warn' || checks.image.status === 'unknown') {
    reasons.push(checks.image.detail);
  }
  if (checks.seller.status === 'warn' || checks.seller.status === 'unknown') {
    reasons.push(checks.seller.detail);
  }
  if (checks.availability.status === 'warn') {
    reasons.push(checks.availability.detail);
  }
  if (checks.monetization.status === 'warn' || checks.monetization.status === 'unknown') {
    reasons.push(checks.monetization.detail);
  }
  if (checks.affiliate.status === 'warn' || checks.affiliate.status === 'unknown') {
    reasons.push(checks.affiliate.detail);
  }
  if (checks.sourceHealth.status !== 'pass') {
    reasons.push(checks.sourceHealth.detail);
  }
  if (checks.moderation.status !== 'pass') {
    reasons.push(checks.moderation.detail);
  }
  if (checks.contradictions.status !== 'pass') {
    reasons.push(checks.contradictions.detail);
  }
  if (input.suspectedArtificialListPrice) {
    reasons.push('Price Intel: precio de lista artificial — no auto-aprobar');
  }

  return reasons;
}

function unique(list: string[]): string[] {
  return [...new Set(list.filter((r) => r.trim().length > 0))];
}

/**
 * Decide AUTO_APPROVE | HUMAN_REVIEW | AUTO_REJECT.
 * Puro y determinista. generatedAt no participa en la decisión.
 */
export function decideAutonomous(
  input: AutonomousDecisionInput,
  now: Date = new Date()
): AutonomousDecisionResult {
  const checks = buildChecks(input);
  const reject = unique(autoRejectReasons(checks));
  const review = unique(reviewReasons(input, checks));

  let decision: AutonomousDecision;
  let reasons: string[];

  if (reject.length > 0) {
    decision = 'AUTO_REJECT';
    reasons = reject;
  } else if (review.length > 0) {
    decision = 'HUMAN_REVIEW';
    reasons = review;
  } else {
    decision = 'AUTO_APPROVE';
    reasons = ['Todas las condiciones de seguridad V1 satisfechas'];
  }

  return {
    decision,
    confidence: confidenceValue(input),
    score: scoreValue(input),
    reasons,
    checks,
    policyVersion: AUTONOMOUS_DECISION_POLICY_V1,
    generatedAt: now.toISOString(),
  };
}
