import {
  evaluateAffiliateReadiness,
  type AffiliateReadinessResult,
} from '@/lib/moderation/affiliateReadinessContract';

export type MonetizationReadinessStatus =
  | 'ready'
  | 'needs_attention'
  | 'no_program'
  | 'unknown';

export type MonetizationReadinessResult = {
  status: MonetizationReadinessStatus;
  /** Etiqueta corta para UI. */
  label: string;
  /** Frase humana de apoyo. */
  detail: string;
  /** Motivo canónico (misma autoridad que approve). */
  readiness?: AffiliateReadinessResult;
};

export type MonetizationReadinessInput = {
  offerUrl?: string | null;
  originalOfferUrl?: string | null;
  linkModOk?: boolean | null;
};

const counters = {
  ready: 0,
  needs_attention: 0,
  no_program: 0,
  unknown: 0,
};

export function getMonetizationReadinessMetrics() {
  return {
    monetizationReady: counters.ready,
    monetizationNeedsAttention: counters.needs_attention,
    monetizationNoProgram: counters.no_program,
    monetizationUnknown: counters.unknown,
  };
}

export function resetMonetizationReadinessMetrics() {
  counters.ready = 0;
  counters.needs_attention = 0;
  counters.no_program = 0;
  counters.unknown = 0;
}

function bump(status: MonetizationReadinessStatus) {
  counters[status] += 1;
}

function toUiStatus(r: AffiliateReadinessResult): MonetizationReadinessStatus {
  if (r.source === 'empty_url' && !r.offerUrl && r.reason === 'ready_empty_url') {
    // Sin URLs: UI histórica "unknown"
    return 'unknown';
  }
  if (r.source === 'no_program') return 'no_program';
  if (r.ready) return 'ready';
  return 'needs_attention';
}

/**
 * Evaluación pura (sin métricas). Misma autoridad que approve.
 */
export function evaluateMonetizationReadiness(
  input: MonetizationReadinessInput
): MonetizationReadinessResult {
  const readiness = evaluateAffiliateReadiness({
    offerUrl: input.offerUrl,
    originalOfferUrl: input.originalOfferUrl,
    linkModOk: input.linkModOk,
  });
  const status = toUiStatus(readiness);
  return {
    status,
    label: readiness.label,
    detail: readiness.detail,
    readiness,
  };
}

/**
 * Estado humano de preparación de monetización.
 */
export function computeMonetizationReadiness(
  input: MonetizationReadinessInput
): MonetizationReadinessResult {
  const result = evaluateMonetizationReadiness(input);
  bump(result.status);
  return result;
}

/** Mensaje humano para errores de approve relacionados con afiliado. */
export function humanizeAffiliateApproveError(raw: string | null | undefined): string {
  const msg = (raw ?? '').toLowerCase();
  // No mapear errores de producto/lock/auth al CTA de preparar enlace.
  if (
    msg.includes('no corresponde al producto') ||
    msg.includes('producto válido') ||
    msg.includes('lock') ||
    msg.includes('reclam') ||
    msg.includes('moderada') ||
    msg.includes('otro usuario')
  ) {
    return raw?.trim() || 'No se pudo aprobar la oferta.';
  }
  if (
    msg.includes('valida y guarda') ||
    msg.includes('falta preparar') ||
    msg.includes('tag de aventa') ||
    msg.includes('permalink') ||
    msg.includes('navegable') ||
    msg.includes('link_mod') ||
    msg.includes('afiliad')
  ) {
    return 'Falta preparar el enlace para Aventa.';
  }
  return raw?.trim() || 'No se pudo aprobar la oferta.';
}
