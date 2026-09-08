import {
  assessOfferAffiliateLink,
  storeHasAffiliateProgram,
} from '@/lib/affiliate/assessOfferAffiliateLink';

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

/**
 * Evaluación pura (sin métricas). Misma regla que computeMonetizationReadiness.
 * El Decision Engine la usa en shadow para no contaminar contadores de Focus.
 */
export function evaluateMonetizationReadiness(
  input: MonetizationReadinessInput
): MonetizationReadinessResult {
  const offerUrl = (input.offerUrl ?? '').trim();
  const original = (input.originalOfferUrl ?? '').trim();
  const probe = offerUrl || original;

  if (!probe) {
    return {
      status: 'unknown',
      label: 'No disponible',
      detail: 'No hay información suficiente.',
    };
  }

  const hasProgram = storeHasAffiliateProgram(probe);
  if (!hasProgram) {
    return {
      status: 'no_program',
      label: 'Sin programa',
      detail: 'Esta tienda no tiene programa afiliado configurado.',
    };
  }

  const assessment = assessOfferAffiliateLink(offerUrl || probe);
  const prepared = input.linkModOk === true || assessment.isTagged;

  if (prepared) {
    return {
      status: 'ready',
      label: 'Lista',
      detail: 'Aventa puede monetizar este enlace.',
    };
  }

  return {
    status: 'needs_attention',
    label: 'Requiere atención',
    detail: 'No se pudo preparar el enlace monetizado.',
  };
}

/**
 * Estado humano de preparación de monetización.
 * No inventa programas: reutiliza storeHasAffiliateProgram / assessOfferAffiliateLink.
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
  if (
    msg.includes('afiliad') ||
    msg.includes('link_mod') ||
    msg.includes('valida y guarda') ||
    msg.includes('tag de aventa') ||
    msg.includes('enlace')
  ) {
    return 'Falta preparar el enlace para Aventa.';
  }
  return raw?.trim() || 'No se pudo aprobar la oferta.';
}
